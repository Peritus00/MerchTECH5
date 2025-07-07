const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// 🔒 SECURITY IMPORTS - FREE SECURITY HARDENING
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const winston = require('winston');

// Import S3 service (will be undefined if not available)
let s3Service;
try {
  const s3Module = require('./s3Service.js');
  s3Service = s3Module.S3Service;
  console.log('✅ S3 service loaded successfully (JS)');
} catch (jsError) {
  console.log('⚠️  S3 service not available, using local/base64 storage');
  console.log('   Error:', jsError.message);
  s3Service = null;
}

console.log('DEBUG: Server script starting...');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
console.log('DEBUG: .env loaded, DATABASE_URL:', process.env.DATABASE_URL);
console.log('DEBUG: NODE_ENV:', process.env.NODE_ENV);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

// 🔒 SECURITY LOGGER SETUP - FREE MONITORING
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../../logs/security.log') }),
    new winston.transports.Console({ level: 'error' })
  ]
});

// 🔒 RATE LIMITING - FREE DDOS & BRUTE FORCE PROTECTION
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    securityLogger.warn({
      type: 'rate_limit_exceeded',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({ error: 'Too many login attempts, please try again later.' });
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    securityLogger.warn({
      type: 'rate_limit_exceeded',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({ error: 'Too many requests from this IP, please try again later.' });
  }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: { error: 'Too many file uploads, please try again later.' }
});

// 🔒 SLOW DOWN REPEATED REQUESTS - FREE PROTECTION
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 10, // allow 10 requests per window without delay
  delayMs: () => 500, // add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // maximum delay of 20 seconds
});

// Use a single uploads directory at the project root so that static
// file URLs work consistently in all deployment / execution contexts.
// __dirname here is   services/Server  so we go two levels up.
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  // Create recursively in case the ancestor path does not exist yet.
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`✅ Created uploads directory: ${uploadsDir}`);
} else {
  console.log(`📂 Uploads directory already exists: ${uploadsDir}`);
}

// 🔒 SECURE FILE UPLOAD CONFIGURATION - FREE FILE PROTECTION
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});
const upload = multer({ storage: storage });

