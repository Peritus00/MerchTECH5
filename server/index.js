const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:8081', 
    'http://localhost:8080',
    'https://*.repl.co', 
    'https://*.replit.dev',
    /^https:\/\/.*\.replit\.dev$/,
    /^http:\/\/.*\.replit\.dev$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';
if (!process.env.JWT_SECRET) {
  console.log('WARNING: Using fallback JWT_SECRET. Set JWT_SECRET environment variable for production.');
}

// Email service configuration
let transporter = null;

if (process.env.BREVO_API_KEY) {
  transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_EMAIL || 'noreply@merchtech.com',
      pass: process.env.BREVO_API_KEY
    }
  });
} else {
  console.log('WARNING: BREVO_API_KEY not set. Email functionality will be limited.');
  // Create a test transporter for development
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: 'test@example.com', 
      pass: 'test'
    }
  });
}

// Cleanup expired pending users
async function cleanupExpiredPendingUsers() {
  try {
    const result = await pool.query(
      'DELETE FROM pending_users WHERE expires_at < NOW()'
    );
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} expired pending users`);
    }
  } catch (error) {
    console.error('Error cleaning up expired pending users:', error);
  }
}

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create all necessary tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100),
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        verification_token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100),
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_email_verified BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE,
        subscription_tier VARCHAR(50) DEFAULT 'free',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Handle developer fallback token
  if (token === 'dev_jwt_token_djjetfuel_12345') {
    req.user = {
      id: 1,
      email: 'djjetfuel@gmail.com',
      username: 'djjetfuel',
      isAdmin: true
    };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Root route handler
app.get('/', (req, res) => {
  res.json({ 
    message: 'MerchTech QR API Server', 
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      admin: '/api/admin/*',
      stripe: '/api/stripe/*'
    }
  });
});

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Query:`, req.query, '- Body:', req.body);
  next();
});

// Health check with database status
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    
    // Also check users count
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const pendingCount = await pool.query('SELECT COUNT(*) FROM pending_users');
    
    res.json({ 
      status: 'ok', 
      database: 'connected',
      users: parseInt(userCount.rows[0].count),
      pendingUsers: parseInt(pendingCount.rows[0].count),
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      timestamp: new Date().toISOString() 
    });
  }
});

// Stripe payment endpoints
app.post('/api/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, amount } = req.body;

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: req.user.email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.username,
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      customer: customer.id,
      setup_future_usage: 'off_session',
      metadata: {
        subscriptionTier,
        userId: req.user.id.toString()
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id
    });
  } catch (error) {
    console.error('Stripe payment intent error:', error);
    res.status(500).json({ message: 'Failed to create payment intent' });
  }
});

