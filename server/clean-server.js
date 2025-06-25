const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token == null) {
    console.log('No token provided for authentication');
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('Token authentication failed:', err);
      return res.sendStatus(403);
    }
    req.user = user
    next()
  })
}

// Initialize Stripe with validation
let stripe;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

console.log('🔍 CLEAN SERVER: Checking Stripe configuration...');
console.log('🔍 CLEAN SERVER: STRIPE_SECRET_KEY exists:', !!stripeSecretKey);
console.log('🔍 CLEAN SERVER: STRIPE_SECRET_KEY starts with sk_:', stripeSecretKey?.startsWith('sk_'));

if (stripeSecretKey && 
    stripeSecretKey !== 'sk_live_your_stripe_secret_key_here' && 
    stripeSecretKey !== 'sk_test_51234567890abcdef_test_key_placeholder' &&
    (stripeSecretKey.startsWith('sk_test_') || stripeSecretKey.startsWith('sk_live_'))) {

  try {
    stripe = require('stripe')(stripeSecretKey);
    console.log('🟢 CLEAN SERVER: Stripe initialized successfully with key:', stripeSecretKey.substring(0, 12) + '...');
    console.log('🟢 CLEAN SERVER: Stripe mode:', stripeSecretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST');
  } catch (error) {
    console.error('🔴 CLEAN SERVER: Stripe initialization failed:', error.message);
    console.log('🟡 CLEAN SERVER: Falling back to test mode');
  }
} else {
  console.log('🟡 CLEAN SERVER: Stripe not initialized - invalid or missing API key');
  console.log('🟡 CLEAN SERVER: Expected format: sk_test_... or sk_live_...');
  console.log('🟡 CLEAN SERVER: Current key preview:', stripeSecretKey ? stripeSecretKey.substring(0, 12) + '...' : 'undefined');
  console.log('🟡 CLEAN SERVER: Payment endpoints will return test responses');
}

const app = express();
const PORT = 5000;
const HOST = '0.0.0.0';

console.log('🟢 CLEAN SERVER: Starting...');

// CORS - simple and permissive
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Database initialization - sync version for immediate setup
async function initializeDatabase() {
  try {
    console.log('🟢 CLEAN SERVER: Initializing database...');

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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        verification_token VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);

    console.log('🟢 CLEAN SERVER: Database initialized');
  } catch (error) {
    console.error('🟢 CLEAN SERVER: Database error:', error);
  }
}

// Initialize database immediately
initializeDatabase();

// Debug middleware to log all requests - after basic middleware
app.use((req, res, next) => {
  console.log(`🟢 CLEAN SERVER: *** INCOMING REQUEST DEBUG ***`);
  console.log(`🟢 CLEAN SERVER: Method: ${req.method}`);
  console.log(`🟢 CLEAN SERVER: Original URL: ${req.originalUrl}`);
  console.log(`🟢 CLEAN SERVER: Path: ${req.path}`);
  console.log(`🟢 CLEAN SERVER: Query: ${JSON.stringify(req.query)}`);
  console.log(`🟢 CLEAN SERVER: Headers: ${JSON.stringify(req.headers, null, 2)}`);
  console.log(`🟢 CLEAN SERVER: *** END REQUEST DEBUG ***`);
  next();
});

// Root route
app.get('/', (req, res) => {
  console.log('🟢 CLEAN SERVER: Root route hit');
  res.json({ 
    message: 'MerchTech QR API Server - CLEAN VERSION', 
    status: 'running',
    server: 'clean-server.js',
    timestamp: new Date().toISOString()
  });
});

// ==================== STRIPE ROUTES ====================
console.log('🟢 CLEAN SERVER: Registering Stripe routes immediately...');

// Route hit logging middleware for Stripe routes (Express v5 compatible)
app.use('/api/stripe', (req, res, next) => {
  console.log(`🟢 CLEAN SERVER: *** STRIPE ROUTE MIDDLEWARE HIT ***`);
  console.log(`🟢 CLEAN SERVER: Method: ${req.method}`);
  console.log(`🟢 CLEAN SERVER: URL: ${req.originalUrl}`);
  console.log(`🟢 CLEAN SERVER: Path: ${req.path}`);
  console.log(`🟢 CLEAN SERVER: Time: ${new Date().toISOString()}`);
  console.log(`🟢 CLEAN SERVER: Router stack length: ${app._router?.stack?.length || 'undefined'}`);
  console.log(`🟢 CLEAN SERVER: *** STRIPE ROUTE MIDDLEWARE PASSED ***`);
  next();
});

