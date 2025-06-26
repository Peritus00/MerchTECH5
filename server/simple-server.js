const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration - Dynamic origin handling for Replit development
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all Replit development URLs
    if (origin.includes('.replit.dev') || origin.includes('.repl.co')) {
      return callback(null, true);
    }
    
    // Allow localhost for local development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Log the origin for debugging
    console.log('🔴 SERVER: CORS request from origin:', origin);
    
    // Allow all origins in development (fallback)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 200
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

// CORS debug endpoint
app.get('/api/cors-test', (req, res) => {
  console.log('🔴 SERVER: CORS test requested from origin:', req.headers.origin);
  res.json({
    message: 'CORS test successful',
    origin: req.headers.origin,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
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

// ==================== AUTH ENDPOINTS ====================

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
  console.log('🔴 SERVER: ============ LOGIN ENDPOINT DEBUG START ============');
  console.log('🔴 SERVER: Login endpoint hit at:', new Date().toISOString());
  console.log('🔴 SERVER: Request body:', req.body);

  try {
    const { email, password } = req.body;

    console.log('🔴 SERVER: Login attempt for:', { email, hasPassword: !!password });

    if (!email || !password) {
      console.error('🔴 SERVER: Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log('🔴 SERVER: Querying database for user...');
    // Get user from database
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    console.log('🔴 SERVER: Database query result:', {
      rowCount: result.rowCount,
      foundUser: result.rows.length > 0
    });

    if (result.rows.length === 0) {
      console.log('🔴 SERVER: User not found for email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('🔴 SERVER: Found user:', { id: user.id, email: user.email, username: user.username });

    console.log('🔴 SERVER: Verifying password...');
    // Verify password
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    console.log('🔴 SERVER: Password verification result:', isValidPassword);

    if (!isValidPassword) {
      console.log('🔴 SERVER: Invalid password for user:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('🔴 SERVER: Generating JWT token...');
    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        username: user.username,
        isAdmin: user.is_admin || false
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const responseData = {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isEmailVerified: user.is_email_verified,
        subscriptionTier: user.subscription_tier,
        isNewUser: user.is_new_user,
        isAdmin: user.is_admin || false,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken: `refresh_${token}`
    };

    console.log('🔴 SERVER: Login successful for:', { userId: user.id, email: user.email, username: user.username });
    console.log('🔴 SERVER: ============ LOGIN ENDPOINT DEBUG END ============');

    res.json(responseData);

  } catch (error) {
    console.error('🔴 SERVER: ============ LOGIN ERROR DEBUG START ============');
    console.error('🔴 SERVER: Login error:', error);
    console.error('🔴 SERVER: Error message:', error.message);
    console.error('🔴 SERVER: Error stack:', error.stack);
    console.error('🔴 SERVER: ============ LOGIN ERROR DEBUG END ============');

    res.status(500).json({ 
      error: 'Internal server error during login',
      details: error.message 
    });
  }
});

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
      userId: 1,
      id: 1,
      email: 'djjetfuel@gmail.com',
      username: 'djjetfuel',
      isAdmin: true
    };
    return next();
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Check if user is admin in database
    try {
      const dbUser = await pool.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [user.userId]
      );

      if (dbUser.rows.length > 0) {
        user.isAdmin = dbUser.rows[0].is_admin;
      }
    } catch (dbError) {
      console.error('Error checking admin status:', dbError);
    }

    req.user = user;
    next();
  });
};

// ==================== QR CODE ENDPOINTS ====================

// Get all QR codes for user
app.get('/api/qr-codes', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Get QR codes endpoint hit');
  try {
    const result = await pool.query(
      'SELECT * FROM qr_codes WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    console.log('🔴 SERVER: Found QR codes:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('🔴 SERVER: Get QR codes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create QR code
app.post('/api/qr-codes', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Create QR code endpoint hit');
  try {
    const { name, url, options = {} } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const result = await pool.query(
      `INSERT INTO qr_codes (user_id, name, url, options, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [req.user.userId, name, url, JSON.stringify(options)]
    );

    console.log('🔴 SERVER: QR code created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('🔴 SERVER: Create QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update QR code
app.put('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Update QR code endpoint hit');
  try {
    const { id } = req.params;
    const { name, url, options, is_active } = req.body;

    const result = await pool.query(
      `UPDATE qr_codes 
       SET name = COALESCE($1, name), 
           url = COALESCE($2, url),
           options = COALESCE($3, options),
           is_active = COALESCE($4, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, url, options ? JSON.stringify(options) : null, is_active, id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    console.log('🔴 SERVER: QR code updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 SERVER: Update QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete QR code
app.delete('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Delete QR code endpoint hit');
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM qr_codes WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    console.log('🔴 SERVER: QR code deleted:', id);
    res.json({ message: 'QR code deleted successfully' });
  } catch (error) {
    console.error('🔴 SERVER: Delete QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ANALYTICS ENDPOINTS ====================

// Get analytics summary
app.get('/api/analytics/summary', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Analytics summary endpoint hit');
  try {
    const qrCodeCount = await pool.query(
      'SELECT COUNT(*) as count FROM qr_codes WHERE user_id = $1',
      [req.user.userId]
    );

    const totalScans = await pool.query(
      'SELECT SUM(scan_count) as total FROM qr_codes WHERE user_id = $1',
      [req.user.userId]
    );

    const analytics = {
      qrCodes: parseInt(qrCodeCount.rows[0].count),
      totalScans: parseInt(totalScans.rows[0].total || 0),
      activeQRs: parseInt(qrCodeCount.rows[0].count)
    };

    console.log('🔴 SERVER: Analytics summary:', analytics);
    res.json(analytics);
  } catch (error) {
    console.error('🔴 SERVER: Analytics summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Get all users (admin only) - legacy endpoint
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Get admin users endpoint hit (legacy)');
  console.log('🔴 SERVER: User requesting:', req.user);

  try {
    if (!req.user.isAdmin && req.user.username !== 'djjetfuel') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT id, email, username, first_name, last_name, 
              is_email_verified, subscription_tier, is_new_user, 
              is_admin,
              created_at, updated_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    // Transform to match frontend expectations
    const users = result.rows.map(user => ({
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
      isSuspended: false,
      // Add required permissions fields
      canViewAnalytics: true,
      canManagePlaylists: true,
      canEditPlaylists: true,
      canUploadMedia: true,
      canGenerateCodes: true,
      canAccessStore: true,
      canViewFanmail: true,
      canManageQRCodes: true,
      maxPlaylists: 50,
      maxVideos: 100,
      maxAudioFiles: 100,
      maxActivationCodes: 50,
      maxProducts: 25,
      maxQrCodes: 50,
      maxSlideshows: 10,
      lastActive: user.updated_at
    }));

    console.log('🔴 SERVER: Found users:', users.length);
    res.json(users);
  } catch (error) {
    console.error('🔴 SERVER: Get admin users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only) - new endpoint
app.get('/api/admin/all-users', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Get all users endpoint hit');
  console.log('🔴 SERVER: User requesting:', req.user);

  try {
    if (!req.user.isAdmin && req.user.username !== 'djjetfuel') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT id, email, username, first_name, last_name, 
              is_email_verified, subscription_tier, is_new_user, 
              is_admin,
              created_at, updated_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    // Transform to match frontend expectations
    const users = result.rows.map(user => ({
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
      isSuspended: false,
      // Add required permissions fields
      canViewAnalytics: true,
      canManagePlaylists: true,
      canEditPlaylists: true,
      canUploadMedia: true,
      canGenerateCodes: true,
      canAccessStore: true,
      canViewFanmail: true,
      canManageQRCodes: true,
      maxPlaylists: 50,
      maxVideos: 100,
      maxAudioFiles: 100,
      maxActivationCodes: 50,
      maxProducts: 25,
      maxQrCodes: 50,
      maxSlideshows: 10,
      lastActive: user.updated_at
    }));

    console.log('🔴 SERVER: Found users:', users.length);
    res.json(users);
  } catch (error) {
    console.error('🔴 SERVER: Get all users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user permissions (admin only)
app.put('/api/admin/users/:id', async (req, res) => {
  console.log('🔴 SERVER: Update user permissions endpoint hit');

  try {
    const { id } = req.params;
    const { subscription_tier, is_email_verified } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET subscription_tier = $1, is_email_verified = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 
       RETURNING *`,
      [subscription_tier, is_email_verified, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('🔴 SERVER: User updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 SERVER: Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Delete user endpoint hit');
  console.log('🔴 SERVER: User requesting deletion:', req.user);
  console.log('🔴 SERVER: Target user ID:', req.params.id);

  try {
    if (!req.user.isAdmin && req.user.username !== 'djjetfuel') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Don't allow deleting the protected admin
    const userCheck = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length > 0 && userCheck.rows[0].username === 'djjetfuel') {
      return res.status(403).json({ error: 'Cannot delete protected admin account' });
    }

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('🔴 SERVER: User deleted:', result.rows[0]);
    res.json({ 
      success: true, 
      message: 'User deleted successfully',
      deletedUser: result.rows[0] 
    });
  } catch (error) {
    console.error('🔴 SERVER: Delete user error:', error);
    res.status(500).json({ error: error.message });
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
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add is_admin column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false
    `);

    // Create qr_codes table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        short_url VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        scan_count INTEGER DEFAULT 0,
        options JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create admin user if it doesn't exist
    console.log('Checking for admin user...');
    const adminUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      ['djjetfuel@gmail.com']
    );

    if (adminUser.rows.length === 0) {
      console.log('Creating admin user...');
      const bcrypt = require('bcrypt');
      const adminPassword = await bcrypt.hash('admin123!', 12);

      await pool.query(
        `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_admin, is_new_user, created_at, updated_at)
         VALUES ($1, $2, $3, true, 'premium', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['djjetfuel@gmail.com', 'djjetfuel', adminPassword]
      );
      console.log('✅ Admin user created: djjetfuel@gmail.com / admin123!');
    } else {
      console.log('✅ Admin user already exists');

      // Reset admin password and ensure proper permissions
      const bcrypt = require('bcrypt');
      const adminPassword = await bcrypt.hash('admin123!', 12);

      await pool.query(
        `UPDATE users 
         SET is_admin = true, 
             subscription_tier = 'premium', 
             is_email_verified = true,
             password_hash = $1,
             is_new_user = false,
             updated_at = CURRENT_TIMESTAMP
         WHERE email = $2`,
        [adminPassword, 'djjetfuel@gmail.com']
      );
      console.log('✅ Admin user permissions updated and password reset to: admin123!');
    }

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
  console.log(`External API URL: https://${process.env.REPLIT_DEV_DOMAIN}:${PORT}/api`);
  console.log(`Health check URL: https://${process.env.REPLIT_DEV_DOMAIN}:${PORT}/api/health`);
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