const initializeDatabase = async () => {
  console.log('DEBUG: Entered initializeDatabase');
  const client = await pool.connect();
  try {
    console.log('DEBUG: Initializing database schema...');
    // ... existing code ...
    console.log('DEBUG: Database schema initialized successfully.');
  } catch (err) {
    console.error('DEBUG: Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
};

// Health check route for root
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

// --- HEALTH ENDPOINT ---
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const isAdmin = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length > 0 && result.rows[0].is_admin) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: Admins only' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- AUTH ROUTES ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ user, token });
  } catch (error) {
    console.error('🔴 LOGIN ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username) return res.status(400).json({ error: 'Email, password, and username are required' });
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR username = $2', [email, username]);
    if (existingUser.rows.length > 0) return res.status(409).json({ error: 'Email or username already exists' });
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, is_admin`,
      [email, username, hashedPassword]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ userId: newUser.id, email: newUser.email, isAdmin: newUser.is_admin }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ user: newUser, token });
  } catch (error) {
    console.error('🔴 REGISTER ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl: fileUrl });
});

// ---------- MEDIA ROUTES ----------
app.post('/api/media', authenticateToken, async (req, res) => {
  try {
    const { title, filePath, url, filename, fileType, contentType, filesize, duration, uniqueId } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }
    // SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_audio_files FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    const countResult = await pool.query('SELECT COUNT(*) FROM media WHERE user_id = $1', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);
    let maxAudioFiles;
    if (user?.max_audio_files !== null && user?.max_audio_files !== undefined) {
      maxAudioFiles = user.max_audio_files;
    } else {
      const limits = { free: { maxAudioFiles: 3 }, basic: { maxAudioFiles: 10 }, premium: { maxAudioFiles: 20 } };
      maxAudioFiles = (limits[userTier] || limits.free).maxAudioFiles;
    }
    if (currentCount >= maxAudioFiles) {
      return res.status(403).json({ error: `Audio file limit reached. You have reached your limit of ${maxAudioFiles} audio files. Please contact support if you need to increase your limit.`, limit: maxAudioFiles, current: currentCount, subscriptionTier: userTier, isCustomLimit: user?.max_audio_files !== null && user?.max_audio_files !== undefined });
    }
    const result = await pool.query(
      `INSERT INTO media (user_id, title, file_path, url, filename, file_type, content_type, filesize, duration, unique_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.user.userId, title, filePath || url, url, filename, fileType, contentType, filesize, duration, uniqueId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

app.get('/api/media', authenticateToken, async (req, res) => {
  try {
    const mine = req.query.mine === 'true';
    let result;
    if (mine) {
      result = await pool.query('SELECT * FROM media WHERE user_id = $1 ORDER BY created_at DESC', [req.user.userId]);
    } else {
      result = await pool.query('SELECT * FROM media ORDER BY created_at DESC');
    }
    res.json({ media: result.rows });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM media ORDER BY created_at DESC');
    res.json({ media: result.rows });
  } catch (error) {
    console.error('Error fetching all media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    const media = result.rows[0];
    let properUrl = media.url;
    if (media.url && media.url.startsWith('data:')) {
      properUrl = `${process.env.API_BASE_URL || 'http://192.168.1.70:5001'}/api/media/${id}/stream`;
    } else if (media.filename) {
      properUrl = `${process.env.API_BASE_URL || 'http://192.168.1.70:5001'}/uploads/${media.filename}`;
    }
    const mediaResponse = { ...media, url: properUrl, title: media.title, fileType: media.file_type, contentType: media.content_type };
    res.json({ media: mediaResponse });
  } catch (error) {
    console.error('Error fetching media by ID:', error);
    res.status(500).json({ error: 'Failed to fetch media file' });
  }
});

app.get('/api/media/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    const media = result.rows[0];
    if (!media.url || !media.url.startsWith('data:')) {
      return res.status(400).json({ error: 'Media file is not stored as base64 data' });
    }
    const dataUrlMatch = media.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      return res.status(400).json({ error: 'Invalid base64 data format' });
    }
    const [, mimeType, base64Data] = dataUrlMatch;
    const audioBuffer = Buffer.from(base64Data, 'base64');
    res.setHeader('Content-Type', mimeType || 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error streaming media:', error);
    res.status(500).json({ error: 'Failed to stream media file' });
  }
});

app.delete('/api/media/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const mediaResult = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    const media = mediaResult.rows[0];
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    const isAdmin = userResult.rows[0]?.is_admin;
    if (media.user_id !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await pool.query('DELETE FROM media WHERE id = $1', [id]);
    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    console.error('Error deleting media:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// ---------- PRODUCT ROUTES ----------

// Get products – supports ?mine=true to return only caller's items
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const mine = req.query.mine === 'true';
    let result;
    if (mine) {
      result = await pool.query('SELECT * FROM products WHERE user_id = $1 AND is_deleted = false', [req.user.userId]);
    } else {
      result = await pool.query('SELECT * FROM products WHERE is_deleted = false');
    }
    const productsWithPrices = result.rows.map(p => {
      let pricesArr = p.prices;
      if (!pricesArr || !pricesArr.length) {
        const amount = p.price || (p.metadata && (p.metadata.price || p.metadata.unit_amount)) || 0;
        pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
      }
      return { ...p, prices: pricesArr };
    });
    res.json({ products: productsWithPrices });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public all-products route (no auth)
app.get('/api/products/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE is_deleted = false');
    const productsWithPrices = result.rows.map(p => {
      let pricesArr = p.prices;
      if (!pricesArr || !pricesArr.length) {
        const amount = p.price || (p.metadata && (p.metadata.price || p.metadata.unit_amount)) || 0;
        pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
      }
      return { ...p, prices: pricesArr };
    });
    res.json({ products: productsWithPrices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- PLAYLIST ROUTES ----------

// Helper function to get playlist with media files
async function getPlaylistWithMedia(playlistId) {
  console.log('🔴 GET_PLAYLIST: Fetching playlist:', playlistId);
  
  const playlistResult = await pool.query(
    `SELECT p.*, u.username 
     FROM playlists p 
     JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1`,
    [playlistId]
  );

  if (playlistResult.rows.length === 0) {
    console.log('🔴 GET_PLAYLIST: Playlist not found:', playlistId);
    return null;
  }

  const playlist = playlistResult.rows[0];
  console.log('🔴 GET_PLAYLIST: Raw playlist data:', playlist);

  // Get media files for this playlist
  const mediaResult = await pool.query(
    `SELECT m.*, pm.display_order 
     FROM media m 
     JOIN playlist_media pm ON m.id = pm.media_id 
     WHERE pm.playlist_id = $1 
     ORDER BY pm.display_order`,
    [playlistId]
  );

  playlist.mediaFiles = mediaResult.rows.map(media => ({
    id: media.id,
    title: media.title,
    filePath: `/uploads/${media.filename}`,
    fileType: media.file_type,
    contentType: media.content_type,
    url: `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${media.filename}`,
  }));

  // Convert snake_case fields to camelCase for frontend compatibility
  const convertedPlaylist = {
    ...playlist,
    requiresActivationCode: playlist.requires_activation_code,
    isPublic: playlist.is_public,
    userId: playlist.user_id,
    createdAt: playlist.created_at,
    updatedAt: playlist.updated_at
  };
  
  console.log('🔴 GET_PLAYLIST: Converted playlist data:', {
    id: convertedPlaylist.id,
    name: convertedPlaylist.name,
    requiresActivationCode: convertedPlaylist.requiresActivationCode,
    requires_activation_code: playlist.requires_activation_code,
    isPublic: convertedPlaylist.isPublic,
    is_public: playlist.is_public
  });
  
  return convertedPlaylist;
}

app.get('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username 
       FROM playlists p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.user_id = $1 
       ORDER BY p.created_at DESC`,
      [req.user.userId]
    );

    const playlists = await Promise.all(
      result.rows.map(async (playlist) => {
        return await getPlaylistWithMedia(playlist.id);
      })
    );

    res.json({ playlists });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

app.get('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const playlist = await getPlaylistWithMedia(id);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    res.json({ playlist });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// ---------- QR CODES ROUTES ----------

app.get('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: Fetching QR codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT qr.*, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.owner_id = $1 AND qr.is_active = true
       GROUP BY qr.id
       ORDER BY qr.created_at DESC`,
      [req.user.userId]
    );
    
    const qrCodes = result.rows.map(qr => ({
      ...qr,
      options: typeof qr.options === 'string' ? JSON.parse(qr.options) : qr.options,
      scanCount: parseInt(qr.scan_count) || 0
    }));
    
    console.log('📱 QR_CODES: Found', qrCodes.length, 'QR codes');
    res.json({ qrCodes });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error fetching QR codes:', error);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// ---------- SLIDESHOWS ROUTES ----------

app.get('/api/slideshows', authenticateToken, async (req, res) => {
  try {
    console.log('🎬 SLIDESHOWS: Fetching slideshows for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT s.* FROM slideshows s 
       WHERE s.user_id = $1 
       ORDER BY s.created_at DESC`,
      [req.user.userId]
    );
    
    // Get images for each slideshow
    const slideshows = await Promise.all(
      result.rows.map(async (slideshow) => {
        const imagesResult = await pool.query(
          `SELECT * FROM slideshow_images 
           WHERE slideshow_id = $1 
           ORDER BY display_order`,
          [slideshow.id]
        );
        
        return {
          ...slideshow,
          images: imagesResult.rows.map(img => ({
            id: img.id,
            slideshowId: img.slideshow_id,
            url: img.image_url,
            caption: img.caption,
            position: img.display_order,
            createdAt: img.created_at
          }))
        };
      })
    );
    
    console.log('🎬 SLIDESHOWS: Found', slideshows.length, 'slideshows');
    res.json({ slideshows });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error fetching slideshows:', error);
    res.status(500).json({ error: 'Failed to fetch slideshows' });
  }
});

// ---------- ACTIVATION CODES ROUTES ----------

app.get('/api/activation-codes/generated', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching all generated codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name,
              'playlist' as content_type
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.created_by = $1
       ORDER BY ac.created_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'generated codes');
    res.json({ activationCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching generated codes:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
  }
});

app.get('/api/activation-codes/my-access', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching access codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, uac.attached_at,
              p.name as playlist_name,
              s.name as slideshow_name,
              CASE WHEN ac.playlist_id IS NOT NULL THEN 'playlist' ELSE 'slideshow' END as content_type
       FROM user_activation_codes uac
       JOIN activation_codes ac ON uac.activation_code_id = ac.id
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE uac.user_id = $1 AND ac.is_active = true
       ORDER BY uac.attached_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'access codes');
    res.json({ accessCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching access codes:', error);
    res.status(500).json({ error: 'Failed to fetch access codes' });
  }
});

// Ensure the app listens on process.env.PORT
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