// Stripe health check endpoint
app.get('/api/stripe/health', (req, res) => {
  console.log('🟢 CLEAN SERVER: *** STRIPE HEALTH CHECK ENDPOINT ACTUALLY HIT ***');
  console.log('🟢 CLEAN SERVER: Request method:', req.method);
  console.log('🟢 CLEAN SERVER: Request path:', req.path);
  console.log('🟢 CLEAN SERVER: Request originalUrl:', req.originalUrl);

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  const response = {
    stripeConfigured: !!stripe,
    secretKeyExists: !!stripeSecretKey,
    secretKeyValid: stripeSecretKey && (stripeSecretKey.startsWith('sk_test_') || stripeSecretKey.startsWith('sk_live_')),
    secretKeyType: stripeSecretKey?.startsWith('sk_live_') ? 'live' : stripeSecretKey?.startsWith('sk_test_') ? 'test' : 'invalid',
    publishableKeyExists: !!stripePublishableKey,
    publishableKeyValid: stripePublishableKey && (stripePublishableKey.startsWith('pk_test_') || stripePublishableKey.startsWith('pk_live_')),
    endpoints: [
      'POST /api/stripe/create-checkout-session (auth required)',
      'POST /api/stripe/create-payment-intent (auth required)'
    ],
    testMode: !stripe,
    message: stripe ? 'Stripe is configured and ready' : 'Stripe running in test mode - check your API keys in secrets',
    keyPreview: stripeSecretKey ? stripeSecretKey.substring(0, 12) + '...' : 'not found',
    timestamp: new Date().toISOString()
  };

  console.log('🟢 CLEAN SERVER: Sending health check response:', response);
  res.json(response);
});

// Stripe checkout session endpoint
app.post('/api/stripe/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, amount, successUrl, cancelUrl } = req.body;
    console.log('🟢 CLEAN SERVER: Creating Stripe checkout session for:', subscriptionTier);

    // Check if Stripe is properly configured
    if (!stripe) {
      console.log('🟡 CLEAN SERVER: Using test mode - Stripe not configured');
      // Return a test response for development
      return res.json({
        success: true,
        url: successUrl || `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:8081'}/subscription/success?session_id=test_session_123&tier=${subscriptionTier}&newUser=true`,
        sessionId: 'test_session_123'
      });
    }

    // Create actual Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} Plan`,
          description: `MerchTech QR ${subscriptionTier} subscription`
          },
          unit_amount: amount,
          recurring: {
            interval: 'month'
          }
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl || `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:8081'}/subscription/success?session_id={CHECKOUT_SESSION_ID}&tier=${subscriptionTier}&newUser=true`,
      cancel_url: cancelUrl || `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:8081'}/subscription/checkout?tier=${subscriptionTier}`,
      customer_email: req.user.email,
      metadata: {
        userId: req.user.id.toString(),
        subscriptionTier: subscriptionTier
      }
    });

    console.log('🟢 CLEAN SERVER: Stripe checkout session created:', session.id);
    res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('🟢 CLEAN SERVER: Stripe checkout session error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
});

// Stripe payment intent endpoint
app.post('/api/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, amount } = req.body;
    console.log('🟢 CLEAN SERVER: Creating payment intent for:', subscriptionTier);

    // Check if Stripe is properly configured
    if (!stripe) {
      console.log('🟡 CLEAN SERVER: Using test mode - Stripe not configured');
      // Return a test response for development
      return res.json({
        clientSecret: 'test_client_secret_123',
        customerId: 'test_customer_123'
      });
    }

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
        metadata: {
          userId: req.user.id.toString()
        }
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

    console.log('🟢 CLEAN SERVER: Payment intent created:', paymentIntent.id);
    res.json({
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id
    });
  } catch (error) {
    console.error('🟢 CLEAN SERVER: Payment intent error:', error);
    res.status(500).json({ 
      message: 'Failed to create payment intent',
      details: error.message
    });
  }
});

console.log('🟢 CLEAN SERVER: Stripe routes registered successfully');
console.log('🟢 CLEAN SERVER: Available Stripe endpoints:');
console.log('🟢 CLEAN SERVER:   GET /api/stripe/health');
console.log('🟢 CLEAN SERVER:   POST /api/stripe/create-checkout-session');
console.log('🟢 CLEAN SERVER:   POST /api/stripe/create-payment-intent');

// Immediate route verification after registration
console.log('🟢 CLEAN SERVER: *** IMMEDIATE ROUTE TEST AFTER REGISTRATION ***');
console.log('🟢 CLEAN SERVER: Express app exists:', !!app);
console.log('🟢 CLEAN SERVER: app._router exists:', !!app._router);
console.log('🟢 CLEAN SERVER: Router stack length:', app._router?.stack?.length || 'undefined');

// Test route matching manually
const testReq = { method: 'GET', url: '/api/stripe/health', originalUrl: '/api/stripe/health', path: '/api/stripe/health' };
console.log('🟢 CLEAN SERVER: Testing route matching for:', testReq.url);

