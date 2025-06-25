const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Stripe
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('✅ Stripe initialized successfully');
} else {
  console.warn('⚠️ Stripe not configured - STRIPE_SECRET_KEY missing');
}

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect()
  .then(() => console.log('✅ Database connected successfully'))
  .catch(err => console.error('❌ Database connection failed:', err));

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [`https://${process.env.REPLIT_DEV_DOMAIN}`, `https://${process.env.REPLIT_DEV_DOMAIN}:443`]
    : true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Authentication middleware
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

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// ==================== HEALTH CHECK ROUTES ====================

app.get('/api/health', async (req, res) => {
  try {
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const pendingCount = await pool.query('SELECT COUNT(*) FROM users WHERE "isEmailVerified" = false');

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

app.get('/api/stripe/health', (req, res) => {
  try {
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    const secretKeyValid = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_');
    const secretKeyType = process.env.STRIPE_SECRET_KEY ? 
      (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'test' : 
       process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'unknown') : 
      'none';

    res.json({
      stripeConfigured,
      secretKeyValid,
      secretKeyType,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stripe health check error:', error);
    res.status(503).json({ 
      error: 'Stripe health check failed',
      timestamp: new Date().toISOString() 
    });
  }
});

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (email, password, username) VALUES ($1, $2, $3) RETURNING id, email, username',
      [email, hashedPassword, username]
    );

    // Generate token
    const token = jwt.sign(
      { id: newUser.rows[0].id, email: newUser.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.rows[0].id, email: user.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.rows[0].id,
        email: user.rows[0].email,
        username: user.rows[0].username,
        subscriptionTier: user.rows[0].subscriptionTier,
        isNewUser: user.rows[0].isNewUser
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ==================== STRIPE ROUTES ====================

// Create payment intent
app.post('/api/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, amount } = req.body;

    if (!subscriptionTier || !amount) {
      return res.status(400).json({ error: 'Subscription tier and amount are required' });
    }

    // Create or retrieve customer
    let customer;
    try {
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
          metadata: {
            userId: req.user.userId?.toString() || req.user.id?.toString()
          }
        });
      }
    } catch (customerError) {
      console.error('Customer creation error:', customerError);
      return res.status(500).json({ error: 'Failed to create customer' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      customer: customer.id,
      metadata: {
        subscriptionTier,
        userId: req.user.userId?.toString() || req.user.id?.toString()
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent', details: error.message });
  }
});

// Create checkout session
app.post('/api/stripe/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, amount, successUrl, cancelUrl } = req.body;

    if (!subscriptionTier || !amount) {
      return res.status(400).json({ error: 'Subscription tier and amount are required' });
    }

    // Create or retrieve customer
    let customer;
    try {
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
          metadata: {
            userId: req.user.userId?.toString() || req.user.id?.toString()
          }
        });
      }
    } catch (customerError) {
      console.error('Customer creation error:', customerError);
      return res.status(500).json({ error: 'Failed to create customer' });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} Subscription`,
              description: `Monthly subscription to ${subscriptionTier} plan`
            },
            unit_amount: amount,
            recurring: {
              interval: 'month'
            }
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${req.headers.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.origin}/subscription`,
      metadata: {
        subscriptionTier,
        userId: req.user.userId?.toString() || req.user.id?.toString()
      }
    });

    res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error.message });
  }
});

// Update user subscription
app.put('/api/user/subscription', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, stripeCustomerId, stripeSubscriptionId, isNewUser } = req.body;

    if (!subscriptionTier) {
      return res.status(400).json({ error: 'Subscription tier is required' });
    }

    const userId = req.user.userId || req.user.id;

    // Update user in database
    const result = await pool.query(
      `UPDATE users 
       SET subscription_tier = $1, 
           is_new_user = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, email, username, subscription_tier, is_new_user`,
      [subscriptionTier, isNewUser !== undefined ? isNewUser : false, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        subscriptionTier: updatedUser.subscription_tier,
        isNewUser: updatedUser.is_new_user
      }
    });

  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription', details: error.message });
  }
});

// ==================== QR CODE ROUTES ====================

// ==================== USER MANAGEMENT ROUTES ====================

//app.put('/api/user/subscription', authenticateToken, async (req, res) => {
//  try {
//    const { subscriptionTier, isNewUser, stripeCustomerId, stripeSubscriptionId } = req.body;
//    const userId = req.user.id;
//
//    // Update user subscription in database
//    const updateQuery = `
//      UPDATE users 
//      SET 
//        "subscriptionTier" = $1,
//        "isNewUser" = $2,
//        "updatedAt" = CURRENT_TIMESTAMP
//      WHERE id = $3
//      RETURNING *
//    `;
//
//    const result = await pool.query(updateQuery, [subscriptionTier, isNewUser || false, userId]);
//
//    if (result.rows.length === 0) {
//      return res.status(404).json({ error: 'User not found' });
//    }
//
//    const updatedUser = result.rows[0];
//
//    res.json({
//      success: true,
//      message: 'Subscription updated successfully',
//      user: {
//        id: updatedUser.id,
//        email: updatedUser.email,
//        username: updatedUser.username,
//        subscriptionTier: updatedUser.subscriptionTier,
//        isNewUser: updatedUser.isNewUser
//      }
//    });
//
//  } catch (error) {
//    console.error('Update subscription error:', error);
//    res.status(500).json({ error: 'Failed to update subscription' });
//  }
//});

// ==================== ERROR HANDLING ====================

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    server: 'clean-server.js',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Base URL: http://0.0.0.0:${PORT}`);
  console.log(`💳 Stripe configured: ${!!stripe}`);
  console.log('🚀 Available routes:');
  console.log('   📊 GET  /api/health');
  console.log('   💳 GET  /api/stripe/health');
  console.log('   🔐 POST /api/auth/register');
  console.log('   🔐 POST /api/auth/login');
  console.log('   💰 POST /api/stripe/create-payment-intent');
  console.log('   🛒 POST /api/stripe/create-checkout-session');
  console.log('   👤 PUT  /api/user/subscription');
  console.log('🚀 ================================');
});

module.exports = app;