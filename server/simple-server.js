const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
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

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'MerchTech QR API Server', 
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Load and configure Stripe
console.log('🔴 SERVER: Checking Stripe configuration...');
console.log('🔴 SERVER: STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
console.log('🔴 SERVER: STRIPE_SECRET_KEY length:', process.env.STRIPE_SECRET_KEY?.length || 0);

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

if (!stripe) {
  console.log('⚠️ SERVER: Stripe not configured - STRIPE_SECRET_KEY missing');
} else {
  console.log('✅ SERVER: Stripe configured successfully');
  console.log('✅ SERVER: Using key type:', process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST');
}

// Health check
app.get('/api/health', async (req, res) => {
  console.log('🔴 SERVER: Health check requested');
  try {
    const dbResult = await pool.query('SELECT NOW()');
    const userCountResult = await pool.query('SELECT COUNT(*) as count FROM users');
    
    res.json({ 
      status: 'healthy',
      database: 'connected',
      users: parseInt(userCountResult.rows[0].count),
      timestamp: new Date().toISOString(),
      server: 'simple-server.js'
    });
  } catch (error) {
    console.error('🔴 SERVER: Health check failed:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Stripe health check
app.get('/api/stripe/health', (req, res) => {
  console.log('🔴 SERVER: Stripe health check requested');
  res.json({
    stripeConfigured: !!stripe,
    secretKeyValid: !!stripe,
    keyType: stripe ? (process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST') : 'NONE',
    secretKeyType: stripe ? (process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST') : 'NONE',
    timestamp: new Date().toISOString(),
    server: 'simple-server.js'
  });
});

// Create Payment Intent
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  console.log('🔴 SERVER: Create payment intent requested');
  console.log('🔴 SERVER: Request body:', req.body);

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const { amount, currency = 'usd', subscriptionTier } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Create a customer for this payment
    const customer = await stripe.customers.create({
      metadata: {
        subscriptionTier: subscriptionTier || 'unknown'
      }
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      customer: customer.id,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        subscriptionTier: subscriptionTier || 'unknown'
      }
    });

    console.log('✅ SERVER: Payment intent created:', paymentIntent.id);
    res.json({
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id,
      id: paymentIntent.id
    });
  } catch (error) {
    console.error('❌ SERVER: Create payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all Stripe products with prices
app.get('/api/stripe/products', async (req, res) => {
  console.log('🔴 SERVER: Get Stripe products requested');

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const products = await stripe.products.list({
      limit: 100,
      active: true
    });

    // For each product, fetch its associated prices
    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
        });
        return {
          id: product.id, // Stripe Product ID (prod_...)
          name: product.name,
          description: product.description,
          images: product.images,
          metadata: product.metadata,
          prices: prices.data.map(price => ({
            id: price.id, // Stripe Price ID (price_...)
            unit_amount: price.unit_amount, // Amount in cents
            currency: price.currency,
            type: price.type, // 'one_time' or 'recurring'
            recurring: price.recurring,
          })),
        };
      })
    );

    console.log('✅ SERVER: Products fetched:', productsWithPrices.length);
    res.json(productsWithPrices);
  } catch (error) {
    console.error('❌ SERVER: Get products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Checkout Session
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  console.log('🔴 SERVER: Create checkout session requested');
  console.log('🔴 SERVER: Request body:', req.body);

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const { priceId, quantity = 1, subscriptionTier, amount, successUrl, cancelUrl } = req.body;

    // Handle both app format (subscriptionTier + amount) and test format (priceId)
    if (subscriptionTier && amount) {
      // App format - create subscription with dynamic pricing
      const lineItems = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} Plan`,
            description: `Monthly subscription to ${subscriptionTier} plan`,
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
          recurring: {
            interval: 'month',
          },
        },
        quantity: 1,
      }];

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: lineItems,
        success_url: successUrl || `${req.headers.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${req.headers.origin}/subscription`,
        metadata: {
          subscriptionTier: subscriptionTier
        }
      });

      console.log('✅ SERVER: Checkout session created (app format):', session.id);
      res.json({
        success: true,
        sessionId: session.id,
        url: session.url
      });

    } else if (priceId) {
      // Test format - use existing price ID
      const price = await stripe.prices.retrieve(priceId);
      const mode = price.type === 'recurring' ? 'subscription' : 'payment';

      const session = await stripe.checkout.sessions.create({
        mode: mode,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: quantity,
          },
        ],
        success_url: successUrl || `${req.headers.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${req.headers.origin}/subscription`,
      });

      console.log('✅ SERVER: Checkout session created (test format):', session.id);
      res.json({
        success: true,
        sessionId: session.id,
        url: session.url
      });

    } else {
      return res.status(400).json({ error: 'Either priceId or (subscriptionTier + amount) is required' });
    }

  } catch (error) {
    console.error('❌ SERVER: Create checkout session error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Update user subscription
app.put('/api/user/subscription', async (req, res) => {
  console.log('🔴 SERVER: Update user subscription requested');

  try {
    const { userId, subscriptionTier } = req.body;

    if (!userId || !subscriptionTier) {
      return res.status(400).json({ error: 'User ID and subscription tier are required' });
    }

    const result = await pool.query(
      'UPDATE users SET subscription_tier = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [subscriptionTier, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ SERVER: User subscription updated:', userId, subscriptionTier);
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('❌ SERVER: Update subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  console.log('🔴 SERVER: ============ REGISTRATION ENDPOINT DEBUG START ============');
  console.log('🔴 SERVER: Registration endpoint hit at:', new Date().toISOString());
  console.log('🔴 SERVER: Request method:', req.method);
  console.log('🔴 SERVER: Request URL:', req.url);
  console.log('🔴 SERVER: Request headers:', req.headers);
  console.log('🔴 SERVER: Request body:', req.body);

  try {
    const { email, password, username } = req.body;

    console.log('🔴 SERVER: Extracted registration data:', { 
      email, 
      username, 
      hasPassword: !!password,
      passwordLength: password?.length 
    });

    if (!email || !password || !username) {
      console.error('🔴 SERVER: Missing required fields:', {
        hasEmail: !!email,
        hasPassword: !!password,
        hasUsername: !!username
      });
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }

    console.log('🔴 SERVER: Checking for existing user...');
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    console.log('🔴 SERVER: Existing user check result:', {
      foundUsers: existingUser.rows.length,
      existingUsers: existingUser.rows
    });

    if (existingUser.rows.length > 0) {
      console.log('🔴 SERVER: User already exists, returning error');
      return res.status(400).json({ 
        error: 'Email or username already exists' 
      });
    }

    console.log('🔴 SERVER: Hashing password...');
    // Hash password
    const bcrypt = require('bcrypt');
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('🔴 SERVER: Password hashed successfully');

    console.log('🔴 SERVER: Inserting new user into database...');
    // Insert new user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_new_user, created_at, updated_at)
       VALUES ($1, $2, $3, false, 'free', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, email, username, is_email_verified, subscription_tier, is_new_user, created_at, updated_at`,
      [email, username, hashedPassword]
    );

    console.log('🔴 SERVER: Database insert result:', {
      rowCount: result.rowCount,
      rows: result.rows
    });

    const user = result.rows[0];
    console.log('🔴 SERVER: Created user:', user);

    console.log('🔴 SERVER: Generating JWT token...');
    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🔴 SERVER: JWT token generated:', {
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...'
    });

    const responseData = {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: null,
        lastName: null,
        isEmailVerified: user.is_email_verified,
        subscriptionTier: user.subscription_tier,
        isNewUser: user.is_new_user,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken: `refresh_${token}`
    };

    console.log('🔴 SERVER: Sending registration response:', {
      hasUser: !!responseData.user,
      hasToken: !!responseData.token,
      userId: responseData.user?.id,
      userEmail: responseData.user?.email
    });

    console.log('🔴 SERVER: Registration successful for:', { userId: user.id, email: user.email, username: user.username });
    console.log('🔴 SERVER: ============ REGISTRATION ENDPOINT DEBUG END ============');

    res.status(201).json(responseData);

  } catch (error) {
    console.error('🔴 SERVER: ============ REGISTRATION ERROR DEBUG START ============');
    console.error('🔴 SERVER: Registration error:', error);
    console.error('🔴 SERVER: Error type:', typeof error);
    console.error('🔴 SERVER: Error name:', error.name);
    console.error('🔴 SERVER: Error message:', error.message);
    console.error('🔴 SERVER: Error stack:', error.stack);
    console.error('🔴 SERVER: ============ REGISTRATION ERROR DEBUG END ============');

    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: error.message
    });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt:', { email });

    // Get user from database
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful:', { userId: user.id, email: user.email });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isEmailVerified: user.is_email_verified,
        subscriptionTier: user.subscription_tier,
        isNewUser: user.is_new_user,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken: `refresh_${token}`
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Database initialization function
async function initializeDatabase() {
  try {
    console.log('Initializing database...');

    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_email_verified BOOLEAN DEFAULT false,
        subscription_tier VARCHAR(20) DEFAULT 'free',
        is_new_user BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database connected and tables initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't exit the process, just log the error
  }
}

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Simple server running on port ${PORT}`);
  console.log(`API available at: http://0.0.0.0:${PORT}/api`);
  console.log(`External API URL: https://${process.env.REPLIT_DEV_DOMAIN}/api`);
  console.log(`Health check URL: https://${process.env.REPLIT_DEV_DOMAIN}/api/health`);
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