app.post('/api/stripe/process-payment', authenticateToken, async (req, res) => {
  try {
    const { clientSecret, paymentMethod, subscriptionTier } = req.body;

    // Get the payment intent
    const paymentIntentId = clientSecret.split('_secret_')[0];
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent || !paymentIntent.customer) {
        return res.status(400).json({ success: false, error: 'Invalid Payment Intent' });
    }

    // Create payment method
    const stripePaymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: paymentMethod.card,
      billing_details: paymentMethod.billing_details
    });

    // Attach payment method to customer
    await stripe.paymentMethods.attach(stripePaymentMethod.id, {
      customer: paymentIntent.customer
    });

    // Confirm payment intent
    const confirmedPayment = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: stripePaymentMethod.id
    });

    if (confirmedPayment.status === 'succeeded') {
      // Create subscription for recurring billing
      const subscription = await stripe.subscriptions.create({
        customer: paymentIntent.customer,
        items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} Plan`
            },
            unit_amount: paymentIntent.amount,
            recurring: {
              interval: 'month'
            }
          }
        }],
        default_payment_method: stripePaymentMethod.id
      });

      res.json({
        success: true,
        customerId: paymentIntent.customer,
        subscriptionId: subscription.id,
        paymentIntentId: confirmedPayment.id
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Payment failed'
      });
    }
  } catch (error) {
    console.error('Stripe process payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment processing failed'
    });
  }
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        username: user.username,
        isAdmin: user.is_admin 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isEmailVerified: user.is_email_verified,
        isAdmin: user.is_admin,
        subscriptionTier: user.subscription_tier,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username, firstName, lastName } = req.body;

    console.log('Registration attempt for:', { email, username });

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT email, username FROM pending_users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      if (user.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (user.username === username) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const existingUserInUsers = await pool.query(
        'SELECT email, username FROM users WHERE email = $1 OR username = $2',
        [email, username]
    );

    if (existingUserInUsers.rows.length > 0) {
        const user = existingUserInUsers.rows[0];
        if (user.email === email) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        if (user.username === username) {
            return res.status(400).json({ error: 'Username already taken' });
        }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = jwt.sign({ email, type: 'verification' }, JWT_SECRET, { expiresIn: '24h' });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Store in pending_users
    const newPendingUser = await pool.query(
      `INSERT INTO pending_users (email, username, password_hash, first_name, last_name, verification_token, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, email, username, first_name, last_name`,
      [email, username, passwordHash, firstName, lastName, verificationToken, expiresAt]
    );

    console.log('Pending user created:', newPendingUser.rows[0]);

    // Send verification email
    try {
      const verificationUrl = `${process.env.APP_URL || 'http://localhost:8081'}/auth/verify-email?token=${verificationToken}`;

      await transporter.sendMail({
        from: process.env.FROM_EMAIL || 'noreply@merchtech.com',
        to: email,
        subject: 'Verify Your MerchTech Account',
        html: `
          <h2>Welcome to MerchTech!</h2>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px;">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
        `
      });

      res.status(201).json({
        message: 'Registration successful! Please verify your email.',
        requiresVerification: true
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email verification endpoint
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Find pending user
    const pendingResult = await pool.query(
      'SELECT * FROM pending_users WHERE verification_token = $1 AND expires_at > NOW()',
      [token]
    );

    if (pendingResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const pendingUser = pendingResult.rows[0];

    // Move user from pending_users to users table
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash, first_name, last_name, is_email_verified) 
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [pendingUser.email, pendingUser.username, pendingUser.password_hash, pendingUser.first_name, pendingUser.last_name]
    );

    const user = userResult.rows[0];

    // Remove from pending_users
    await pool.query('DELETE FROM pending_users WHERE id = $1', [pendingUser.id]);

    // Create JWT token for immediate login
    const authToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        username: user.username,
        isAdmin: user.is_admin 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isEmailVerified: user.is_email_verified,
        isAdmin: user.is_admin,
        subscriptionTier: user.subscription_tier,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token: authToken
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    const pendingResult = await pool.query(
      'SELECT * FROM pending_users WHERE email = $1',
      [email]
    );

    if (pendingResult.rows.length === 0) {
      return res.status(404).json({ error: 'No pending registration found for this email' });
    }

    const pendingUser = pendingResult.rows[0];
    const newToken = jwt.sign({ email, type: 'verification' }, JWT_SECRET, { expiresIn: '24h' });
    const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update token
    await pool.query(
      'UPDATE pending_users SET verification_token = $1, expires_at = $2 WHERE email = $3',
      [newToken, newExpiresAt, email]
    );

    // Send verification email
    try {
      const verificationUrl = `${process.env.APP_URL || 'http://localhost:8081'}/auth/verify-email?token=${newToken}`;

      await transporter.sendMail({
        from: process.env.FROM_EMAIL || 'noreply@merchtech.com',
        to: email,
        subject: 'Verify Your MerchTech Account',
        html: `
          <h2>Welcome to MerchTech!</h2>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px;">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
        `
      });

      res.json({ message: 'Verification email sent successfully' });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User management routes
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT id, email, username, first_name, last_name, 
             is_admin, subscription_tier, created_at, updated_at
      FROM users ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users including pending ones (admin only)
app.get('/api/admin/all-users', authenticateToken, async (req, res) => {
  try {
    console.log('=== ADMIN ALL-USERS ENDPOINT HIT ===');
    console.log('Admin users request from user:', req.user);
    console.log('User isAdmin:', req.user.isAdmin);
    console.log('User username:', req.user.username);
    
    if (!req.user.isAdmin && req.user.username !== 'djjetfuel') {
      console.log('Access denied - not admin or djjetfuel');
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get confirmed users from users table
    const confirmedUsers = await pool.query(`
      SELECT id, email, username, first_name, last_name, 
             is_admin, subscription_tier, created_at, updated_at,
             'confirmed' as status,
             false as is_pending,
             false as is_suspended
      FROM users ORDER BY created_at DESC
    `);

    console.log('Confirmed users found:', confirmedUsers.rows.length);
    console.log('Confirmed users:', confirmedUsers.rows.map(u => ({ id: u.id, email: u.email, username: u.username })));

    // Get pending users from pending_users table
    const pendingUsers = await pool.query(`
      SELECT id, email, username, first_name, last_name,
             false as is_admin, 'free' as subscription_tier, 
             created_at, created_at as updated_at,
             'pending' as status, expires_at,
             true as is_pending,
             false as is_suspended
      FROM pending_users ORDER BY created_at DESC
    `);

    console.log('Pending users found:', pendingUsers.rows.length);
    console.log('Pending users:', pendingUsers.rows.map(u => ({ id: u.id, email: u.email, username: u.username })));

    // Combine results and transform to match frontend expectations
    const allUsers = [
      ...confirmedUsers.rows.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username || user.email?.split('@')[0] || 'Unknown',
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: user.is_admin || false,
        subscriptionTier: user.subscription_tier || 'free',
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        status: 'confirmed',
        isPending: false,
        isSuspended: false
      })),
      ...pendingUsers.rows.map(user => ({
        id: `pending_${user.id}`, // Ensure unique IDs between tables
        email: user.email,
        username: user.username || user.email?.split('@')[0] || 'Unknown',
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: false,
        subscriptionTier: 'free',
        createdAt: user.created_at,
        updatedAt: user.created_at,
        status: 'pending',
        isPending: true,
        isSuspended: false,
        expiresAt: user.expires_at
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log('Total users being returned:', allUsers.length);
    console.log('Final user list:', allUsers.map(u => ({ 
      id: u.id, 
      email: u.email, 
      username: u.username, 
      status: u.status,
      isPending: u.isPending 
    })));
    
    res.json(allUsers);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (admin only) - checks both users and pending_users tables
app.delete('/api/admin/users/:identifier', authenticateToken, async (req, res) => {
  try {
    console.log('Delete user request from:', req.user);
    console.log('User identifier to delete:', req.params.identifier);
    
    if (!req.user.isAdmin && req.user.username !== 'djjetfuel') {
      console.log('Delete access denied - not admin or djjetfuel');
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { identifier } = req.params;
    let deletedFrom = [];
    let deletedUser = null;

    console.log('Attempting to delete user with identifier:', identifier);

    // First check if user exists before deleting
    const checkUserResult = await pool.query(
      'SELECT id, email, username FROM users WHERE id = $1 OR email = $2 OR username = $3',
      [isNaN(identifier) ? null : parseInt(identifier), identifier, identifier]
    );

    const checkPendingResult = await pool.query(
      'SELECT id, email, username FROM pending_users WHERE id = $1 OR email = $2 OR username = $3',
      [isNaN(identifier) ? null : parseInt(identifier), identifier, identifier]
    );

    console.log('Found in users table:', checkUserResult.rowCount);
    console.log('Found in pending_users table:', checkPendingResult.rowCount);

    // Try to delete from users table first (by ID or email or username)
    const userResult = await pool.query(
      'DELETE FROM users WHERE id = $1 OR email = $2 OR username = $3 RETURNING id, email, username',
      [isNaN(identifier) ? null : parseInt(identifier), identifier, identifier]
    );

    if (userResult.rowCount > 0) {
      deletedFrom.push('users');
      deletedUser = userResult.rows[0];
      console.log(`Deleted user from users table: ${deletedUser.email} (ID: ${deletedUser.id})`);
    }

    // Try to delete from pending_users table (by ID or email or username)
    const pendingResult = await pool.query(
      'DELETE FROM pending_users WHERE id = $1 OR email = $2 OR username = $3 RETURNING id, email, username',
      [isNaN(identifier) ? null : parseInt(identifier), identifier, identifier]
    );

    if (pendingResult.rowCount > 0) {
      deletedFrom.push('pending_users');
      deletedUser = pendingResult.rows[0];
      console.log(`Deleted user from pending_users table: ${deletedUser.email} (ID: ${deletedUser.id})`);
    }

    if (deletedFrom.length === 0) {
      console.log('No user found to delete with identifier:', identifier);
      return res.status(404).json({ error: 'User not found in any table' });
    }

    console.log('Successfully deleted user from:', deletedFrom.join(', '));
    res.json({ 
      message: `User deleted successfully from: ${deletedFrom.join(', ')}`,
      deletedFrom,
      deletedUser,
      success: true
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Protected route example
app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Protected route to get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT id, email, username, first_name, last_name, is_email_verified, subscription_tier, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      isEmailVerified: user.is_email_verified,
      subscriptionTier: user.subscriptionTier,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update user subscription
app.put('/api/user/subscription', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, stripeCustomerId, stripeSubscriptionId } = req.body;
    const userId = req.user.id;

    await pool.query(
      'UPDATE users SET subscription_tier = $1, stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [subscriptionTier, stripeCustomerId, stripeSubscriptionId, userId]
    );

    res.json({ message: 'Subscription updated successfully' });
  } catch (error) {
    console.error('Subscription update error:', error);
    res.status(500).json({ message: 'Failed to update subscription' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at: http://0.0.0.0:${PORT}/api`);
  console.log(`External API URL: https://${process.env.REPLIT_DEV_DOMAIN}/api`);
  console.log('Available routes:');
  console.log('  GET /api/health');
  console.log('  GET /api/admin/all-users');
  console.log('  DELETE /api/admin/users/:identifier');
  await initializeDatabase();
  
  // Start periodic cleanup of expired pending users (every hour)
  setInterval(cleanupExpiredPendingUsers, 60 * 60 * 1000);
  
  // Run initial cleanup
  await cleanupExpiredPendingUsers();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});