if (app._router && app._router.stack) {
  app._router.stack.forEach((layer, index) => {
    if (layer.route) {
      console.log(`🟢 CLEAN SERVER: Route ${index}: ${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
    } else if (layer.name === 'router' && layer.regexp) {
      console.log(`🟢 CLEAN SERVER: Router middleware ${index}: ${layer.regexp}`);
    } else {
      console.log(`🟢 CLEAN SERVER: Middleware ${index}: ${layer.name || 'anonymous'}`);
    }
  });
} else {
  console.log('🟡 CLEAN SERVER: No router stack available yet');
}
console.log('🟢 CLEAN SERVER: *** END IMMEDIATE ROUTE TEST ***');

// ==================== USER ROUTES ====================
console.log('🟢 CLEAN SERVER: Registering User routes...');

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
    let query;
    if(values.length > 0){
      query = `
        UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $${++paramCount}
        RETURNING *
      `;
    } else {
      query = `
        SELECT * FROM users WHERE id = $${++paramCount}
      `;
    }

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

console.log('🟢 CLEAN SERVER: User routes registered successfully');
console.log('🟢 CLEAN SERVER: All routes registered successfully');

// ==================== AUTH ROUTES ====================
console.log('🟢 CLEAN SERVER: Registering Auth routes...');

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  console.log('🟢 CLEAN SERVER: Registration endpoint hit');
  console.log('🟢 CLEAN SERVER: Request body:', req.body);

  try {
    const { email, password, username, firstName, lastName } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcryptjs.hash(password, saltRounds);

    // Insert new user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, first_name, last_name, is_email_verified, subscription_tier, is_new_user, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, 'free', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, email, username, first_name, last_name, is_email_verified, subscription_tier, is_new_user, created_at, updated_at`,
      [email, username, hashedPassword, firstName, lastName]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        userId: user.id, 
        email: user.email,
        username: user.username,
        isAdmin: false
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🟢 CLEAN SERVER: Registration successful for:', user.email);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isEmailVerified: user.is_email_verified,
        subscriptionTier: user.subscription_tier,
        isNewUser: user.is_new_user,
        isAdmin: false,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      success: true
    });

  } catch (error) {
    console.error('🟢 CLEAN SERVER: Registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: error.message
    });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  console.log('🟢 CLEAN SERVER: Login endpoint hit');
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

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
    const isValidPassword = await bcryptjs.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        userId: user.id, 
        email: user.email,
        username: user.username,
        isAdmin: user.is_admin || false
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🟢 CLEAN SERVER: Login successful:', { userId: user.id, email: user.email });

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
        isAdmin: user.is_admin || false,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken: `refresh_${token}`
    });

  } catch (error) {
    console.error('🟢 CLEAN SERVER: Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🟢 CLEAN SERVER: Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    server: 'clean-server.js',
    timestamp: new Date().toISOString()
  });
});

