
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

console.log('🚀 Starting stable server on port', PORT);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  connectionTimeoutMillis: 10000,
});

// Test database connection
pool.connect()
  .then(client => {
    console.log('✅ Database connected');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_djjetfuel_merchtech_2024';

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Developer fallback token
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
      return res.status(403).json({ error: 'Invalid token' });
    }

    try {
      const dbUser = await pool.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [user.userId]
      );

      if (dbUser.rows.length > 0) {
        user.isAdmin = dbUser.rows[0].is_admin;
      }
    } catch (dbError) {
      console.error('Error checking admin status:', dbError.message);
    }

    req.user = user;
    next();
  });
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'MerchTech QR API Server', 
    status: 'running',
    version: '1.0.0',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as timestamp');
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      dbTimestamp: result.rows[0].timestamp,
      port: PORT
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, subscription_tier, is_new_user, is_email_verified, is_admin)
       VALUES ($1, $2, $3, 'free', true, false, false)
       RETURNING id, email, username, subscription_tier, is_new_user, is_email_verified, is_admin`,
      [email, username, hashedPassword]
    );

    const user = result.rows[0];

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
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
        subscriptionTier: user.subscription_tier,
        isNewUser: user.is_new_user,
        isEmailVerified: user.is_email_verified,
        isAdmin: user.is_admin
      },
      token,
      refreshToken: `refresh_${token}`
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Playlists routes
app.get('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM playlists WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      `INSERT INTO playlists (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.userId, name, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Media routes
app.get('/api/media', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM media_files WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize database
async function initializeDatabase() {
  try {
    // Create users table
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

    // Create playlists table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        requires_activation_code BOOLEAN DEFAULT FALSE,
        is_public BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create media_files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media_files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create/update dev user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      ['djjetfuel@gmail.com']
    );

    const hashedPassword = await bcrypt.hash('Kerrie321', 12);

    if (existingUser.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (email, username, password_hash, is_email_verified, is_admin, subscription_tier)
         VALUES ($1, $2, $3, true, true, 'premium')`,
        ['djjetfuel@gmail.com', 'djjetfuel', hashedPassword]
      );
      console.log('✅ Dev user created: djjetfuel@gmail.com / Kerrie321');
    } else {
      await pool.query(
        `UPDATE users 
         SET password_hash = $1, is_email_verified = true, is_admin = true, subscription_tier = 'premium'
         WHERE email = $2`,
        [hashedPassword, 'djjetfuel@gmail.com']
      );
      console.log('✅ Dev user updated: djjetfuel@gmail.com / Kerrie321');
    }

    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database init error:', error.message);
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl
  });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 ================================');
      console.log(`🚀 Stable server running on port ${PORT}`);
      console.log(`📍 Health check: http://0.0.0.0:${PORT}/api/health`);
      console.log(`🔐 Dev login: djjetfuel@gmail.com / Kerrie321`);
      console.log('🚀 ================================');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
      }
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received');
  process.exit(0);
});

startServer();
