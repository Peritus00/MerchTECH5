
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
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

// Initialize database
async function initializeDatabase() {
  try {
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_new_user BOOLEAN DEFAULT TRUE
      );
    `);

    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  console.log('=== REGISTRATION ENDPOINT HIT ===');
  try {
    const { email, password, username } = req.body;
    console.log('Registration attempt for:', { email, username });

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT email, username FROM users WHERE email = $1 OR username = $2',
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

    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_new_user) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, username, is_email_verified, subscription_tier, is_new_user, created_at`,
      [email, username, passwordHash, false, 'free', true]
    );

    console.log('User created:', newUser.rows[0]);

    // Generate JWT token
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
  try {
    const { email, password } = req.body;

    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const foundUser = user.rows[0];
    const passwordMatch = await bcrypt.compare(password, foundUser.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: foundUser.id, 
        email: foundUser.email,
        username: foundUser.username,
        isAdmin: foundUser.is_admin || false
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { id: foundUser.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: foundUser.id,
        email: foundUser.email,
        username: foundUser.username,
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

// Refresh token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

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

    const newRefreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
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

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Simple server starting...`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://0.0.0.0:${PORT}`);
  console.log(`🔗 External API URL: https://${process.env.REPLIT_DEV_DOMAIN}/api`);
  console.log(`📊 Health check: https://${process.env.REPLIT_DEV_DOMAIN}/api/health`);
  
  try {
    await initializeDatabase();
    console.log(`✅ Simple server fully initialized and ready!`);
  } catch (error) {
    console.error(`❌ Server initialization failed:`, error);
  }
}).on('error', (err) => {
  console.error(`❌ Server failed to start:`, err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try stopping other processes or use a different port.`);
  }
});
