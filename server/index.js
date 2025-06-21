const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure JWT_SECRET is available
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret-for-development-only-12345';
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: Using fallback JWT_SECRET. Set JWT_SECRET environment variable for production.');
}

// Database connection with fallback
let pool = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5, // Reduced pool size
      idleTimeoutMillis: 60000, // Increased idle timeout
      connectionTimeoutMillis: 5000, // Increased connection timeout
    });

    // Test database connection
    pool.connect((err, client, release) => {
      if (err) {
        console.warn('Database connection failed, continuing without database:', err.message);
        pool = null;
      } else {
        console.log('Database connected successfully');
        release();
      }
    });

    // Handle pool errors gracefully
    pool.on('error', (err, client) => {
      console.warn('Database pool error (non-fatal):', err.message);
    });
  } catch (error) {
    console.warn('Failed to initialize database pool, continuing without database:', error.message);
    pool = null;
  }
} else {
  console.log('No DATABASE_URL provided, running without database');
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // If no database, return mock registration
    if (!pool) {
      const hashedPassword = await bcrypt.hash(password, 12);
      const token = jwt.sign(
        { userId: Math.floor(Math.random() * 1000), email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.status(201).json({
        user: {
          id: Math.floor(Math.random() * 1000),
          email,
          username: username || email.split('@')[0],
          subscriptionTier: 'free',
          isEmailVerified: false,
          createdAt: new Date().toISOString()
        },
        token
      });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, subscription_tier, is_verified)
       VALUES ($1, $2, $3, 'free', false)
       RETURNING id, email, username, subscription_tier, is_verified, created_at`,
      [email, username || email.split('@')[0], hashedPassword]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        subscriptionTier: user.subscription_tier,
        isEmailVerified: user.is_verified,
        createdAt: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for dev login
    if (email === 'djjetfuel' && password === 'Kerrie321$') {
      // Generate JWT
    const token = jwt.sign(
      { userId: 999, email: 'djjetfuel@merchtech.com', isAdmin: true },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: 999, email: 'djjetfuel@merchtech.com', isAdmin: true, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      user: {
        id: 999,
        email: 'djjetfuel@merchtech.com',
        username: 'djjetfuel',
        subscriptionTier: 'premium',
        isAdmin: true,
        isEmailVerified: true,
        createdAt: new Date().toISOString()
      },
      token,
      refreshToken
    });
    }

    // If no database, return error for non-dev logins
    if (!pool) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user from database
    const result = await pool.query(
      'SELECT id, email, username, password_hash, subscription_tier, is_verified, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        subscriptionTier: user.subscription_tier,
        isEmailVerified: user.is_verified,
        createdAt: user.created_at
      },
      token,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Email verification routes
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    // In a real implementation, you'd store verification tokens in the database
    // For now, we'll simulate verification
    if (token && token.length >= 6) {
      res.json({
        success: true,
        message: 'Email verified successfully!'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
});

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    // Implementation would send actual email
    res.json({
      success: true,
      message: 'Verification email sent successfully!'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
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
    jwt.verify(refreshToken, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }

      // Generate new tokens
      const newToken = jwt.sign(
        { userId: decoded.userId, email: decoded.email, isAdmin: decoded.isAdmin },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, email: decoded.email, isAdmin: decoded.isAdmin, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token: newToken,
        refreshToken: newRefreshToken
      });
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// QR Code routes
app.get('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    if (!pool) {
      // Return mock QR codes when database is not available
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT qr.*, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.owner_id = $1 AND qr.is_active = true
       GROUP BY qr.id
       ORDER BY qr.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get QR codes error:', error);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

app.post('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    const { name, url, qrCodeData, options } = req.body;

    const result = await pool.query(
      `INSERT INTO qr_codes (owner_id, name, url, qr_code_data, options)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.userId, name, url, qrCodeData, JSON.stringify(options || {})]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create QR code error:', error);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});

// Analytics routes
app.get('/api/analytics/summary', authenticateToken, async (req, res) => {
  try {
    const queries = {
      totalScans: `
        SELECT COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1
      `,
      todayScans: `
        SELECT COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1 AND DATE(qs.scanned_at) = CURRENT_DATE
      `,
      weekScans: `
        SELECT COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1 AND qs.scanned_at >= CURRENT_DATE - INTERVAL '7 days'
      `
    };

    const results = await Promise.all([
      pool.query(queries.totalScans, [req.user.userId]),
      pool.query(queries.todayScans, [req.user.userId]),
      pool.query(queries.weekScans, [req.user.userId])
    ]);

    res.json({
      totalScans: parseInt(results[0].rows[0].count),
      todayScans: parseInt(results[1].rows[0].count),
      weekScans: parseInt(results[2].rows[0].count)
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// User management routes (admin only)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (dev login or admin flag)
    if (req.user.userId !== 999 && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT id, email, username, subscription_tier, is_verified, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Password reset endpoints
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // In a real implementation, you'd send an actual password reset email
    res.json({
      success: true,
      message: 'Password reset email sent successfully'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send password reset email'
    });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // In a real implementation, you'd verify the reset token and update the password
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// Profile management endpoints
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;

    // In a real implementation, you'd update the user in the database
    // For now, return mock updated user
    res.json({
      id: req.user.userId,
      email: req.user.email,
      username: updates.username || 'djjetfuel',
      firstName: updates.firstName || 'DJ',
      lastName: updates.lastName || 'JetFuel',
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // In a real implementation, you'd verify current password and update
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at: http://0.0.0.0:${PORT}/api`);
  console.log(`Process ID: ${process.pid}`);
  console.log(`Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. Trying to restart...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT, '0.0.0.0');
    }, 1000);
  }
});

// Monitor server health
setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log(`[${new Date().toISOString()}] Server health check - Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB, Uptime: ${Math.round(process.uptime())} seconds, DB: ${pool ? 'Connected' : 'Disconnected'}`);
}, 60000); // Log every 60 seconds to reduce noise

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    pool.end();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    pool.end();
    process.exit(0);
  });
});