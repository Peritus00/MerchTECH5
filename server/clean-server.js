
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

// Database initialization
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('🟢 CLEAN SERVER: Database initialized');
  } catch (error) {
    console.error('🟢 CLEAN SERVER: Database error:', error);
  }
}

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

// Health check
app.get('/api/health', async (req, res) => {
  console.log('🟢 CLEAN SERVER: Health check hit');
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      server: 'clean-server.js',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('🟢 CLEAN SERVER: Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      server: 'clean-server.js',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

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

// 404 handler
app.use('/*splat', (req, res) => {
  console.log(`🟢 CLEAN SERVER: 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    server: 'clean-server.js',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, HOST, async () => {
  console.log(`🟢 CLEAN SERVER: Running on ${HOST}:${PORT}`);
  console.log(`🟢 CLEAN SERVER: Health: http://${HOST}:${PORT}/api/health`);
  console.log(`🟢 CLEAN SERVER: Register: http://${HOST}:${PORT}/api/auth/register`);
  console.log(`🟢 CLEAN SERVER: Database initialized`);
  
  await initializeDatabase();
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