// 404 handler - MUST be last
app.use((req, res) => {
  console.log(`🔴 CLEAN SERVER: 404 - Route not found: ${req.method} ${req.originalUrl}`);
  console.log(`🔴 CLEAN SERVER: Full URL breakdown:`);
  console.log(`🔴 CLEAN SERVER:   - originalUrl: ${req.originalUrl}`);
  console.log(`🔴 CLEAN SERVER:   - path: ${req.path}`);
  console.log(`🔴 CLEAN SERVER:   - baseUrl: ${req.baseUrl}`);
  console.log(`🔴 CLEAN SERVER:   - url: ${req.url}`);
  console.log(`🔴 CLEAN SERVER: Router stack length: ${app._router?.stack?.length || 'undefined'}`);
  
  if (app._router && app._router.stack) {
    console.log(`🔴 CLEAN SERVER: Available routes:`);
    app._router.stack.forEach((layer, index) => {
      if (layer.route) {
        console.log(`🔴 CLEAN SERVER:   ${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
      }
    });
  }
  
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    server: 'clean-server.js',
    timestamp: new Date().toISOString(),
    debug: {
      routerExists: !!app._router,
      stackLength: app._router?.stack?.length || 0
    }
  });
});

// Function to verify routes are actually working
function verifyRoutesWorking() {
  console.log('🟢 CLEAN SERVER: *** ROUTE VERIFICATION TEST ***');
  
  const routesToTest = [
    { method: 'GET', path: '/api/stripe/health' },
    { method: 'GET', path: '/' },
    { method: 'POST', path: '/api/auth/register' },
    { method: 'POST', path: '/api/auth/login' }
  ];

  // Test each route by checking if Express can match it
  routesToTest.forEach(route => {
    try {
      // Create a mock request to test route matching
      const mockReq = {
        method: route.method,
        url: route.path,
        originalUrl: route.path,
        path: route.path
      };

      // Check if any route handlers would match
      let routeFound = false;
      if (app._router && app._router.stack) {
        app._router.stack.forEach(layer => {
          if (layer.route && layer.route.path === route.path) {
            if (layer.route.methods[route.method.toLowerCase()]) {
              routeFound = true;
            }
          }
        });
      }

      console.log(`🟢 CLEAN SERVER: Route ${route.method} ${route.path}: ${routeFound ? 'FOUND' : 'NOT FOUND'}`);
    } catch (error) {
      console.log(`🟢 CLEAN SERVER: Route ${route.method} ${route.path}: ERROR - ${error.message}`);
    }
  });

  console.log('🟢 CLEAN SERVER: *** END ROUTE VERIFICATION ***');
}

// Function to list all registered routes
function listRegisteredRoutes() {
  console.log('🟢 CLEAN SERVER: *** REGISTERED ROUTES DEBUG ***');

  try {
    if (!app._router || !app._router.stack) {
      console.log('🟡 CLEAN SERVER: Router not properly initialized yet');
      return;
    }

    const routes = [];
    app._router.stack.forEach((middleware, index) => {
      if (middleware.route) {
        // Direct route
        routes.push({
          method: Object.keys(middleware.route.methods)[0].toUpperCase(),
          path: middleware.route.path,
          type: 'direct',
          index: index
        });
      } else if (middleware.name === 'router') {
        // Router middleware
        if (middleware.handle && middleware.handle.stack) {
          middleware.handle.stack.forEach((handler, subIndex) => {
            if (handler.route) {
              routes.push({
                method: Object.keys(handler.route.methods)[0].toUpperCase(), 
                path: handler.route.path,
                type: 'router',
                index: index,
                subIndex: subIndex
              });
            }
          });
        }
      } else {
        // Other middleware
        routes.push({
          name: middleware.name || 'anonymous',
          type: 'middleware',
          index: index
        });
      }
    });

    console.log('🟢 CLEAN SERVER: Total middleware/routes registered:', routes.length);
    routes.forEach((route) => {
      if (route.method && route.path) {
        console.log(`🟢 CLEAN SERVER: ${route.method} ${route.path} (${route.type})`);
      } else {
        console.log(`🟢 CLEAN SERVER: Middleware: ${route.name} (${route.type})`);
      }
    });

    // Manually list the routes we know should be there
    console.log('🟢 CLEAN SERVER: Expected Stripe routes:');
    console.log('🟢 CLEAN SERVER:   GET /api/stripe/health');
    console.log('🟢 CLEAN SERVER:   POST /api/stripe/create-checkout-session');
    console.log('🟢 CLEAN SERVER:   POST /api/stripe/create-payment-intent');
    console.log('🟢 CLEAN SERVER:   PUT /api/user/subscription');

  } catch (error) {
    console.error('🟢 CLEAN SERVER: Error listing routes:', error.message);
  }

  console.log('🟢 CLEAN SERVER: *** END REGISTERED ROUTES DEBUG ***');
}

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🟢 CLEAN SERVER: Running on ${HOST}:${PORT}`);
  console.log(`🟢 CLEAN SERVER: Health: http://${HOST}:${PORT}/api/health`);
  console.log(`🟢 CLEAN SERVER: Register: http://${HOST}:${PORT}/api/auth/register`);

  // Verify routes immediately - they should be registered by now
  console.log('🟢 CLEAN SERVER: *** IMMEDIATE ROUTE CHECK ***');
  console.log('🟢 CLEAN SERVER: app._router exists:', !!app._router);
  console.log('🟢 CLEAN SERVER: app._router.stack exists:', !!(app._router && app._router.stack));
  console.log('🟢 CLEAN SERVER: app._router.stack length:', app._router?.stack?.length || 0);
  
  // List all registered routes for debugging after server starts
  setTimeout(() => {
    listRegisteredRoutes();
    verifyRoutesWorking();
    
    // Test a real HTTP request to our own server
    console.log('🟢 CLEAN SERVER: *** TESTING SELF-REQUEST ***');
    const http = require('http');
    const testUrl = `http://localhost:5000/api/stripe/health`;
    
    http.get(testUrl, (res) => {
      console.log(`🟢 CLEAN SERVER: Self-test response status: ${res.statusCode}`);
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`🟢 CLEAN SERVER: Self-test response: ${data.substring(0, 100)}...`);
      });
    }).on('error', (err) => {
      console.log(`🔴 CLEAN SERVER: Self-test error: ${err.message}`);
    });
  }, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🟢 CLEAN SERVER: SIGTERM received, shutting down gracefully');
  if (pool) pool.end();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🟢 CLEAN SERVER: SIGINT received, shutting down gracefully');
  if (pool) pool.end();
  process.exit(0);
});