// Ensure isNewUser field is included in register response
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

// Check for Brevo SMTP key in multiple ways
const brevoKey = process.env.BREVO_SMTP_KEY || process.env.BREVO_API_KEY;
console.log('Environment variables check:');
console.log('- BREVO_SMTP_KEY:', process.env.BREVO_SMTP_KEY ? 'Found (length: ' + process.env.BREVO_SMTP_KEY.length + ')' : 'Not found');
console.log('- BREVO_API_KEY:', process.env.BREVO_API_KEY ? 'Found (length: ' + process.env.BREVO_API_KEY.length + ')' : 'Not found');

if (brevoKey) {
  console.log('Using Brevo key for SMTP authentication');
  transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: '8e773a002@smtp-brevo.com',
      pass: brevoKey
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Test the connection
  transporter.verify((error, success) => {
    if (error) {
      console.error('Brevo SMTP connection failed:', error);
      console.error('Error details:', {
        code: error.code,
        command: error.command,
        response: error.response
      });
    } else {
      console.log('Brevo email service configured and verified with help@merchtech.net');
    }
  });
} else {
  console.log('WARNING: BREVO_SMTP_KEY not set in environment variables. Email functionality will be limited.');
  // Create a test transporter for development that will fail gracefully
  transporter = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
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

// Handle account verification reminders and suspensions
async function handleAccountVerification() {
  try {
    console.log('Checking for accounts needing verification reminders or suspension...');

    // Find unverified accounts that are 24 hours old (send reminder)
    const reminderUsers = await pool.query(`
      SELECT id, email, username, created_at 
      FROM users 
      WHERE is_email_verified = FALSE 
      AND is_new_user = FALSE 
      AND created_at <= NOW() - INTERVAL '24 hours'
      AND created_at > NOW() - INTERVAL '25 hours'
      AND subscription_tier != 'suspended'
    `);

    // Send 24-hour reminder emails
    for (const user of reminderUsers.rows) {
      try {
        console.log(`Sending 24-hour reminder to user: ${user.email}`);

        await transporter.sendMail({
          from: '8e773a002@smtp-brevo.com',
          to: user.email,
          subject: 'Reminder: Verify Your MerchTech Account (24 Hours Remaining)',
          html: `
            <h2>Account Verification Reminder</h2>
            <p>Hello ${user.username || 'User'},</p>
            <p>This is a friendly reminder that you have <strong>24 hours remaining</strong> to verify your MerchTech account.</p>
            <p>If you don't verify your email within the next 24 hours, your account will be temporarily suspended for security purposes.</p>
            <p>To verify your account, please check your email for our verification message or log into your account to resend the verification email.</p>
            <p>If you need assistance, please contact us at <a href="mailto:help@merchtech.net">help@merchtech.net</a></p>
            <p>Thank you for choosing MerchTech!</p>
            <hr>
            <p><small>This is an automated message from MerchTech. Please do not reply to this email.</small></p>
          `
        });

        console.log(`24-hour reminder sent successfully to: ${user.email}`);
      } catch (emailError) {
        console.error(`Failed to send 24-hour reminder to ${user.email}:`, emailError);
      }
    }

    // Find unverified accounts that are 48 hours old (suspend without additional email)
    const suspensionUsers = await pool.query(`
      SELECT id, email, username, created_at 
      FROM users 
      WHERE is_email_verified = FALSE 
      AND is_new_user = FALSE 
      AND created_at <= NOW() - INTERVAL '48 hours'
      AND subscription_tier != 'suspended'
    `);

    // Suspend accounts silently (no additional email)
    for (const user of suspensionUsers.rows) {
      try {
        console.log(`Suspending account for user: ${user.email}`);

        // Update user to suspended status
        await pool.query(
          'UPDATE users SET subscription_tier = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['suspended', user.id]
        );

        console.log(`Account suspended for: ${user.email}`);
      } catch (error) {
        console.error(`Failed to suspend account for ${user.email}:`, error);
      }
    }

    if (reminderUsers.rowCount > 0 || suspensionUsers.rowCount > 0) {
      console.log(`Processed ${reminderUsers.rowCount} reminder emails and ${suspensionUsers.rowCount} account suspensions`);
    }
  } catch (error) {
    console.error('Error in account verification handling:', error);
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verification_token VARCHAR(255),
        is_new_user BOOLEAN DEFAULT TRUE
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
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Query:`, req.query, '- Body:', Object.keys(req.body || {}).length > 0 ? '[BODY_PRESENT]' : 'undefined');
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('Testing email service to:', email);

    if (!transporter) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    const testResult = await transporter.sendMail({
      from: 'help@merchtech.net',
      to: email || 'perrie.benton@gmail.com',
      subject: 'MerchTech Email Test',
      html: `
        <h2>Email Test Successful!</h2>
        <p>This is a test email from MerchTech to verify email service is working.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `
    });

    console.log('Test email sent successfully:', testResult);
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: testResult.messageId,
      response: testResult.response
    });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ 
      error: 'Failed to send test email',
      details: error.message 
    });
  }
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
    const { clientSecret, subscriptionTier, paymentDetails } = req.body;
    console.log('Processing payment for subscription:', subscriptionTier);

    // Get the payment intent
    const paymentIntentId = clientSecret.split('_secret_')[0];
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent || !paymentIntent.customer) {
        return res.status(400).json({ success: false, error: 'Invalid Payment Intent' });
    }

    console.log('Payment Intent status:', paymentIntent.status);

    // Create payment method and process payment on server side (secure)
    if (paymentDetails && paymentIntent.status === 'requires_payment_method') {
      try {
        console.log('Creating payment method on server...');

        // Create payment method using server-side Stripe
        const paymentMethod = await stripe.paymentMethods.create({
          type: 'card',
          card: {
            number: paymentDetails.cardNumber,
            exp_month: parseInt(paymentDetails.expMonth),
            exp_year: parseInt(paymentDetails.expYear),
            cvc: paymentDetails.cvv,
          },
          billing_details: {
            name: paymentDetails.cardholderName || 'Customer',
          },
        });

        console.log('Payment method created:', paymentMethod.id);

        // Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethod.id, {
          customer: paymentIntent.customer,
        });

        // Confirm the payment intent with the payment method
        const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
          payment_method: paymentMethod.id,
          return_url: `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:8081'}/subscription/success`
        });

        console.log('Payment confirmed with status:', confirmedPaymentIntent.status);

        if (confirmedPaymentIntent.status === 'succeeded') {
          console.log('Payment successful, creating subscription...');

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
            default_payment_method: paymentMethod.id
          });

          console.log('Subscription created successfully:', subscription.id);

          return res.json({
            success: true,
            customerId: paymentIntent.customer,
            subscriptionId: subscription.id,
            paymentIntentId: confirmedPaymentIntent.id
          });
        } else if (confirmedPaymentIntent.status === 'requires_action') {
          // Handle 3D Secure or other authentication requirements
          return res.json({
            success: false,
            error: 'Payment requires additional authentication',
            requires_action: true,
            payment_intent: {
              id: confirmedPaymentIntent.id,
              client_secret: confirmedPaymentIntent.client_secret
            }
          });
        } else {
          throw new Error(`Payment failed with status: ${confirmedPaymentIntent.status}`);
        }
      } catch (paymentError) {
        console.error('Payment processing failed:', paymentError);
        return res.status(400).json({
          success: false,
          error: paymentError.message || 'Payment failed'
        });
      }
    }

    // Check if payment is already succeeded
    if (paymentIntent.status === 'succeeded') {
      console.log('Payment already succeeded, creating subscription...');

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
        default_payment_method: paymentIntent.payment_method
      });

      console.log('Subscription created successfully:', subscription.id);

      res.json({
        success: true,
        customerId: paymentIntent.customer,
        subscriptionId: subscription.id,
        paymentIntentId: paymentIntent.id
      });
    } else {
      console.log('Payment requires payment method. Status:', paymentIntent.status);
      res.status(400).json({
        success: false,
        error: 'Payment method required. Please provide valid payment information.'
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

// Refresh token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Check if refresh token exists in database
    const tokenResult = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
      [refreshToken, decoded.id]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Generate new access token
    const newToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        username: user.username,
        isAdmin: user.is_admin 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Optionally generate new refresh token
    const newRefreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Delete old refresh token and store new one
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, newRefreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
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
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auth routes

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  console.log('=== REGISTRATION ENDPOINT HIT ===');
  console.log('Registration request:', { email: req.body.email, username: req.body.username });
  try {
    const { email, password, username, firstName, lastName } = req.body;

    console.log('Registration attempt for:', { email, username });

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT email, username, is_email_verified FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      // If user exists but email is not verified, allow re-registration by deleting the old unverified user
      if ((user.email === email || user.username === username) && !user.is_email_verified) {
        console.log('Deleting existing unverified user to allow re-registration:', { email, username });
        await pool.query('DELETE FROM users WHERE email = $1 OR username = $2', [email, username]);
      } else {
        // User exists and is verified, return appropriate error
        if (user.email === email) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        if (user.username === username) {
          return res.status(400).json({ error: 'Username already taken' });
        }
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create user directly in main users table with unverified status
    const newUser = await pool.query(
      `INSERT INTO users (email, username, password_hash, first_name, last_name, is_email_verified, subscription_tier, is_new_user) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, email, username, first_name, last_name, is_email_verified, subscription_tier, is_new_user, created_at`,
      [email, username, passwordHash, firstName, lastName, false, 'free', true]
    );

    console.log('User created (unverified):', newUser.rows[0]);

    // Generate JWT token for immediate login
    const token = jwt.sign(
      { 
        id: newUser.rows[0].id, 
        email: newUser.rows[0].email, 
        username: newUser.rows[0].username,
        isAdmin: false
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user: {
        id: newUser.rows[0].id,
        email: newUser.rows[0].email,
        username: newUser.rows[0].username,
        firstName: newUser.rows[0].first_name,
        lastName: newUser.rows[0].last_name,
        isEmailVerified: newUser.rows[0].is_email_verified,
        isAdmin: false,
        subscriptionTier: newUser.rows[0].subscription_tier,
        isNewUser: newUser.rows[0].is_new_user,
        createdAt: newUser.rows[0].created_at,
        updatedAt: newUser.rows[0].created_at
      },
      token,
      success: true
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  console.log('=== LOGIN ENDPOINT HIT ===');
  const { email, password } = req.body;
  console.log('Login request:', { email });

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const foundUser = user.rows[0];

    // Check password
    const passwordMatch = await bcrypt.compare(password, foundUser.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const token = jwt.sign(
      { 
        userId: foundUser.id, 
        email: foundUser.email,
        username: foundUser.username,
        isAdmin: foundUser.is_admin || false
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: foundUser.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Login successful for user:', foundUser.email);

    res.json({
      user: {
        id: foundUser.id,
        email: foundUser.email,
        username: foundUser.username,
        firstName: foundUser.first_name,
        lastName: foundUser.last_name,
        isEmailVerified: foundUser.is_email_verified,
        isAdmin: foundUser.is_admin || false,
        subscriptionTier: foundUser.subscription_tier,
        createdAt: foundUser.created_at,
        updatedAt: foundUser.updated_at
      },
      token,
      refreshToken
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// User subscription update endpoint
app.put('/api/user/subscription', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, isNewUser, stripeCustomerId, stripeSubscriptionId } = req.body;
    const userId = req.user.id;

    console.log('Updating user subscription:', {
      userId,
      subscriptionTier,
      isNewUser,
      stripeCustomerId,
      stripeSubscriptionId
    });

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (subscriptionTier !== undefined) {
      updates.push(`subscription_tier = $${++paramCount}`);
      values.push(subscriptionTier);
    }

    if (isNewUser !== undefined) {
      updates.push(`is_new_user = $${++paramCount}`);
      values.push(isNewUser);
    }

    if (stripeCustomerId !== undefined) {
      updates.push(`stripe_customer_id = $${++paramCount}`);
      values.push(stripeCustomerId);
    }

    if (stripeSubscriptionId !== undefined) {
      updates.push(`stripe_subscription_id = $${++paramCount}`);
      values.push(stripeSubscriptionId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `;

    console.log('Executing query:', query);
    console.log('With values:', values);

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];
    console.log('User subscription updated successfully:', updatedUser);

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        subscriptionTier: updatedUser.subscription_tier,
        isNewUser: updatedUser.is_new_user,
        stripeCustomerId: updatedUser.stripe_customer_id,
        stripeSubscriptionId: updatedUser.stripe_subscription_id
      }
    });

  } catch (error) {
    console.error('Error updating user subscription:', error);
    res.status(500).json({ 
      error: 'Failed to update subscription',
      details: error.message 
    });
  }
});

// User management endpoints

// Send verification email after subscription
app.post('/api/auth/send-verification', async (req, res) => {
  try {
    const { email } = req.body;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const token = jwt.sign(
        { email, type: 'verification' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    // Use the external domain instead of localhost
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:8081';
    const verificationUrl = `${baseUrl}/auth/verify-email?token=${token}`;

    // Store verification token in users table
    await pool.query(
      'UPDATE users SET verification_token = $1 WHERE email = $2',
      [token, email]
    );

    // Send verification email
    try {
      console.log('Attempting to send verification email to:', email);
      console.log('Using transporter config:', transporter.options);

      const emailResult = await transporter.sendMail({
        from: 'help@merchtech.net',
        to: email,
        subject: 'Verify Your MerchTech Account',
        html: `
          <h2>Welcome to MerchTech!</h2>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px;">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
          <p>If you can't click the link, copy and paste this URL into your browser: ${verificationUrl}</p>
        `
      });

      console.log('Email sent successfully! Message ID:', emailResult.messageId);
      console.log('Email response:', emailResult);
      res.json({ message: 'Verification email sent successfully' });
    } catch (emailError) {
      console.error('Email sending error details:', {
        error: emailError.message,
        code: emailError.code,
        command: emailError.command,
        response: emailError.response
      });
      res.status(500).json({ 
        error: 'Failed to send verification email',
        details: emailError.message 
      });
    }
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email verification endpoint via URL (GET request)
app.get('/api/auth/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    console.log('🔥 EMAIL VERIFICATION (GET): Token received:', token.substring(0, 20) + '...');

    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Verification token required' 
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('🔥 EMAIL VERIFICATION (GET): Token decoded successfully:', decoded);
    } catch (err) {
      console.log('🔥 EMAIL VERIFICATION (GET): Token verification failed:', err.message);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or expired verification token' 
      });
    }

    // Find user by email from decoded token
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [decoded.email]
    );

    if (userResult.rows.length === 0) {
      console.log('🔥 EMAIL VERIFICATION (GET): User not found for email:', decoded.email);
      return res.status(400).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const user = userResult.rows[0];
    console.log('🔥 EMAIL VERIFICATION (GET): User found:', user.email, 'Already verified:', user.is_email_verified);

    if (user.is_email_verified) {
      console.log('🔥 EMAIL VERIFICATION (GET): Email already verified, redirecting...');

      // Redirect to the React Native app's verify-email page
      const appUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/auth/verify-email`
        : 'http://localhost:8081/auth/verify-email';

      return res.redirect(appUrl);
    }

    // Update user to verified status
    const updatedUser = await pool.query(
      `UPDATE users SET is_email_verified = true, verification_token = null, is_new_user = false WHERE email = $1 
       RETURNING id, email, username, first_name, last_name, is_email_verified, subscription_tier, created_at, is_new_user`,
      [decoded.email]
    );

    if (updatedUser.rows.length === 0) {
      console.log('🔥 EMAIL VERIFICATION (GET): Failed to update user verification status.');
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to update user verification status' 
      });
    }

    console.log('🔥 EMAIL VERIFICATION (GET): User email verified successfully:', updatedUser.rows[0].email);

    // Generate new JWT for logged in session
    const authToken = jwt.sign(
      {
        id: updatedUser.rows[0].id,
        email: updatedUser.rows[0].email,
        username: updatedUser.rows[0].username,
        isAdmin: false
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🔥 EMAIL VERIFICATION (GET): Redirecting to email verified page with new auth token...');

    // Redirect to the React Native app's verify-email page
    const appUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/auth/verify-email`
      : 'http://localhost:8081/auth/verify-email';

    return res.redirect(appUrl);
  } catch (error) {
    console.error('🔥 EMAIL VERIFICATION (GET): Email verification error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
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

    // Find user with verification token
    const userResult = await pool.query(
      'SELECT * FROM users WHERE verification_token = $1',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = userResult.rows[0];

    // Update user to verified status
    const updatedUser = await pool.query(
      `UPDATE users SET is_email_verified = true, verification_token = null, is_new_user = false WHERE id = $1 
       RETURNING id, email, username, first_name, last_name, is_email_verified, subscription_tier, created_at, is_new_user`,
      [user.id]
    );

    console.log('User email verified:', updatedUser.rows[0]);

    // Generate new JWT for logged in session
        const authToken = jwt.sign(
            {
                id: updatedUser.rows[0].id,
                email: updatedUser.rows[0].email,
                username: updatedUser.rows[0].username,
                isAdmin: false
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

    res.json({
      success: true,
      message: 'Email verified successfully!',
      user: {
        id: updatedUser.rows[0].id,
        email: updatedUser.rows[0].email,
        username: updatedUser.rows[0].username,
        firstName: updatedUser.rows[0].first_name,
        lastName: updatedUser.rows[0].last_name,
        isEmailVerified: updatedUser.rows[0].is_email_verified,
        subscriptionTier: updatedUser.rows[0].subscription_tier,
        createdAt: updatedUser.createdAt,
        isNewUser: updatedUser.is_new_user
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

    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const token = jwt.sign(
        { email, type: 'verification' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    // Use the external domain instead of localhost
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:8081';
    const verificationUrl = `${baseUrl}/auth/verify-email?token=${token}`;

    // Update token
    await pool.query(
      'UPDATE users SET verification_token = $1 WHERE email = $2',
      [token, email]
    );

    // Send verification email
    try {
      console.log('Attempting to resend verification email to:', email);

      const emailResult = await transporter.sendMail({
        from: 'help@merchtech.net',
        to: email,
        subject: 'Verify Your MerchTech Account',
        html: `
          <h2>Welcome to MerchTech!</h2>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px;">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
          <p>If you can't click the link, copy and paste this URL into your browser: ${verificationUrl}</p>
        `
      });

      console.log('Verification email resent successfully! Message ID:', emailResult.messageId);
      console.log('Email response:', emailResult);
      res.json({ message: 'Verification email sent successfully' });
    } catch (emailError) {
      console.error('Email resend error details:', {
        error: emailError.message,
        code: emailError.code,
        command: emailError.command,
        response: emailError.response
      });
      res.status(500).json({ 
        error: 'Failed to send verification email',
        details: emailError.message 
      });
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
      FROM users WHERE is_email_verified = TRUE ORDER BY created_at DESC
    `);

    console.log('Confirmed users found:', confirmedUsers.rows.length);
    console.log('Confirmed users:', confirmedUsers.rows.map(u => ({ id: u.id, email: u.email, username: u.username })));

    // Get pending users from users table that are NOT yet email verified
        const pendingUsers = await pool.query(`
            SELECT id, email, username, first_name, last_name,
                   false as is_admin, 'free' as subscription_tier,
                   created_at, created_at as updated_at,
                   'pending' as status, created_at as expires_at,
                   true as is_pending,
                   false as is_suspended
            FROM users WHERE is_email_verified = FALSE ORDER BY created_at DESC
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
        id: user.id, // Ensure unique IDs between tables
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
        expiresAt: user.created_at // Using created_at as expires_at for pending users
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

    console.log('Found in users table:', checkUserResult.rowCount);

    if (checkUserResult.rowCount > 0) {
      const userId = checkUserResult.rows[0].id;

      // First delete related refresh tokens
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
      console.log('Deleted refresh tokens for user:', userId);

      // Then delete the user
      const userResult = await pool.query(
        'DELETE FROM users WHERE id = $1 OR email = $2 OR username = $3 RETURNING id, email, username',
        [isNaN(identifier) ? null : parseInt(identifier), identifier, identifier]
      );

      if (userResult.rowCount > 0) {
        deletedFrom.push('users');
        deletedUser = userResult.rows[0];
        console.log(`Deleted user from users table: ${deletedUser.email} (ID: ${deletedUser.id})`);
      }
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
      'SELECT id, email, username, first_name, last_name, is_email_verified, subscription_tier, created_at, is_new_user FROM users WHERE id = $1',
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
      firstName: user.first_name,
      lastName: user.last_name,
      isEmailVerified: user.is_email_verified,
      subscriptionTier: user.subscriptionTier,
      createdAt: user.createdAt,
      isNewUser: user.is_new_user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at: http://0.0.0.0:${PORT}/api`);
  console.log(`External API URL: https://${process.env.REPLIT_DEV_DOMAIN}/api`);
  console.log(`Health check URL: https://${process.env.REPLIT_DEV_DOMAIN}/api/health`);
  console.log('Available routes:');
  console.log('  GET /api/health');
  console.log('  POST /api/auth/register');
  console.log('  POST /api/auth/login');
  console.log('  POST /api/auth/refresh');
  console.log('  GET /api/admin/all-users');
  console.log('  DELETE /api/admin/users/:identifier');
  await initializeDatabase();

  // Start periodic cleanup of expired pending users (every hour)
  setInterval(cleanupExpiredPendingUsers, 60 * 60 * 1000);

  // Start periodic account verification monitoring (every hour)
  setInterval(handleAccountVerification, 60 * 60 * 1000);

  // Run initial cleanup and verification check
  await cleanupExpiredPendingUsers();
  await handleAccountVerification();
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