const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Authentication middleware - MOVED TO TOP
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

// Process management - Add cleanup handlers EARLY
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  if (pool) {
    pool.end(() => {
      console.log('📊 Database pool closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  if (pool) {
    pool.end(() => {
      console.log('📊 Database pool closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Port cleanup function
async function cleanupPort() {
  try {
    console.log('🧹 Cleaning up any existing processes on port', PORT);
    const { spawn } = require('child_process');

    // Kill any existing node processes on this port
    const cleanup = spawn('pkill', ['-f', `node.*${PORT}`], { stdio: 'inherit' });

    cleanup.on('close', (code) => {
      console.log('🧹 Port cleanup completed with code:', code);
    });

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.log('🧹 Port cleanup warning:', error.message);
    // Don't fail if cleanup fails
  }
}

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

app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true }));

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'MerchTech QR API Server', 
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Add health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: PORT,
    pid: process.pid
  });
});

// Load and configure Stripe
console.log('🔴 SERVER: Checking Stripe configuration...');
console.log('🔴 SERVER: STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
console.log('🔴 SERVER: STRIPE_SECRET_KEY length:', process.env.STRIPE_SECRET_KEY?.length || 0);

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Configure Brevo email service
const axios = require('axios');
console.log('🔴 SERVER: Checking Brevo configuration...');
console.log('🔴 SERVER: BREVO_API_KEY exists:', !!process.env.BREVO_API_KEY);

const brevoConfig = {
  apiKey: process.env.BREVO_API_KEY,
  baseURL: 'https://api.brevo.com/v3',
  headers: {
    'accept': 'application/json',
    'api-key': process.env.BREVO_API_KEY,
    'content-type': 'application/json'
  }
};

// Email service helper function
async function sendBrevoEmail(to, subject, htmlContent, templateId = null) {
  try {
    const emailData = {
      sender: {
        email: 'help@merchtech.net',
        name: 'MerchTech QR Platform'
      },
      to: [{ email: to }],
      subject: subject,
      htmlContent: htmlContent
    };

    if (templateId) {
      emailData.templateId = templateId;
    }

    const response = await axios.post(
      `${brevoConfig.baseURL}/smtp/email`,
      emailData,
      { headers: brevoConfig.headers }
    );

    console.log('✅ SERVER: Email sent successfully via Brevo:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ SERVER: Brevo email error:', error.response?.data || error.message);
    throw error;
  }
}

// Simplified email function using Brevo
async function sendEmail(to, subject, htmlContent) {
    if (!process.env.BREVO_API_KEY) {
        console.warn('⚠️ SERVER: Brevo API key not configured.  No emails will be sent.');
        return;
    }
    try {
        const response = await axios.post(
            'https://api.brevo.com/v3/smtp/email',
            {
                sender: {
                    email: 'help@merchtech.net',
                    name: 'MerchTech QR Platform'
                },
                to: [{ email: to }],
                subject: subject,
                htmlContent: htmlContent
            },
            {
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                }
            }
        );
        console.log('✅ SERVER: Email sent successfully via Brevo');
        return response.data;
    } catch (error) {
        console.error('❌ SERVER: Error sending email via Brevo:', error.response ? error.response.data : error.message);
        throw error;
    }
}

