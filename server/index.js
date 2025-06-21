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
  credentials: true
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

// Initialize database tables
async function initializeDatabase() {
  try {
    // Only create refresh_tokens table since main tables are handled by migrations
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

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Health check with database status
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
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

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, first_name, last_name) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [email, username, passwordHash, firstName, lastName]
    );

    const user = result.rows[0];

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

    res.status(201).json({
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
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
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

// Protected route example
app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Protected route to get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
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
  await initializeDatabase();
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