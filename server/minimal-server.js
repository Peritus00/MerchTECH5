const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

console.log('🔴 SERVER: Starting minimal server...');
console.log('🔴 SERVER: Environment:', process.env.NODE_ENV);
console.log('🔴 SERVER: PORT:', PORT);
console.log('🔴 SERVER: HOST:', HOST);

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Database configuration with better error handling
let pool;
try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log('🔴 SERVER: Database pool created');
} catch (error) {
  console.error('🔴 SERVER: Database pool creation failed:', error);
  process.exit(1);
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

// Root route
app.get('/', (req, res) => {
  console.log('🔴 SERVER: Root route hit');
  res.json({ 
    message: 'MerchTech QR API Server - MINIMAL VERSION', 
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'GET /api/health',
      'POST /api/auth/register',
      'POST /api/auth/login'
    ]
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  console.log('🔴 SERVER: Health check endpoint hit');
  try {
    await pool.query('SELECT 1');
    console.log('🔴 SERVER: Database connection successful');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      server: 'minimal-server.js'
    });
  } catch (error) {
    console.error('🔴 SERVER: Health check database error:', error);
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      server: 'minimal-server.js',
      error: error.message
    });
  }
});

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  console.log('🔴 SERVER: Registration endpoint hit');
  console.log('🔴 SERVER: Request body:', req.body);

  try {
    const { email, password, username } = req.body;

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
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_new_user, created_at, updated_at)
       VALUES ($1, $2, $3, false, 'free', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, email, username, is_email_verified, subscription_tier, is_new_user, created_at, updated_at`,
      [email, username, hashedPassword]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🔴 SERVER: Registration successful for:', user.email);

    res.status(201).json({
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
    });

  } catch (error) {
    console.error('🔴 SERVER: Registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: error.message
    });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  console.log('🔴 SERVER: Login endpoint hit');
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
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🔴 SERVER: Login successful:', { userId: user.id, email: user.email });

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
    console.error('🔴 SERVER: Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Database initialization
async function initializeDatabase() {
  try {
    console.log('🔴 SERVER: Initializing database...');

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

    console.log('🔴 SERVER: Database connected and tables initialized');
  } catch (error) {
    console.error('🔴 SERVER: Database initialization error:', error);
    // Don't exit, just log the error
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔴 SERVER: Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('/*splat', (req, res) => {
  console.log(`🔴 SERVER: 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    server: 'minimal-server.js'
  });
});

// Start server with better error handling
app.listen(PORT, HOST, async (error) => {
  if (error) {
    console.error('🔴 SERVER: Failed to start server:', error);
    process.exit(1);
  }

  console.log(`🔴 SERVER: =================================`);
  console.log(`🔴 SERVER: MINIMAL SERVER RUNNING`);
  console.log(`🔴 SERVER: Server running on ${HOST}:${PORT}`);
  console.log(`🔴 SERVER: API available at: http://${HOST}:${PORT}/api`);
  console.log(`🔴 SERVER: Health check: /api/health`);
  console.log(`🔴 SERVER: Registration: /api/auth/register`);
  console.log(`🔴 SERVER: Login: /api/auth/login`);
  console.log(`🔴 SERVER: =================================`);

  await initializeDatabase();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔴 SERVER: SIGTERM received, shutting down gracefully');
  if (pool) {
    pool.end();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔴 SERVER: SIGINT received, shutting down gracefully');
  if (pool) {
    pool.end();
  }
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('🔴 SERVER: Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 SERVER: Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});