if (!stripe) {
  console.log('⚠️ SERVER: Stripe not configured - STRIPE_SECRET_KEY missing');
} else {
  console.log('✅ SERVER: Stripe configured successfully');
  console.log('✅ SERVER: Using key type:', process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST');
}

// Helper functions for user lookup
async function getUserByEmail(email) {
  const result = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getUserByUsername(username) {
  const result = await pool.query(
    'SELECT id FROM users WHERE username = $1',
    [username]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

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
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'This email address is already registered',
        message: 'This email address is already registered'
      });
    }

    const existingUsername = await getUserByUsername(username);
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        error: 'This username is already taken',
        message: 'This username is already taken'
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

    console.log('🔴 SERVER: Registration successful for:', { userId: user.id, email: user.email, username: user.username });
    console.log('🔴 SERVER: ============ REGISTRATION ENDPOINT DEBUG END ============');

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

// Playlist endpoints
app.get('/api/playlists', authenticateToken, async (req, res) => {
  try {
    console.log('🔴 SERVER: Get playlists endpoint hit for user:', req.user?.id);

    const query = `
      SELECT 
        p.*,
        COALESCE(
          JSON_AGG(
            CASE WHEN m.id IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'id', m.id,
                'title', m.title,
                'fileName', m.filename,
                'fileType', m.file_type,
                'filePath', m.file_path,
                'contentType', m.content_type,
                'fileSize', m.filesize,
                'timestamp', m.created_at
              )
            END
          ) FILTER (WHERE m.id IS NOT NULL),
          '[]'::json
        ) as media_files
      FROM playlists p
      LEFT JOIN playlist_media pm ON p.id = pm.playlist_id
      LEFT JOIN media_files m ON pm.media_id = m.id
      WHERE p.user_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const result = await pool.query(query, [req.user.id]);

    const playlists = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      requiresActivationCode: row.requires_activation_code,
      isPublic: row.is_public,
      instagramUrl: row.instagram_url,
      twitterUrl: row.twitter_url,
      facebookUrl: row.facebook_url,
      youtubeUrl: row.youtube_url,
      websiteUrl: row.website_url,
      productLink: row.product_link,
      productLinkTitle: row.product_link_title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mediaFiles: row.media_files || []
    }));

    console.log('🔴 SERVER: Found playlists:', playlists.length);
    res.json(playlists);
  } catch (error) {
    console.error('🔴 SERVER: Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

app.get('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const playlistId = req.params.id;
    console.log('🔴 SERVER: Get playlist by ID:', playlistId);

    const query = `
      SELECT 
        p.*,
        COALESCE(
          JSON_AGG(
            CASE WHEN m.id IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'id', m.id,
                'title', m.title,
                'fileName', m.filename,
                'fileType', m.file_type,
                'filePath', m.file_path,
                'contentType', m.content_type,
                'fileSize', m.filesize,
                'timestamp', m.created_at
              )
            END
          ) FILTER (WHERE m.id IS NOT NULL),
          '[]'::json
        ) as media_files
      FROM playlists p
      LEFT JOIN playlist_media pm ON p.id = pm.playlist_id
      LEFT JOIN media_files m ON pm.media_id = m.id
      WHERE p.id = $1 AND p.user_id = $2
      GROUP BY p.id
    `;

    const result = await pool.query(query, [playlistId, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const row = result.rows[0];
    const playlist = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      requiresActivationCode: row.requires_activation_code,
      isPublic: row.is_public,
      instagramUrl: row.instagram_url,
      twitterUrl: row.twitter_url,
      facebookUrl: row.facebook_url,
      youtubeUrl: row.youtube_url,
      websiteUrl: row.website_url,
      productLink: row.product_link,
      productLinkTitle: row.product_link_title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mediaFiles: row.media_files || []
    };

    console.log('🔴 SERVER: Found playlist:', playlist.name, 'with', playlist.mediaFiles.length, 'media files');
    res.json(playlist);
  } catch (error) {
    console.error('🔴 SERVER: Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

app.post('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const { name, description, mediaFileIds, requiresActivationCode, isPublic } = req.body;
    console.log('🔴 SERVER: Creating playlist:', { name, mediaFileIds: mediaFileIds?.length });

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Create playlist
    const playlistQuery = `
      INSERT INTO playlists (user_id, name, description, requires_activation_code, is_public)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const playlistResult = await pool.query(playlistQuery, [
      req.user.id,
      name,
      description || null,
      requiresActivationCode || false,
      isPublic || false
    ]);

    const playlist = playlistResult.rows[0];

    // Add media files to playlist if provided
    if (mediaFileIds && mediaFileIds.length > 0) {
      const mediaQuery = `
        INSERT INTO playlist_media (playlist_id, media_id)
        VALUES ${mediaFileIds.map((_, i) => `($1, $${i + 2})`).join(', ')}
      `;

      await pool.query(mediaQuery, [playlist.id, ...mediaFileIds]);
    }

    console.log('🔴 SERVER: Created playlist with ID:', playlist.id);
    res.status(201).json({
      id: playlist.id,
      userId: playlist.user_id,
      name: playlist.name,
      description: playlist.description,
      requiresActivationCode: playlist.requires_activation_code,
      isPublic: playlist.is_public,
      createdAt: playlist.created_at,
      mediaFiles: []
    });
  } catch (error) {
    console.error('🔴 SERVER: Error creating playlist:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

app.put('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { name, description, requiresActivationCode, isPublic } = req.body;
    console.log('🔴 SERVER: Updating playlist:', playlistId);

    const query = `
      UPDATE playlists 
      SET name = $1, description = $2, requires_activation_code = $3, is_public = $4, updated_at = NOW()
      WHERE id = $5 AND user_id = $6
      RETURNING *
    `;

    const result = await pool.query(query, [
      name,
      description,
      requiresActivationCode,
      isPublic,
      playlistId,
      req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlist = result.rows[0];
    res.json({
      id: playlist.id,
      userId: playlist.user_id,
      name: playlist.name,
      description: playlist.description,
      requiresActivationCode: playlist.requires_activation_code,
      isPublic: playlist.is_public,
      createdAt: playlist.created_at,
      updatedAt: playlist.updated_at
    });
  } catch (error) {
    console.error('🔴 SERVER: Error updating playlist:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

app.delete('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const playlistId = req.params.id;
    console.log('🔴 SERVER: Deleting playlist:', playlistId);

    // Delete playlist (cascade will handle playlist_media)
    const result = await pool.query(
      'DELETE FROM playlists WHERE id = $1 AND user_id = $2 RETURNING *',
      [playlistId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    console.log('🔴 SERVER: Deleted playlist:', result.rows[0].name);
    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('🔴 SERVER: Error deleting playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

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

// ==================== MEDIA ENDPOINTS ====================

// Get all media files for user
app.get('/api/media', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Get media files endpoint hit');
  try {
    const result = await pool.query(
      'SELECT * FROM media_files WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    console.log('🔴 SERVER: Found media files:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('🔴 SERVER: Get media files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload media file
app.post('/api/media', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Upload media file endpoint hit');
  try {
    const { 
      title, 
      filePath, 
      url, 
      filename, 
      fileType, 
      contentType, 
      filesize, 
      duration, 
      uniqueId 
    } = req.body;

    if (!title || !filePath || !fileType) {
      return res.status(400).json({ error: 'Title, file path, and file type are required' });
    }

    // Check file size limit (1GB)
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (filesize && filesize > maxSize) {
      return res.status(413).json({ 
        error: 'File too large', 
        message: `File size ${Math.round((filesize / 1024 / 1024) * 100) / 100}MB exceeds the 1GB limit` 
      });
    }

    const result = await pool.query(      `INSERT INTO media_files (
        user_id, title, file_path, url, filename, file_type, 
        content_type, filesize, duration, unique_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) 
      RETURNING *`,
      [
        req.user.userId, title, filePath, url || filePath, filename, 
        fileType, contentType, filesize, duration, uniqueId
      ]
    );

    console.log('🔴 SERVER: Media file uploaded:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('🔴 SERVER: Upload media file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get media file by ID
app.get('/api/media/:id', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Get media file by ID endpoint hit');
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM media_files WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    console.log('🔴 SERVER: Found media file:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 SERVER: Get media file by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete media file
app.delete('/api/media/:id', authenticateToken, async (req, res) => {
  console.log('🔴 SERVER: Delete media file endpoint hit');
  try {
    const { id } = req.params;

    console.log('🔴 SERVER: Attempting to delete media file:', {
      id: id,
      userId: req.user.userId,
      userDetails: req.user
    });

    // First check if the file exists and belongs to the user
    const checkResult = await pool.query(
      'SELECT id, title FROM media_files WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (checkResult.rows.length === 0) {
      console.log('🔴 SERVER: Media file not found or does not belong to user:', id);
      return res.status(404).json({ error: 'Media file not found or access denied' });
    }

    const fileToDelete = checkResult.rows[0];
    console.log('🔴 SERVER: Found file to delete:', fileToDelete);

    // Now delete the file
    const deleteResult = await pool.query(
      'DELETE FROM media_files WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.userId]
    );

    if (deleteResult.rows.length === 0) {
      console.log('🔴 SERVER: Delete operation failed for file:', id);
      return res.status(500).json({ error: 'Failed to delete media file' });
    }

    const deletedFile = deleteResult.rows[0];
    console.log('🔴 SERVER: Media file deleted successfully:', {
      id: deletedFile.id,
      title: deletedFile.title,
      user_id: deletedFile.user_id
    });

    res.json({ 
      success: true,
      message: 'Media file deleted successfully',
      deletedFile: {
        id: deletedFile.id,
        title: deletedFile.title
      }
    });
  } catch (error) {
    console.error('🔴 SERVER: Delete media file error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verification_token VARCHAR(255)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        requires_activation_code BOOLEAN DEFAULT FALSE,
        is_public BOOLEAN DEFAULT FALSE,
        instagram_url VARCHAR(500),
        twitter_url VARCHAR(500),
        facebook_url VARCHAR(500),
        youtube_url VARCHAR(500),
        website_url VARCHAR(500),
        product_link VARCHAR(500),
        product_link_title VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS media_files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        url TEXT,
        filename VARCHAR(255),
        file_type VARCHAR(50) NOT NULL,
        content_type VARCHAR(100),
        filesize INTEGER,
        duration INTEGER,
        unique_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS playlist_media (
        id SERIAL PRIMARY KEY,
        playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
        media_id INTEGER REFERENCES media_files(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(playlist_id, media_id)
      )
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

      // Always reset admin password and ensure proper permissions on startup
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
      console.log('✅ Admin user password reset to: admin123! and permissions updated');
    }

    console.log('Database connected and tables initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't exit the process, just log the error
  }
}

// Start server with cleanup and improved process management
async function startServer() {
  try {
    // Clean up any existing processes on this port
    await cleanupPort();

    // Initialize database
    await initializeDatabase();

    // Start the server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Simple server running on port ${PORT}`);
      console.log(`📍 API available at: http://0.0.0.0:${PORT}/api`);
      console.log(`🌐 External API URL: https://${process.env.REPLIT_DEV_DOMAIN}:${PORT}/api`);
      console.log(`❤️ Health check URL: https://${process.env.REPLIT_DEV_DOMAIN}:${PORT}/api/health`);
      console.log(`🔒 Process ID: ${process.pid}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error('❌ Port', PORT, 'is already in use');
        console.log('🧹 Attempting to clean up and restart...');
        setTimeout(() => {
          server.close(() => {
            cleanupPort().then(() => {
              startServer();
            });
          });
        }, 2000);
      }
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();