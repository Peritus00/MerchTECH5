
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

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

// Initialize database
async function initDB() {
  try {
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

// Routes
app.get('/', (req, res) => {
  console.log('🟢 CLEAN SERVER: Root route hit');
  res.json({ 
    message: 'MerchTech Clean Server', 
    status: 'running',
    endpoints: ['/api/health', '/api/auth/register', '/api/auth/login']
  });
});

app.get('/api/health', async (req, res) => {
  console.log('🟢 CLEAN SERVER: Health check');
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      server: 'clean-server.js',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  console.log('🟢 CLEAN SERVER: Registration request');
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }

    // Check existing user
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_new_user)
       VALUES ($1, $2, $3, false, 'free', true)
       RETURNING id, email, username, is_email_verified, subscription_tier, is_new_user, created_at`,
      [email, username, hashedPassword]
    );

    const user = result.rows[0];

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🟢 CLEAN SERVER: Registration successful for:', user.email);

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
        updatedAt: user.created_at
      },
      token,
      refreshToken: `refresh_${token}`
    });

  } catch (error) {
    console.error('🟢 CLEAN SERVER: Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  console.log('🟢 CLEAN SERVER: Login request');
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValid = await bcryptjs.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🟢 CLEAN SERVER: Login successful for:', user.email);

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
        isAdmin: user.is_admin,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken: `refresh_${token}`
    });

  } catch (error) {
    console.error('🟢 CLEAN SERVER: Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Start server
app.listen(PORT, HOST, async () => {
  console.log(`🟢 CLEAN SERVER: Running on ${HOST}:${PORT}`);
  console.log(`🟢 CLEAN SERVER: Health: http://${HOST}:${PORT}/api/health`);
  console.log(`🟢 CLEAN SERVER: Register: http://${HOST}:${PORT}/api/auth/register`);
  await initDB();
});

process.on('SIGTERM', () => {
  console.log('🟢 CLEAN SERVER: Shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🟢 CLEAN SERVER: Shutting down');
  process.exit(0);
});
