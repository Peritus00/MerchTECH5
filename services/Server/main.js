// Load .env from project root regardless of where the script is run from
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const s3Service = require('./s3Service');
const axios = require('axios');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

console.log('DEBUG: Server script starting...');
console.log('DEBUG: .env loaded, DATABASE_URL:', process.env.DATABASE_URL ? 'configured' : 'missing');
console.log('DEBUG: NODE_ENV:', process.env.NODE_ENV);

const app = express();
// Trust proxy headers so req.ip and related helpers reflect the original client IP
app.set('trust proxy', true);
const PORT = process.env.PORT || 5001;

// --- CORS Configuration ---
// When credentials: true, cannot use '*' - must specify exact origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin) || allowedOrigins.some(allowed => origin.includes(allowed))) {
      callback(null, true);
    } else {
      // Log blocked origins for debugging
      console.log('🔗 CORS: Blocked origin:', origin);
      callback(null, true); // Still allow for now, but log it
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
  credentials: true, // Allow cookies to be sent
  exposedHeaders: ['Set-Cookie'] // Expose Set-Cookie header
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes

// Log environment-specific variables for debugging
console.log('🔧 Initializing server...');
console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   - Frontend URL: ${process.env.FRONTEND_URL}`);

// --- MIDDLEWARE ---
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'",
        "https://merchtech5-production.up.railway.app",
        "https://www.merchtrader.org",
        "https://merchtrader.org",
        "https://*.amazonaws.com", // For S3
        "https://*.stripe.com", // For Stripe
        "https://api.brevo.com", // For email service
        "https://app.termly.io", // For Termly privacy/cookie compliance
        "https://us.consent.api.termly.io", // Added for Termly consent API
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Needed for Expo/React
        "https://js.stripe.com",
        "https://app.termly.io",
        "https://*.termly.io", // Added for broader Termly compatibility
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Needed for Expo/React styles
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.amazonaws.com", // For S3 images
        "https://merchtech5-production.up.railway.app", // For image proxy
        "https://www.merchtrader.org",
        "https://merchtrader.org",
      ],
      mediaSrc: [
        "'self'",
        "https://merchtech5-production.up.railway.app", // For audio/video streaming
        "https://www.merchtrader.org",
        "https://merchtrader.org",
        "https://*.amazonaws.com", // For S3 media files
      ],
      fontSrc: [
        "'self'",
        "data:",
      ],
    },
  },
}));

// Admin-only debug endpoint is defined later, after auth middleware declarations

// 🔧 INCREASED LIMITS FOR LARGE VIDEO FILES
app.use(express.json({ limit: '1gb' })); // Increased from 50mb to 1gb
app.use(express.urlencoded({ limit: '1gb', extended: true })); // Increased from 50mb to 1gb

// --- STATIC FILE SERVING ---
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));
const distDir = path.join(__dirname, '../../dist');
app.use(express.static(distDir));

const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    const requestId = `req_${Date.now()}`;
    console.log(`🔍 FILE_FILTER [${requestId}]: Checking file:`, {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });

    const allowedTypes = /jpeg|jpg|png|gif|webp|mp3|wav|m4a|aac|ogg|mp4|webm|avi|mov|wmv|flv|mkv|quicktime/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                    file.mimetype.startsWith('audio/') || 
                    file.mimetype.startsWith('image/') ||
                    file.mimetype.startsWith('video/');
    
    if (extname || mimetype) {
      console.log(`✅ FILE_FILTER [${requestId}]: File accepted`);
      cb(null, true);
    } else {
      const filterError = new Error('File type not allowed. Only images, audio, and video are supported.');
      filterError.code = 'FILE_TYPE_NOT_ALLOWED';
      console.log(`❌ FILE_FILTER [${requestId}]: File rejected. Type not allowed: ${file.mimetype}`);
      cb(filterError, false);
    }
  }
});

// --- CONFIGURATION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 20000,
  max: 10
});
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
const SALT_ROUNDS = 10;

// --- S3 Service Setup ---
try {
  if (process.env.AWS_ACCESS_KEY_ID) {
    console.log('AWS Access Key Suffix:', process.env.AWS_ACCESS_KEY_ID.slice(-4));
  }
  if (process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('AWS Secret Key Suffix:', process.env.AWS_SECRET_ACCESS_KEY.slice(-4));
  }
  console.log('✅ S3 service loaded and instantiated successfully');
  console.log('   AWS Region:', process.env.AWS_REGION);
  console.log('   S3 Bucket:', process.env.AWS_S3_BUCKET_NAME);
  console.log('   AWS Access Key:', process.env.AWS_ACCESS_KEY_ID ? 'Configured' : 'Missing');
} catch (error) {
  console.error('❌ S3 service initialization failed:', error);
}

// Initialize Stripe after loading environment variables
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- Brevo Email Transporter ---
// Forcing a clean redeployment to fix email issue - 2025-09-07
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: '8e773a002@smtp-brevo.com',
    pass: process.env.BREVO_SMTP_KEY,
  },
});

const allowedOrigins = [
  'https://app.merchtrader.org',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://merchtech.app',
  'exp://192.168.1.70:8081',
  // Add production frontend URLs
  'https://merchtech5-production.up.railway.app',
  'https://merchtrader.org',
  'https://www.merchtrader.org',
  // Add Vercel deployment URLs (common patterns)
  'https://merchtechapp5.vercel.app',
  'https://merchtech-app.vercel.app',
  // Add any custom domain that might be configured
  process.env.FRONTEND_URL,
  process.env.EXPO_PUBLIC_FRONTEND_URL
].filter(Boolean); // Remove any undefined values

// Add a separate, more detailed CORS error logger to help debug future issues
app.use((req, res, next) => {
  console.log('🔗 CORS: Request from origin:', req.headers.origin);
  console.log('🔗 CORS: Request cookies:', req.headers.cookie ? 'present' : 'missing');
  next();
});

app.use('/uploads', express.static(uploadsDir));

// Handle domain redirects for legacy URLs
app.use((req, res, next) => {
  const host = req.get('host');
  if (host === 'merchtechapp5-production.up.railway.app') {
    console.log(`🔀 REDIRECT: Redirecting from ${host} to merchtech5-production.up.railway.app`);
    return res.redirect(301, `https://merchtech5-production.up.railway.app${req.originalUrl}`);
  }
  next();
});

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

// Optional auth: attaches req.user if token is valid; otherwise continues without auth
const authenticateTokenOptional = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // If invalid token, proceed as guest
      return next();
    }
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

// --- ROUTES ---

// Admin-only debug endpoint to inspect IP/geo headers (no raw IP storage)
app.get('/api/admin/geo-debug', authenticateToken, isAdmin, (req, res) => {
  const ip = getClientIp(req);
  const fromHeaders = inferGeo(req);
  res.json({
    ip,
    headers: {
      'cf-connecting-ip': req.headers['cf-connecting-ip'] || null,
      'cf-ipcountry': req.headers['cf-ipcountry'] || null,
      'x-vercel-ip-country': req.headers['x-vercel-ip-country'] || null,
      'x-vercel-ip-country-region': req.headers['x-vercel-ip-country-region'] || null,
      'x-vercel-ip-city': req.headers['x-vercel-ip-city'] || null,
      'fastly-country-code': req.headers['fastly-country-code'] || null,
      'fly-client-ip-country': req.headers['fly-client-ip-country'] || null,
      'x-appengine-country': req.headers['x-appengine-country'] || null,
      'x-appengine-region': req.headers['x-appengine-region'] || null,
      'x-appengine-city': req.headers['x-appengine-city'] || null,
      'x-real-ip': req.headers['x-real-ip'] || null,
      'true-client-ip': req.headers['true-client-ip'] || null,
      'x-forwarded-for': req.headers['x-forwarded-for'] || null,
    },
    inferredGeo: fromHeaders,
    provider: process.env.GEO_PROVIDER || 'none'
  });
});

// Submit browser geolocation to upgrade recent scan's geo (no auth; links via cookie)
app.post('/api/analytics/geo', async (req, res) => {
  try {
    const { qrCodeId, lat, lng, accuracy } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat, lng required' });
    }
    // Round server-side as well for privacy
    const r = (n) => Math.round(n * 100) / 100;
    const latR = r(lat);
    const lngR = r(lng);
    const visitorId = getOrSetVisitorId(req, res);

    // Find most recent scan for this visitor and QR within dedupe window (default 60s)
    const windowSeconds = parseInt(process.env.SCAN_DEDUP_WINDOW_SECONDS || '60', 10);
    let recent;
    if (qrCodeId) {
      recent = await pool.query(
        `SELECT id, city, region, country_code, location_source
           FROM qr_scans
          WHERE qr_code_id = $1
            AND COALESCE(qr_visitor_id, visitor_id::text) = $2
            AND scanned_at >= NOW() - ($3 || ' seconds')::interval
          ORDER BY scanned_at DESC
          LIMIT 1`,
        [qrCodeId, visitorId, windowSeconds]
      );
    } else {
      // Fallback: last scan for this visitor across any QR in the window
      recent = await pool.query(
        `SELECT id, city, region, country_code, location_source
           FROM qr_scans
          WHERE COALESCE(qr_visitor_id, visitor_id::text) = $1
            AND scanned_at >= NOW() - ($2 || ' seconds')::interval
          ORDER BY scanned_at DESC
          LIMIT 1`,
        [visitorId, windowSeconds]
      );
    }

    if (recent.rowCount === 0) {
      // Nothing to upgrade; silently accept
      return res.json({ success: true, updated: 0 });
    }

    let city = null, region = null, countryCode = null;
    // Optional reverse geocoding
    try {
      if (process.env.GEOCODER_PROVIDER && process.env.GEOCODER_API_KEY) {
        const provider = String(process.env.GEOCODER_PROVIDER).toLowerCase();
        if (provider === 'opencage') {
          const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(latR + ',' + lngR)}&key=${process.env.GEOCODER_API_KEY}&no_annotations=1&limit=1`;
          const resp = await axios.get(url, { timeout: 2500 });
          const comp = resp?.data?.results?.[0]?.components || {};
          city = comp.city || comp.town || comp.village || null;
          region = comp.state || comp.county || null;
          countryCode = comp.country_code ? String(comp.country_code).toUpperCase() : null;
        }
      }
    } catch (_e) {
      // Ignore geocoder failures
    }

    // Only upgrade if current row is lower priority or fields are empty
    const row = recent.rows[0];
    const shouldUpgrade = row.location_source === 'auto' || row.location_source === 'unknown' || !row.city;

    if (!shouldUpgrade) {
      // Still update lat/lng for analytics if present
      await pool.query(
        `UPDATE qr_scans SET geo_lat = COALESCE($2, geo_lat), geo_lng = COALESCE($3, geo_lng), geo_accuracy_m = COALESCE($4, geo_accuracy_m)
          WHERE id = $1`,
        [row.id, latR, lngR, accuracy || null]
      );
      return res.json({ success: true, updated: 0 });
    }

    await pool.query(
      `UPDATE qr_scans
          SET geo_lat = $2, geo_lng = $3, geo_accuracy_m = $4,
              city = COALESCE($5, city), region = COALESCE($6, region), country_code = COALESCE($7, country_code),
              location_source = 'browser', geo_consent = 'browser-granted'
        WHERE id = $1`,
      [row.id, latR, lngR, accuracy || null, city, region, countryCode]
    );
    return res.json({ success: true, updated: 1 });
  } catch (e) {
    console.error('📍 Browser geo submit failed:', e.message);
    return res.status(500).json({ error: 'Failed to save geolocation' });
  }
});

app.get('/api/health', (req, res) => {
    try {
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            services: {
                database: !!process.env.DATABASE_URL,
                brevo: !!process.env.BREVO_API_KEY
            }
        };
        
        // Safely check S3 service
        try {
            healthData.services.s3 = s3Service && s3Service.isConfigured ? s3Service.isConfigured() : false;
        } catch (error) {
            console.error('Health check S3 error:', error);
            healthData.services.s3 = false;
        }
        
        res.status(200).json(healthData);
    } catch (error) {
        console.error('Health check error:', error);
        // Always return 200 for Railway health checks, even if there are issues
        res.status(200).json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            error: error.message
        });
    }
});

// Backup health endpoint that's super simple
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/api/admin/all-users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, 
             email, 
             username, 
             created_at, 
             updated_at, 
             is_admin, 
             is_suspended, 
             subscription_tier,
             max_products,
             max_audio_files,
             max_playlists,
             max_qr_codes,
             max_slideshows,
             max_videos,
             max_activation_codes
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users with scan counts
app.get('/api/admin/users/search', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query parameter "q" is required' });
    }

    const searchTerm = `%${q}%`;
    // Use deduplication to match analytics approach (unique visitor per minute)
    const result = await pool.query(`
      WITH dedup_scans AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.qr_code_id
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT u.id, 
             u.email, 
             u.username,
             u.created_at,
             COALESCE(COUNT(ds.qr_code_id), 0)::integer as total_scans
      FROM users u
      LEFT JOIN qr_codes q ON q.user_id = u.id
      LEFT JOIN dedup_scans ds ON ds.qr_code_id = q.id
      WHERE u.email ILIKE $1 OR u.username ILIKE $1
      GROUP BY u.id, u.email, u.username, u.created_at
      ORDER BY u.email
      LIMIT 50
    `, [searchTerm]);

    // Transform to camelCase for frontend
    const users = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      username: row.username,
      createdAt: row.created_at,
      totalScans: row.total_scans
    }));

    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user scan details
app.get('/api/admin/users/:id/scans', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Get user info
    const userResult = await pool.query(
      'SELECT id, email, username, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get total scan count (deduplicated to match analytics approach)
    const scanCountResult = await pool.query(`
      WITH dedup_scans AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.qr_code_id
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT COUNT(*)::integer as total_scans
      FROM dedup_scans
    `, [userId]);

    // Get breakdown by QR code (deduplicated to match analytics approach)
    const qrBreakdownResult = await pool.query(`
      WITH dedup_scans AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.qr_code_id
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT q.id as qr_code_id,
             q.name as qr_code_name,
             COALESCE(COUNT(ds.qr_code_id), 0)::integer as scan_count
      FROM qr_codes q
      LEFT JOIN dedup_scans ds ON ds.qr_code_id = q.id
      WHERE q.user_id = $1
      GROUP BY q.id, q.name
      ORDER BY scan_count DESC, q.name
    `, [userId]);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.created_at
      },
      totalScans: scanCountResult.rows[0]?.total_scans || 0,
      qrCodeBreakdown: qrBreakdownResult.rows.map(row => ({
        qrCodeId: row.qr_code_id,
        qrCodeName: row.qr_code_name,
        scanCount: row.scan_count
      }))
    });
  } catch (error) {
    console.error('Error fetching user scan details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset user scan counts
app.delete('/api/admin/users/:id/scans', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Verify user exists
    const userResult = await pool.query('SELECT id, email, username FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get count of scans to be deleted for logging
    const countResult = await pool.query(`
      SELECT COUNT(*)::integer as scan_count
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
    `, [userId]);

    const scanCount = countResult.rows[0]?.scan_count || 0;

    // Delete all scans for user's QR codes
    const deleteResult = await pool.query(`
      DELETE FROM qr_scans
      WHERE qr_code_id IN (
        SELECT id FROM qr_codes WHERE user_id = $1
      )
    `, [userId]);

    console.log(`Admin ${req.user.userId} reset scan counts for user ${userId} (${userResult.rows[0].email}): ${scanCount} scans deleted`);

    res.json({
      message: 'Scan counts reset successfully',
      deletedScans: scanCount,
      user: {
        id: userResult.rows[0].id,
        email: userResult.rows[0].email,
        username: userResult.rows[0].username
      }
    });
  } catch (error) {
    console.error('Error resetting user scan counts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Analytics helpers ---
function getClientIp(req) {
  const candidates = [
    req.headers['cf-connecting-ip'],
    req.headers['true-client-ip'],
    req.headers['x-real-ip'],
    Array.isArray(req.headers['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : (req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
    req.ip, // respects trust proxy
    req.socket?.remoteAddress,
  ].filter(Boolean);
  const raw = candidates.find(Boolean);
  if (!raw) return null;
  if (raw === '::1') return '127.0.0.1';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function parseUserAgent(ua) {
  if (!ua) return { deviceType: 'Unknown', browserName: 'Unknown', operatingSystem: 'Unknown' };
  const lower = ua.toLowerCase();
  const deviceType = /mobile|android|iphone|ipad/.test(lower) ? 'mobile' : /tablet/.test(lower) ? 'tablet' : 'desktop';
  const operatingSystem = /windows/.test(lower)
    ? 'Windows'
    : /mac os x|macintosh/.test(lower)
    ? 'macOS'
    : /android/.test(lower)
    ? 'Android'
    : /ios|iphone|ipad/.test(lower)
    ? 'iOS'
    : /linux/.test(lower)
    ? 'Linux'
    : 'Unknown';
  const browserName = /chrome\//.test(lower)
    ? 'Chrome'
    : /safari\//.test(lower) && !/chrome\//.test(lower)
    ? 'Safari'
    : /firefox\//.test(lower)
    ? 'Firefox'
    : /edg\//.test(lower)
    ? 'Edge'
    : 'Unknown';
  return { deviceType, browserName, operatingSystem };
}

// Helper: parse basic UTM params from query string
function extractUtm(query) {
  return {
    utm_source: query.utm_source || null,
    utm_medium: query.utm_medium || null,
    utm_campaign: query.utm_campaign || null,
    utm_term: query.utm_term || null,
    utm_content: query.utm_content || null,
  };
}

// Shared scan writer with dedupe and graceful fallbacks
// Accepts optional userLocation from request body for user-provided location data
// Accepts optional visitorId from request body as fallback when cookies don't work
async function writeScan(poolLike, qrCodeId, req, res, userLocation = null, userAge = null, userGender = null, fallbackVisitorId = null) {
  const geo = await resolveGeo(req);
  console.log('💾 writeScan: Geo data received from resolveGeo:', JSON.stringify(geo));
  const ua = req.headers['user-agent'] || '';
  const parsed = parseUserAgent(ua);
  const referrer = req.headers['referer'] || req.headers['referrer'] || null;
  const utm = extractUtm(req.query || {});
  const visitorId = getOrSetVisitorId(req, res, fallbackVisitorId);

  // Determine location source: 'user' if provided by user, 'auto' if from IP/headers, 'unknown' otherwise
  let locationSource = 'unknown';
  if (userLocation && userLocation.city && userLocation.state) {
    locationSource = 'user';
  } else if (geo.city || geo.countryCode) {
    locationSource = 'auto';
  }

  try {
    // Manual dedupe guard in case the unique index is missing or not yet applied
    // If demographics are provided, check for existing scan within 1 hour (instead of 60 seconds)
    // This allows updating existing scans with demographics instead of creating duplicates
    const dedupeWindowSeconds = (userAge || userGender) ? 3600 : 60; // 1 hour for demographics, 60s otherwise
    
    // Only attempt deduplication if we have a visitor ID
    if (visitorId) {
      try {
        console.log('💾 writeScan: Checking for existing scan:', {
          qrCodeId,
          visitorId: visitorId?.substring(0, 8) + '...',
          dedupeWindowSeconds,
          hasDemographics: !!(userAge || userGender)
        });
        const existsRes = await poolLike.query(
          `SELECT id FROM qr_scans
            WHERE qr_code_id = $1
              AND COALESCE(qr_visitor_id, visitor_id::text) = $2
              AND scanned_at >= NOW() - INTERVAL '1 second' * $3
            ORDER BY scanned_at DESC
            LIMIT 1`,
          [qrCodeId, visitorId, dedupeWindowSeconds]
        );
        console.log('💾 writeScan: Dedupe check result:', {
          foundExisting: existsRes.rowCount > 0,
          existingScanId: existsRes.rows[0]?.id
        });
        if (existsRes.rowCount > 0) {
          const existingScanId = existsRes.rows[0].id;
          
          // If demographics are provided, update the existing scan instead of creating duplicate
          if (userAge || userGender) {
            console.log('💾 writeScan: Updating existing scan with demographics:', {
              scanId: existingScanId,
              userAge,
              userGender
            });
            await poolLike.query(
              `UPDATE qr_scans 
               SET user_provided_age_range = COALESCE($1, user_provided_age_range),
                   user_provided_gender = COALESCE($2, user_provided_gender),
                   user_provided_city = COALESCE($3, user_provided_city),
                   user_provided_state = COALESCE($4, user_provided_state),
                   user_provided_zip = COALESCE($5, user_provided_zip)
               WHERE id = $6`,
              [
                userAge || null,
                userGender || null,
                userLocation?.city || null,
                userLocation?.state || null,
                userLocation?.zip || null,
                existingScanId
              ]
            );
            console.log('💾 writeScan: Scan updated successfully');
            return { deduped: true, updated: true, keptId: existingScanId, locationSource };
          }
          
          // No demographics, just skip duplicate
          console.log('💾 writeScan: Scan already exists within dedupe window, skipping');
          return { deduped: true, keptId: existingScanId };
        }
      } catch (dedupeErr) {
        // Log the error but proceed to insert - don't let dedupe errors block scans
        console.error('⚠️  writeScan: Dedupe check failed, proceeding with insert:', dedupeErr.message);
      }
    } else {
      console.log('💾 writeScan: Skipping deduplication - no visitor ID available');
    }

    // Simply insert - the manual dedupe check above already prevents duplicates
    console.log('💾 writeScan: Inserting with values:', {
      qrCodeId,
      visitorId: visitorId?.substring(0, 8) + '...',
      country_code: geo.countryCode || null,
      region: geo.region || null,
      city: geo.city || null,
      location_source: locationSource,
      user_age: userAge || null,
      user_gender: userGender || null
    });
    
    // Cast visitorId to UUID explicitly to avoid type inference issues
    const visitorIdUuid = visitorId ? visitorId : null;
    const result = await poolLike.query(
      `INSERT INTO qr_scans (
         qr_code_id, scanned_at, device_type, browser_name, operating_system,
         country_code, country_name, region, city, referrer,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         visitor_id, qr_visitor_id, user_provided_city, user_provided_state, user_provided_zip, location_source, user_provided_age_range, user_provided_gender
       ) VALUES (
         $1, NOW(), $2, $3, $4,
         $5, NULL, $6, $7, $8,
         $9, $10, $11, $12, $13,
         CAST($14 AS uuid), $15, $16, $17, $18, $19, $20, $21
       )
       RETURNING id`,
      [
        qrCodeId,
        parsed.deviceType,
        parsed.browserName,
        parsed.operatingSystem,
        geo.countryCode || null,
        geo.region || null,
        geo.city || null,
        referrer,
        utm.utm_source,
        utm.utm_medium,
        utm.utm_campaign,
        utm.utm_term,
        utm.utm_content,
        visitorIdUuid, // Will be cast to UUID in SQL
        visitorId, // qr_visitor_id as text
        userLocation?.city || null,
        userLocation?.state || null,
        userLocation?.zip || null,
        locationSource,
        userAge || null,
        userGender || null,
      ]
    );
    
    console.log('💾 writeScan: Insert successful, returned ID:', result.rows[0]?.id);
    return { inserted: true, locationSource, visitorId };
  } catch (e) {
    // Fallback using new schema columns (for any edge cases)
    // CRITICAL FIX: Include visitor_id in fallback to enable deduplication
    console.error('⚠️  writeScan: Main insert failed, using fallback:', e.message);
    console.error('⚠️  writeScan: Error details:', {
      code: e.code,
      constraint: e.constraint,
      detail: e.detail,
      message: e.message
    });
    try {
      // Cast visitorId to UUID explicitly to avoid type inference issues
      const visitorIdUuid = visitorId ? visitorId : null;
      await poolLike.query(
        `INSERT INTO qr_scans (
           qr_code_id, scanned_at, device_type, browser_name, operating_system,
           country_code, region, city, location_source, user_provided_age_range, user_provided_gender,
           visitor_id, qr_visitor_id, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content
         ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, CAST($11 AS uuid), $12, $13, $14, $15, $16, $17, $18)`,
        [
          qrCodeId, 
          parsed.deviceType, 
          parsed.browserName, 
          parsed.operatingSystem,
          geo.countryCode || null,
          geo.region || null,
          geo.city || null,
          locationSource,
          userAge || null,
          userGender || null,
          visitorIdUuid, // Will be cast to UUID in SQL
          visitorId, // qr_visitor_id as text
          referrer,
          utm.utm_source,
          utm.utm_medium,
          utm.utm_campaign,
          utm.utm_term,
          utm.utm_content
        ]
      );
      console.log('💾 writeScan: Fallback insert successful with visitor_id and demographics:', { 
        visitorId: visitorId?.substring(0, 8) + '...',
        userAge, 
        userGender 
      });
      return { inserted: true, fallback: true, visitorId };
    } catch (fallbackErr) {
      console.error('❌ writeScan: Both insert attempts failed:', e.message, fallbackErr.message);
      throw fallbackErr;
    }
  }
}

// Set or get anonymous visitor id
// Accepts optional visitorId from request body as fallback when cookies don't work
function getOrSetVisitorId(req, res, fallbackVisitorId = null) {
  // First, try to get from cookie
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)qr_vid=([^;]+)/);
  let visitorId = match ? match[1] : null;
  
  // If no cookie, try fallback from request body (for cross-origin cookie issues)
  if (!visitorId && fallbackVisitorId) {
    visitorId = fallbackVisitorId;
    console.log('🍪 COOKIE: Using visitor ID from request body (cookie fallback):', visitorId.substring(0, 8) + '...');
  }
  
  // If still no visitor ID, generate a new one
  if (!visitorId) {
    visitorId = uuidv4();
    // Set cookie for 180 days
    // SameSite=Lax allows cookies in cross-site GET requests (like QR redirects)
    // HttpOnly prevents JavaScript access (security)
    // Secure should be true in production but we allow http for local dev
    const isProduction = process.env.NODE_ENV === 'production';
    const origin = req.headers.origin;
    
    // For cross-origin requests, SameSite=None requires Secure
    const sameSite = origin && !origin.includes('localhost') && isProduction ? 'SameSite=None' : 'SameSite=Lax';
    const secureFlag = sameSite === 'SameSite=None' ? '; Secure' : '';
    
    res.setHeader('Set-Cookie', `qr_vid=${visitorId}; Max-Age=${60 * 60 * 24 * 180}; Path=/; ${sameSite}; HttpOnly${secureFlag}`);
    
    console.log('🍪 COOKIE: Setting new visitor ID cookie:', {
      visitorId: visitorId.substring(0, 8) + '...',
      origin: origin || 'no origin',
      sameSite,
      secure: secureFlag.includes('Secure')
    });
  } else if (match) {
    console.log('🍪 COOKIE: Using existing visitor ID from cookie:', visitorId.substring(0, 8) + '...');
  }
  
  return visitorId;
}

// Lightweight geo using cloud/edge headers without storing IP
function inferGeo(req) {
  const cc =
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    req.headers['fastly-country-code'] ||
    req.headers['fly-client-ip-country'] ||
    req.headers['x-appengine-country'] ||
    null;
  const region =
    req.headers['x-vercel-ip-country-region'] ||
    req.headers['x-appengine-region'] ||
    null;
  const city =
    req.headers['x-vercel-ip-city'] ||
    req.headers['x-appengine-city'] ||
    null;
  return { countryCode: cc, region, city };
}

// Resolve geo with graceful IP fallback (uses geoip-lite if available)
async function resolveGeo(req) {
  const fromHeaders = inferGeo(req);
  console.log('🌍 resolveGeo: Headers provided:', fromHeaders);
  
  // CRITICAL FIX: Only use headers for country, still try to get city/region from IP
  // Previously, this would return early if country was in headers, skipping city lookup
  if (fromHeaders.city && fromHeaders.region) {
    console.log('🌍 resolveGeo: Headers have complete city/region data, using headers');
    return fromHeaders;
  }
  
  try {
    const ip = getClientIp(req);
    console.log('🌍 resolveGeo: Client IP:', ip);
    if (!ip) {
      console.log('🌍 resolveGeo: No IP found, returning headers only');
      return { countryCode: fromHeaders.countryCode || null, region: null, city: null };
    }
    
    // Optional external provider
    if (process.env.GEO_PROVIDER && process.env.GEO_API_KEY) {
      try {
        const provider = String(process.env.GEO_PROVIDER).toLowerCase();
        console.log(`🌍 resolveGeo: Calling external provider: ${provider} for IP: ${ip}`);
        
        if (provider === 'ipinfo') {
          // ipinfo.io JSON: { country, region, city }
          const url = `https://ipinfo.io/${encodeURIComponent(ip)}?token=${process.env.GEO_API_KEY}`;
          const resp = await axios.get(url, { timeout: 2000 });
          const data = resp?.data || {};
          console.log(`🌍 resolveGeo: ipinfo response for ${ip}:`, { country: data.country, region: data.region, city: data.city });
          return {
            countryCode: data.country || fromHeaders.countryCode || null,
            region: data.region || null,
            city: data.city || null,
          };
        } else if (provider === 'ipdata') {
          const url = `https://api.ipdata.co/${encodeURIComponent(ip)}?api-key=${process.env.GEO_API_KEY}`;
          const resp = await axios.get(url, { timeout: 2000 });
          const data = resp?.data || {};
          console.log(`🌍 resolveGeo: ipdata response for ${ip}:`, { country: data.country_code, region: data.region, city: data.city });
          return {
            countryCode: data.country_code || fromHeaders.countryCode || null,
            region: data.region || data.region_code || null,
            city: data.city || null,
          };
        }
      } catch (_extErr) {
        console.warn('🌍 resolveGeo: External provider failed:', _extErr.message);
        // fall through to local db
      }
    } else {
      console.log('🌍 resolveGeo: No external provider configured');
    }
    // Local fallback: geoip-lite (if installed)
    console.log('🌍 resolveGeo: Trying geoip-lite fallback');
    let geoip;
    try { geoip = require('geoip-lite'); } catch (_e) { geoip = null; }
    if (!geoip || !geoip.lookup) {
      console.log('🌍 resolveGeo: geoip-lite not available, using country from headers only');
      return { countryCode: fromHeaders.countryCode || null, region: null, city: null };
    }
    const r = geoip.lookup(ip);
    if (!r) {
      console.log('🌍 resolveGeo: geoip-lite returned no results');
      return { countryCode: fromHeaders.countryCode || null, region: null, city: null };
    }
    console.log(`🌍 resolveGeo: geoip-lite result:`, { country: r.country, region: r.region, city: r.city });
    return { 
      countryCode: r.country || fromHeaders.countryCode || null, 
      region: r.region || null, 
      city: r.city || null 
    };
  } catch (_e) {
    console.warn('🌍 resolveGeo: Exception:', _e.message);
    return { countryCode: fromHeaders.countryCode || null, region: null, city: null };
  }
}

// --- QR Redirector ---
// Logs scan with privacy-friendly metadata, then redirects to destination
app.get('/r/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const qrId = parseInt(id, 10);
    if (!qrId || Number.isNaN(qrId)) {
      return res.status(400).send('Invalid QR id');
    }

    // Load QR
    const qrRes = await pool.query('SELECT id, url, is_active FROM qr_codes WHERE id = $1', [qrId]);
    if (qrRes.rowCount === 0 || qrRes.rows[0].is_active === false) {
      return res.status(404).send('QR not found');
    }
    const destinationUrl = qrRes.rows[0].url;

    // Scan tracking is handled by the main /r/:code and /qr/:code endpoints
    // This /r/:id endpoint is for legacy numeric ID redirects only

    // Build redirect URL (preserve original query including UTMs)
    const originalQs = req.url.split('?')[1];
    const redirectUrl = originalQs ? `${destinationUrl}${destinationUrl.includes('?') ? '&' : '?'}${originalQs}` : destinationUrl;
    return res.redirect(302, redirectUrl);
  } catch (error) {
    console.error('QR redirect error:', error);
    return res.status(500).send('Internal Server Error');
  }
});

// Track a QR scan (public; no auth required)
app.post('/api/analytics/track-scan', async (req, res) => {
  try {
    const {
      qrCodeId,
      location,
      device,
      countryName,
      countryCode,
      deviceType,
      browserName,
      operatingSystem,
      userLocation, // NEW: User-provided location { city, state, zip }
      userAge, // NEW: User-provided age range (e.g., "18-24", "25-34")
      userGender, // NEW: User-provided gender (Male, Female, Non-binary, etc.)
      visitorId, // NEW: Fallback visitor ID from localStorage when cookies don't work
      // ipAddress ignored for privacy
    } = req.body || {};

    if (!qrCodeId) {
      return res.status(400).json({ error: 'qrCodeId required' });
    }

    // Basic existence check to avoid orphans
    const exists = await pool.query('SELECT id FROM qr_codes WHERE id = $1 AND is_active = true', [qrCodeId]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // Do not store IP; derive approximate geo
    const geo = await resolveGeo(req);
    const ua = req.headers['user-agent'] || '';
    const parsed = parseUserAgent(ua);

    // Pass userLocation, userAge, userGender, and visitorId to writeScan if provided
    console.log('📊 ANALYTICS: track-scan called for QR:', qrCodeId, {
      hasUserLocation: !!userLocation,
      hasUserAge: !!userAge,
      hasUserGender: !!userGender,
      hasVisitorId: !!visitorId,
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });
    const result = await writeScan(pool, qrCodeId, req, res, userLocation, userAge, userGender, visitorId);

    console.log('📊 ANALYTICS: track-scan result:', {
      inserted: result.inserted,
      deduped: result.deduped,
      fallback: result.fallback,
      locationSource: result.locationSource,
      visitorId: result.visitorId?.substring(0, 8) + '...'
    });

    res.json({ 
      success: true, 
      locationSource: result.locationSource,
      deduped: result.deduped || false,
      visitorId: result.visitorId // Return visitor ID so frontend can store it
    });
  } catch (error) {
    console.error('📊 ANALYTICS: track-scan failed:', error);
    res.status(500).json({ error: 'Failed to track scan' });
  }
});

// Analytics summary endpoint (scans derived from qr_scans)
app.get('/api/analytics/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('📊 ANALYTICS: Computing summary for user:', userId);

    // Optional filters
    const days = Math.max(1, Math.min(parseInt(req.query.days) || 7, 365));
    const qrFilterId = req.query.qrCodeId ? parseInt(String(req.query.qrCodeId), 10) : null;
    const hasQrFilter = typeof qrFilterId === 'number' && !Number.isNaN(qrFilterId) && qrFilterId > 0;

    // Date boundaries (now and rangeStart)
    const now = new Date();
    const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    // Pre-existing buckets
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    console.log('📊 ANALYTICS: Date boundaries:', {
      now: now.toISOString(),
      last24Hours: last24Hours.toISOString(),
      weekStart: weekStart.toISOString(),
      monthStart: monthStart.toISOString()
    });

    // Configurable dedupe window (seconds), default 60
    const DEDUP_WINDOW_SECONDS = parseInt(process.env.SCAN_DEDUP_WINDOW_SECONDS || '60', 10);

    // Helper CTE to dedupe scans per QR code within a minute window
    // CRITICAL FIX: Use visitor_id when available (matches writeScan logic), fallback to IP/browser/OS combo
    // This ensures deduplication matches between insert-time and analytics-time
    const dedupCTE = `WITH dedup AS (
      SELECT DISTINCT ON (
        s.qr_code_id,
        COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
        date_trunc('minute', s.scanned_at)
      ) s.id, s.qr_code_id, s.scanned_at
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
        AND s.scanned_at >= $2
        ${hasQrFilter ? 'AND s.qr_code_id = $3' : ''}
        -- Filter out scans made before geolocation was configured (no meaningful location data)
        AND (
          s.city IS NOT NULL 
          OR s.user_provided_city IS NOT NULL 
          OR s.location_source != 'unknown'
          OR (s.country_code IS NOT NULL AND s.location_source IS NOT NULL)
        )
      ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
    )`;

    // Total scans for this user's QR codes (deduped) - ALL TIME, no date filter
    // This matches what's shown on individual QR codes
    let totalRes;
    try {
      // Use a separate CTE without date filter for total scans (all time)
      const totalScansCTE = `WITH dedup_all AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id, s.qr_code_id, s.scanned_at
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        ${hasQrFilter ? 'AND s.qr_code_id = $2' : ''}
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )`;
      totalRes = await pool.query(
        `${totalScansCTE}
         SELECT COUNT(*) AS c FROM dedup_all`,
        hasQrFilter ? [userId, qrFilterId] : [userId]
      );
    } catch (e) { console.warn('📊 SUMMARY totalRes failed:', e.message); totalRes = { rows: [{ c: 0 }] }; }

    let last24HoursRes;
    try { 
      // Debug: Check actual scan timestamps
      const debugScans = await pool.query(
        `SELECT s.scanned_at, 
                s.scanned_at >= $2 as is_in_last_24h,
                EXTRACT(EPOCH FROM (NOW() - s.scanned_at))/3600 as hours_ago
         FROM qr_scans s
         JOIN qr_codes q ON s.qr_code_id = q.id
         WHERE q.user_id = $1
         ORDER BY s.scanned_at DESC LIMIT 5`,
        [userId, last24Hours]
      );
      console.log('📊 ANALYTICS: Recent scans debug:', {
        last24Hours: last24Hours.toISOString(),
        currentTime: now.toISOString(),
        recentScans: debugScans.rows.map(r => ({
          scanned_at: r.scanned_at,
          hours_ago: Math.round(r.hours_ago * 10) / 10,
          is_in_last_24h: r.is_in_last_24h
        }))
      });
      
      last24HoursRes = await pool.query(
        `${dedupCTE}
         SELECT COUNT(*) AS c FROM dedup d WHERE d.scanned_at >= $2`,
        hasQrFilter ? [userId, last24Hours, qrFilterId] : [userId, last24Hours]
      );
      console.log('📊 ANALYTICS: Last 24h count result:', last24HoursRes.rows[0]);
    } catch (e) { console.warn('📊 SUMMARY last24HoursRes failed:', e.message); last24HoursRes = { rows: [{ c: 0 }] }; }

    let weekRes;
    try { weekRes = await pool.query(
      `${dedupCTE}
       SELECT COUNT(*) AS c FROM dedup d WHERE d.scanned_at >= $2`,
      hasQrFilter ? [userId, weekStart, qrFilterId] : [userId, weekStart]
    ); } catch (e) { console.warn('📊 SUMMARY weekRes failed:', e.message); weekRes = { rows: [{ c: 0 }] }; }

    let monthRes;
    try { monthRes = await pool.query(
      `${dedupCTE}
       SELECT COUNT(*) AS c FROM dedup d WHERE d.scanned_at >= $2`,
      hasQrFilter ? [userId, monthStart, qrFilterId] : [userId, monthStart]
    ); } catch (e) { console.warn('📊 SUMMARY monthRes failed:', e.message); monthRes = { rows: [{ c: 0 }] }; }

    // Count unique visitors using visitor_id when available (matches writeScan logic)
    let uniqueVisitorsRes;
    try {
      uniqueVisitorsRes = await pool.query(
        `SELECT COUNT(*) AS c FROM (
           SELECT DISTINCT
             COALESCE(qr_visitor_id, visitor_id::text, ip_address::text, CONCAT(COALESCE(browser_name,'?'), '|', COALESCE(operating_system,'?'))) AS vkey
           FROM qr_scans s
           JOIN qr_codes q ON s.qr_code_id = q.id
           WHERE q.user_id = $1
         ) t`,
        [userId]
      );
    } catch (e) {
      console.warn('📊 SUMMARY uniqueVisitorsRes failed:', e.message);
      uniqueVisitorsRes = { rows: [{ c: 0 }] };
    }

    // Hourly distribution (last 24h)
    let hourlyRes;
    try { hourlyRes = await pool.query(
      `${dedupCTE}
       SELECT EXTRACT(HOUR FROM d.scanned_at) AS hr, COUNT(*) AS c
       FROM dedup d
       WHERE d.scanned_at >= NOW() - INTERVAL '24 HOURS'
       GROUP BY hr
       ORDER BY hr`,
      hasQrFilter ? [userId, rangeStart, qrFilterId] : [userId, rangeStart]
    ); } catch (e) { console.warn('📊 SUMMARY hourlyRes failed:', e.message); hourlyRes = { rows: [] }; }
    const hourlyMap = new Map(hourlyRes.rows.map(r => [parseInt(r.hr), parseInt(r.c)]));
    const hourlyData = Array.from({ length: 24 }, (_, i) => hourlyMap.get(i) || 0);

    // Daily scan history (last N days)
    let dailyScanHistoryRes;
    try {
      dailyScanHistoryRes = await pool.query(
        `${dedupCTE}
         SELECT 
           DATE(d.scanned_at) as scan_date,
           COUNT(*) as scan_count
         FROM dedup d
         WHERE d.scanned_at >= $2
         GROUP BY DATE(d.scanned_at)
         ORDER BY scan_date ASC`,
        hasQrFilter ? [userId, rangeStart, qrFilterId] : [userId, rangeStart]
      );
    } catch (e) {
      console.warn('📊 SUMMARY dailyScanHistoryRes failed:', e.message);
      dailyScanHistoryRes = { rows: [] };
    }

    // Fill in missing days with 0 counts for continuous data
    const dailyScanMap = new Map(
      dailyScanHistoryRes.rows.map(r => {
        // Handle PostgreSQL DATE type - convert to ISO string
        const dateStr = r.scan_date instanceof Date 
          ? r.scan_date.toISOString().split('T')[0]
          : typeof r.scan_date === 'string'
          ? r.scan_date.split('T')[0]
          : new Date(r.scan_date).toISOString().split('T')[0];
        return [dateStr, parseInt(r.scan_count)];
      })
    );
    
    const dailyScanHistory = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyScanHistory.push({
        date: dateStr,
        count: dailyScanMap.get(dateStr) || 0
      });
    }

    // Top countries (deduped: one event per visitor per minute)
    // Only include scans with meaningful location data (filter out pre-geolocation scans)
    let countriesRes;
    try {
      const countriesSql = `
        ${dedupCTE}
        SELECT COALESCE(s.country_name, s.country_code, 'Unknown') AS country,
               COUNT(*) AS count
          FROM dedup d
          JOIN qr_scans s ON s.id = d.id
          WHERE (
            s.city IS NOT NULL 
            OR s.user_provided_city IS NOT NULL 
            OR s.location_source != 'unknown'
            OR (s.country_code IS NOT NULL AND s.location_source IS NOT NULL)
          )
         GROUP BY country
         ORDER BY count DESC
         LIMIT 10`;
      countriesRes = await pool.query(
        countriesSql,
        hasQrFilter ? [userId, rangeStart, qrFilterId] : [userId, rangeStart]
      );
    } catch (e) { console.warn('📊 SUMMARY countriesRes failed:', e.message); countriesRes = { rows: [] }; }

    // Top cities (deduped to one event per visitor per minute; prioritize user-provided location)
    // Only include scans with meaningful location data (filter out pre-geolocation scans)
    let citiesRes;
    try {
      const citiesSql = `
        ${dedupCTE}
        SELECT 
          COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown') AS city,
          COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), '') AS region,
          COALESCE(s.country_name, s.country_code, '') AS country_code,
          SUM(CASE WHEN s.location_source = 'user' THEN 1 ELSE 0 END) AS user_provided_count,
          COUNT(*) AS count
        FROM dedup d
        JOIN qr_scans s ON s.id = d.id
        WHERE (
          s.city IS NOT NULL 
          OR s.user_provided_city IS NOT NULL 
          OR s.location_source != 'unknown'
          OR (s.country_code IS NOT NULL AND s.location_source IS NOT NULL)
        )
        GROUP BY 
          COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown'),
          COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), ''),
          COALESCE(s.country_name, s.country_code, '')
        ORDER BY count DESC
        LIMIT 10`;
      citiesRes = await pool.query(
        citiesSql,
        hasQrFilter ? [userId, rangeStart, qrFilterId] : [userId, rangeStart]
      );
    } catch (e) {
      console.warn('📊 SUMMARY citiesRes failed:', e.message);
      citiesRes = { rows: [] };
    }

    // Top devices
    let devicesRes;
    try { devicesRes = await pool.query(
      `SELECT COALESCE(s.device_type, s.device, 'Unknown') AS device, COUNT(*) AS count
         FROM qr_scans s
         JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        GROUP BY device
        ORDER BY count DESC
        LIMIT 10`,
      [userId]
    ); } catch (e) { console.warn('📊 SUMMARY devicesRes failed:', e.message); devicesRes = { rows: [] }; }

    // Age demographics (deduped: one event per visitor per minute)
    let ageRangesRes;
    try {
      const ageRangesSql = `
        ${dedupCTE}
        SELECT 
          COALESCE(s.user_provided_age_range, 'Unknown') AS age_range,
          COUNT(*) AS count
        FROM dedup d
        JOIN qr_scans s ON s.id = d.id
        WHERE s.user_provided_age_range IS NOT NULL
        GROUP BY s.user_provided_age_range
        ORDER BY 
          CASE s.user_provided_age_range
            WHEN 'Under 18' THEN 1
            WHEN '18-24' THEN 2
            WHEN '25-34' THEN 3
            WHEN '35-44' THEN 4
            WHEN '45-54' THEN 5
            WHEN '55-64' THEN 6
            WHEN '65+' THEN 7
            ELSE 8
          END`;
      ageRangesRes = await pool.query(
        ageRangesSql,
        hasQrFilter ? [userId, rangeStart, qrFilterId] : [userId, rangeStart]
      );
      console.log('📊 ANALYTICS: Age ranges results:', ageRangesRes.rows);
    } catch (e) { 
      console.warn('📊 SUMMARY ageRangesRes failed:', e.message); 
      console.error('📊 SUMMARY ageRangesRes error details:', e);
      ageRangesRes = { rows: [] }; 
    }

    // Gender demographics (deduped: one event per visitor per minute)
    let genderDistRes;
    try {
      const genderDistSql = `
        ${dedupCTE}
        SELECT 
          COALESCE(s.user_provided_gender, 'Unknown') AS gender,
          COUNT(*) AS count
        FROM dedup d
        JOIN qr_scans s ON s.id = d.id
        WHERE s.user_provided_gender IS NOT NULL
        GROUP BY s.user_provided_gender
        ORDER BY 
          CASE s.user_provided_gender
            WHEN 'Male' THEN 1
            WHEN 'Female' THEN 2
            WHEN 'Non-binary' THEN 3
            WHEN 'Prefer not to say' THEN 4
            WHEN 'Open-ended' THEN 5
            ELSE 6
          END`;
      genderDistRes = await pool.query(
        genderDistSql,
        hasQrFilter ? [userId, rangeStart, qrFilterId] : [userId, rangeStart]
      );
      console.log('📊 ANALYTICS: Gender distribution results:', genderDistRes.rows);
    } catch (e) { 
      console.warn('📊 SUMMARY genderDistRes failed:', e.message); 
      console.error('📊 SUMMARY genderDistRes error details:', e);
      genderDistRes = { rows: [] }; 
    }

    // Recent scans
    let recentRes;
    try { recentRes = await pool.query(
      `WITH dedup AS (
         SELECT DISTINCT ON (
           s.qr_code_id,
           date_trunc('minute', s.scanned_at)
         ) s.id, s.qr_code_id, s.scanned_at, s.country_name, s.country_code, s.device_type, s.device
         FROM qr_scans s
         JOIN qr_codes q ON s.qr_code_id = q.id
         WHERE q.user_id = $1
         ORDER BY s.qr_code_id, date_trunc('minute', s.scanned_at), s.scanned_at ASC
       )
       SELECT q.id AS qr_code_id,
              q.name AS qr_name,
              COALESCE(d.country_name, d.country_code, '') AS location,
              COALESCE(d.device_type, d.device, '') AS device,
              d.scanned_at AS timestamp
       FROM dedup d
       JOIN qr_codes q ON d.qr_code_id = q.id
       ORDER BY d.timestamp DESC
       LIMIT 10`,
      [userId]
    ); } catch (e) {
      console.warn('📊 SUMMARY recentRes dedup failed, falling back to raw scans:', e.message);
      try {
        recentRes = await pool.query(
          `SELECT q.id AS qr_code_id,
                  q.name AS qr_name,
                  COALESCE(s.country_name, s.country_code, '') AS location,
                  COALESCE(s.device_type, s.device, '') AS device,
                  s.scanned_at AS timestamp
             FROM qr_scans s
             JOIN qr_codes q ON s.qr_code_id = q.id
            WHERE q.user_id = $1
            ORDER BY s.scanned_at DESC
            LIMIT 10`,
          [userId]
        );
      } catch (e2) {
        console.warn('📊 SUMMARY recentRes raw fallback failed:', e2.message);
        recentRes = { rows: [] };
      }
    }

    // Most popular QR code (highest scan count) - use ALL scans, not just time-filtered
    // This matches what's shown on the QR code management page
    let mostPopularQRRes;
    try {
      // Use a separate CTE without time filter for most popular QR code
      const mostPopularCTE = `WITH dedup_all AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id, s.qr_code_id, s.scanned_at
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        ${hasQrFilter ? 'AND s.qr_code_id = $2' : ''}
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )`;
      
      mostPopularQRRes = await pool.query(
        `${mostPopularCTE}
         SELECT 
           q.id as qr_code_id,
           q.name as qr_name,
           COUNT(*) as scan_count
         FROM dedup_all d
         JOIN qr_codes q ON d.qr_code_id = q.id
         GROUP BY q.id, q.name
         ORDER BY scan_count DESC
         LIMIT 1`,
        hasQrFilter ? [userId, qrFilterId] : [userId]
      );
    } catch (e) {
      console.warn('📊 SUMMARY mostPopularQRRes failed:', e.message);
      mostPopularQRRes = { rows: [] };
    }

    const mostPopularQRCode = mostPopularQRRes.rows.length > 0
      ? {
          qrCodeId: mostPopularQRRes.rows[0].qr_code_id,
          qrName: mostPopularQRRes.rows[0].qr_name,
          scanCount: parseInt(mostPopularQRRes.rows[0].scan_count || 0)
        }
      : null;

    console.log('📊 ANALYTICS: Final counts:', {
      total: totalRes.rows[0]?.c,
      last24h: last24HoursRes.rows[0]?.c,
      week: weekRes.rows[0]?.c
    });
    
    const playsTotals = { media: 0, playlist: 0, slideshow: 0, uniqueUsers: 0 };
    try {
      const mediaTotal = await pool.query(`SELECT COUNT(*) AS c FROM media_plays mp JOIN media m ON mp.media_id = m.id WHERE m.user_id = $1`, [userId]);
      const playlistTotal = await pool.query(`SELECT COUNT(*) AS c FROM playlist_plays pp JOIN playlists p ON pp.playlist_id = p.id WHERE p.user_id = $1`, [userId]);
      const slideshowTotal = await pool.query(`SELECT COUNT(*) AS c FROM slideshow_plays sp JOIN slideshows s ON sp.slideshow_id = s.id WHERE s.user_id = $1`, [userId]);
      const uniqueUsers = await pool.query(`SELECT COUNT(DISTINCT COALESCE(mp.user_id::text, mp.session_id)) AS c FROM media_plays mp JOIN media m ON mp.media_id = m.id WHERE m.user_id = $1`, [userId]);
      playsTotals.media = parseInt(mediaTotal.rows[0]?.c || 0);
      playsTotals.playlist = parseInt(playlistTotal.rows[0]?.c || 0);
      playsTotals.slideshow = parseInt(slideshowTotal.rows[0]?.c || 0);
      playsTotals.uniqueUsers = parseInt(uniqueUsers.rows[0]?.c || 0);
    } catch (e) { console.warn('📊 SUMMARY plays totals failed:', e.message); }

    // Post-process recent scans to collapse rapid duplicates per QR within 60s
    let recentRows = recentRes.rows || [];
    try {
      recentRows = recentRows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const dedupedRecent = [];
      const lastKeptByQr = new Map();
      for (const row of recentRows) {
        const qid = row.qr_id || row.qr_code_id || null;
        const ts = new Date(row.timestamp).getTime();
        const lastTs = lastKeptByQr.get(qid);
        if (!qid || lastTs === undefined || ts < lastTs - 60000) {
          dedupedRecent.push(row);
          if (qid) lastKeptByQr.set(qid, ts);
        }
      }
      recentRows = dedupedRecent;
    } catch (_e) {
      // If anything goes wrong, keep original rows
    }

    const summary = {
      totalScans: parseInt(totalRes.rows[0]?.c || 0),
      todayScans: parseInt(last24HoursRes.rows[0]?.c || 0), // Changed to last 24 hours
      weekScans: parseInt(weekRes.rows[0]?.c || 0),
      monthScans: parseInt(monthRes.rows[0]?.c || 0),
      uniqueVisitors: parseInt(uniqueVisitorsRes.rows[0]?.c || 0),
      avgScansPerDay: Math.round((parseInt(weekRes.rows[0]?.c || 0)) / 7),
      conversionRate: 0,
      scanGrowth: 0,
      visitorGrowth: 0,
      dailyGrowth: 0,
      conversionGrowth: 0,
      topCountries: countriesRes.rows.map(r => ({ country: r.country, count: parseInt(r.count) })),
      topCities: citiesRes.rows.map(r => ({ 
        city: r.city, 
        region: r.region, 
        country: r.country_code, 
        count: parseInt(r.count),
        userProvidedCount: parseInt(r.user_provided_count || 0)
      })),
      topDevices: devicesRes.rows.map(r => ({ device: r.device, count: parseInt(r.count) })),
      ageRanges: ageRangesRes.rows.map(r => ({ ageRange: r.age_range, count: parseInt(r.count) })),
      genderDistribution: genderDistRes.rows.map(r => ({ gender: r.gender, count: parseInt(r.count) })),
      hourlyData,
      dailyScanHistory,
      mostPopularQRCode,
      recentScans: recentRows.map(r => ({
        qrName: r.qr_name,
        location: r.location,
        device: r.device,
        timestamp: r.timestamp,
      })),
      playsTotals,
    };

    res.json(summary);
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching summary:', error);
    // Fail-soft: return an empty but valid summary shape so the UI doesn't block
    res.json({
      totalScans: 0,
      todayScans: 0,
      weekScans: 0,
      monthScans: 0,
      uniqueVisitors: 0,
      avgScansPerDay: 0,
      conversionRate: 0,
      scanGrowth: 0,
      visitorGrowth: 0,
      dailyGrowth: 0,
      conversionGrowth: 0,
      topCountries: [],
      topDevices: [],
      hourlyData: Array(24).fill(0),
      dailyScanHistory: [],
      mostPopularQRCode: null,
      recentScans: [],
    });
  }
});

// Admin-only: Backfill geo for historical scans using stored IPs
app.post('/api/analytics/backfill-geo', authenticateToken, isAdmin, async (req, res) => {
  try {
    let geoip;
    try { geoip = require('geoip-lite'); } catch (_) { geoip = null; }
    if (!geoip || !geoip.lookup) {
      return res.status(500).json({ error: 'geoip-lite not installed on server' });
    }

    const limit = Math.min(parseInt(req.body?.limit || '500', 10) || 500, 2000);
    const maxBatches = Math.min(parseInt(req.body?.batches || '20', 10) || 20, 100);
    let totalUpdated = 0;
    for (let i = 0; i < maxBatches; i++) {
      const sel = await pool.query(
        `SELECT id, ip_address FROM qr_scans
         WHERE ip_address IS NOT NULL
           AND (country_code IS NULL OR country_code = '')
           AND (city IS NULL OR city = '')
         ORDER BY id ASC
         LIMIT $1`,
        [limit]
      );
      if (sel.rowCount === 0) {
        return res.json({ updated: totalUpdated, done: true });
      }
      for (const row of sel.rows) {
        const r = geoip.lookup(row.ip_address);
        if (!r) continue;
        await pool.query(
          `UPDATE qr_scans
           SET country_code = COALESCE($2, country_code),
               region = COALESCE($3, region),
               city = COALESCE($4, city)
           WHERE id = $1`,
          [row.id, r.country || null, r.region || null, r.city || null]
        );
        totalUpdated++;
      }
    }
    res.json({ updated: totalUpdated, done: false });
  } catch (error) {
    console.error('📊 ANALYTICS: backfill-geo failed:', error);
    res.status(500).json({ error: 'Backfill failed' });
  }
});

// User analytics (used by frontend to get total QR codes)
app.get('/api/analytics/user/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📊 USER ANALYTICS: Request for user', id, 'from authenticated user', req.user.userId);
    console.log('📊 USER ANALYTICS: Comparison:', String(req.user.userId), '!==', String(id), '=', String(req.user.userId) !== String(id));
    
    if (String(req.user.userId) !== String(id)) {
      console.log('📊 USER ANALYTICS: Access denied - user mismatch');
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    console.log('📊 USER ANALYTICS: Fetching QR codes count for user', id);
    let totalQRCodes = 0;
    let totalPlaylists = 0;
    let totalSlideshows = 0;
    let totalProducts = 0;
    
    try {
      const [qrRes, playlistsRes, slideshowsRes, productsRes] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM qr_codes WHERE user_id = $1 AND is_active = true', [id]),
        pool.query('SELECT COUNT(*) FROM playlists WHERE user_id = $1', [id]),
        pool.query('SELECT COUNT(*) FROM slideshows WHERE user_id = $1', [id]),
        pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1', [id]),
      ]);
      
      totalQRCodes = parseInt(qrRes.rows[0]?.count || 0);
      totalPlaylists = parseInt(playlistsRes.rows[0]?.count || 0);
      totalSlideshows = parseInt(slideshowsRes.rows[0]?.count || 0);
      totalProducts = parseInt(productsRes.rows[0]?.count || 0);
      
      console.log('📊 USER ANALYTICS: Counts:', { totalQRCodes, totalPlaylists, totalSlideshows, totalProducts });
    } catch (e) {
      console.warn('📊 USER ANALYTICS: count failed:', e.message);
    }
    
    res.json({ totalQRCodes, totalPlaylists, totalSlideshows, totalProducts });
  } catch (error) {
    console.error('📊 USER ANALYTICS: error', error);
    res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
});

// Detailed scans for a specific QR code (authenticated user must own the QR)
app.get('/api/analytics/scans/:qrCodeId', authenticateToken, async (req, res) => {
  try {
    const { qrCodeId } = req.params;
    const owner = await pool.query('SELECT user_id FROM qr_codes WHERE id = $1', [qrCodeId]);
    if (owner.rowCount === 0 || owner.rows[0].user_id !== req.user.userId) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    const scans = await pool.query(
      `SELECT id, qr_code_id, scanned_at, location, device, country_name, country_code, device_type, browser_name, operating_system
         FROM qr_scans WHERE qr_code_id = $1 ORDER BY scanned_at DESC LIMIT 500`,
      [qrCodeId]
    );
    res.json(scans.rows);
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching scans:', error);
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
});

// ---------- PLAY TRACKING ANALYTICS ENDPOINTS ----------

// Track media play (all durations - no restriction)
app.post('/api/analytics/track-media-play', async (req, res) => {
  try {
    const { mediaId, playDuration, sessionId, userId, userAge, userGender, userLocation, locationSource } = req.body;

    if (!mediaId || playDuration === undefined || playDuration === null || !sessionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (playDuration < 0) {
      return res.status(400).json({ error: 'Play duration must be non-negative' });
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Determine location source if not provided
    let finalLocationSource = locationSource || 'unknown';
    if (userLocation && userLocation.city && userLocation.state) {
      finalLocationSource = 'user';
    } else if (!locationSource) {
      // Try to get geo from IP if no user location provided
      const geo = await resolveGeo(req);
      if (geo.city || geo.countryCode) {
        finalLocationSource = 'auto';
      }
    }

    console.log(`📊 ANALYTICS: Tracking media play - Media: ${mediaId}, Duration: ${playDuration}s, Session: ${sessionId}, Age: ${userAge || 'none'}, Gender: ${userGender || 'none'}, Location: ${userLocation ? `${userLocation.city}, ${userLocation.state}` : 'none'}`);

    // Check if this is a unique play (first play >30 seconds for this user/media combination)
    // Unique plays require: play_duration > 30 AND no existing play >30s for this (media_id, user_id/session_id)
    let isUnique = false;
    if (playDuration > 30) {
      const userKey = userId ? userId.toString() : sessionId;
      const existingUniquePlay = await pool.query(
        `SELECT id FROM media_plays 
         WHERE media_id = $1 
         AND play_duration > 30 
         AND (user_id::text = $2 OR (user_id IS NULL AND session_id = $3))`,
        [mediaId, userKey, sessionId]
      );
      isUnique = existingUniquePlay.rows.length === 0;
    }

    // Insert play record with demographics (all plays are tracked)
    await pool.query(
      `INSERT INTO media_plays (media_id, user_id, session_id, play_duration, ip_address, user_provided_age_range, user_provided_gender, user_provided_city, user_provided_state, user_provided_zip, location_source) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        mediaId, 
        userId || null, 
        sessionId, 
        playDuration, 
        ipAddress,
        userAge || null,
        userGender || null,
        userLocation?.city || null,
        userLocation?.state || null,
        userLocation?.zip || null,
        finalLocationSource
      ]
    );

    // Update aggregate counters
    // Always increment total_plays for all plays
    await pool.query(
      'UPDATE media SET total_plays = total_plays + 1 WHERE id = $1',
      [mediaId]
    );
    
    // Only increment unique_plays if this is a unique play (>30s and first time for this user/media)
    if (isUnique) {
      await pool.query(
        'UPDATE media SET unique_plays = unique_plays + 1 WHERE id = $1',
        [mediaId]
      );
    }

    console.log(`📊 ANALYTICS: Media play tracked - Duration: ${playDuration}s, Unique: ${isUnique}`);
    res.json({ success: true, isUnique });
  } catch (error) {
    console.error('📊 ANALYTICS: Error tracking media play:', error);
    res.status(500).json({ error: 'Failed to track media play' });
  }
});

// Track playlist play (>= 30 seconds)
app.post('/api/analytics/track-playlist-play', async (req, res) => {
  try {
    const { playlistId, playDuration, sessionId, userId, userAge, userGender, userLocation, locationSource } = req.body;

    if (!playlistId || !playDuration || !sessionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (playDuration < 30) {
      return res.status(400).json({ error: 'Play duration must be at least 30 seconds' });
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Determine location source if not provided
    let finalLocationSource = locationSource || 'unknown';
    if (userLocation && userLocation.city && userLocation.state) {
      finalLocationSource = 'user';
    } else if (!locationSource) {
      // Try to get geo from IP if no user location provided
      const geo = await resolveGeo(req);
      if (geo.city || geo.countryCode) {
        finalLocationSource = 'auto';
      }
    }

    console.log(`📊 ANALYTICS: Tracking playlist play - Playlist: ${playlistId}, Duration: ${playDuration}s, Age: ${userAge || 'none'}, Gender: ${userGender || 'none'}, Location: ${userLocation ? `${userLocation.city}, ${userLocation.state}` : 'none'}`);

    // Check if this is a unique play
    const existingPlay = await pool.query(
      'SELECT id FROM playlist_plays WHERE playlist_id = $1 AND session_id = $2',
      [playlistId, sessionId]
    );
    const isUnique = existingPlay.rows.length === 0;

    // Insert play record with demographics
    await pool.query(
      `INSERT INTO playlist_plays (playlist_id, user_id, session_id, play_duration, ip_address, user_provided_age_range, user_provided_gender, user_provided_city, user_provided_state, user_provided_zip, location_source) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        playlistId, 
        userId || null, 
        sessionId, 
        playDuration, 
        ipAddress,
        userAge || null,
        userGender || null,
        userLocation?.city || null,
        userLocation?.state || null,
        userLocation?.zip || null,
        finalLocationSource
      ]
    );

    // Update aggregate counters
    if (isUnique) {
      await pool.query(
        'UPDATE playlists SET total_plays = total_plays + 1, unique_plays = unique_plays + 1 WHERE id = $1',
        [playlistId]
      );
    } else {
      await pool.query(
        'UPDATE playlists SET total_plays = total_plays + 1 WHERE id = $1',
        [playlistId]
      );
    }

    console.log(`📊 ANALYTICS: Playlist play tracked - Unique: ${isUnique}`);
    res.json({ success: true, isUnique });
  } catch (error) {
    console.error('📊 ANALYTICS: Error tracking playlist play:', error);
    res.status(500).json({ error: 'Failed to track playlist play' });
  }
});

// Track slideshow play (>= 30 seconds)
app.post('/api/analytics/track-slideshow-play', async (req, res) => {
  try {
    const { slideshowId, playDuration, sessionId, userId, userAge, userGender, userLocation, locationSource } = req.body;

    if (!slideshowId || !playDuration || !sessionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (playDuration < 30) {
      return res.status(400).json({ error: 'Play duration must be at least 30 seconds' });
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Determine location source if not provided
    let finalLocationSource = locationSource || 'unknown';
    if (userLocation && userLocation.city && userLocation.state) {
      finalLocationSource = 'user';
    } else if (!locationSource) {
      // Try to get geo from IP if no user location provided
      const geo = await resolveGeo(req);
      if (geo.city || geo.countryCode) {
        finalLocationSource = 'auto';
      }
    }

    console.log(`📊 ANALYTICS: Tracking slideshow play - Slideshow: ${slideshowId}, Duration: ${playDuration}s, Age: ${userAge || 'none'}, Gender: ${userGender || 'none'}, Location: ${userLocation ? `${userLocation.city}, ${userLocation.state}` : 'none'}`);

    // Check if this is a unique play
    const existingPlay = await pool.query(
      'SELECT id FROM slideshow_plays WHERE slideshow_id = $1 AND session_id = $2',
      [slideshowId, sessionId]
    );
    const isUnique = existingPlay.rows.length === 0;

    // Insert play record with demographics
    await pool.query(
      `INSERT INTO slideshow_plays (slideshow_id, user_id, session_id, play_duration, ip_address, user_provided_age_range, user_provided_gender, user_provided_city, user_provided_state, user_provided_zip, location_source) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        slideshowId, 
        userId || null, 
        sessionId, 
        playDuration, 
        ipAddress,
        userAge || null,
        userGender || null,
        userLocation?.city || null,
        userLocation?.state || null,
        userLocation?.zip || null,
        finalLocationSource
      ]
    );

    // Update aggregate counters
    if (isUnique) {
      await pool.query(
        'UPDATE slideshows SET total_plays = total_plays + 1, unique_plays = unique_plays + 1 WHERE id = $1',
        [slideshowId]
      );
    } else {
      await pool.query(
        'UPDATE slideshows SET total_plays = total_plays + 1 WHERE id = $1',
        [slideshowId]
      );
    }

    console.log(`📊 ANALYTICS: Slideshow play tracked - Unique: ${isUnique}`);
    res.json({ success: true, isUnique });
  } catch (error) {
    console.error('📊 ANALYTICS: Error tracking slideshow play:', error);
    res.status(500).json({ error: 'Failed to track slideshow play' });
  }
});

// ---------- CART & PURCHASE TRACKING ENDPOINTS ----------

// Track cart addition
app.post('/api/analytics/track-cart-add', async (req, res) => {
  try {
    const { productId, quantity, sessionId, userId } = req.body;

    if (!productId || !quantity || !sessionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`📊 ANALYTICS: Tracking cart add - Product: ${productId}, Qty: ${quantity}`);

    await pool.query(
      `INSERT INTO cart_events (product_id, user_id, session_id, quantity) 
       VALUES ($1, $2, $3, $4)`,
      [productId, userId || null, sessionId, quantity]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('📊 ANALYTICS: Error tracking cart add:', error);
    res.status(500).json({ error: 'Failed to track cart addition' });
  }
});

// Track purchase completion
app.post('/api/analytics/track-purchase', async (req, res) => {
  try {
    const { stripeSessionId, items, totalAmount, userId } = req.body;

    if (!stripeSessionId || !items || !totalAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`📊 ANALYTICS: Tracking purchase - Session: ${stripeSessionId}, Amount: ${totalAmount}`);

    // Check if this purchase was already tracked
    const existing = await pool.query(
      'SELECT id FROM purchase_events WHERE stripe_session_id = $1',
      [stripeSessionId]
    );

    if (existing.rows.length > 0) {
      console.log('📊 ANALYTICS: Purchase already tracked');
      return res.json({ success: true, alreadyTracked: true });
    }

    await pool.query(
      `INSERT INTO purchase_events (stripe_session_id, user_id, total_amount, items) 
       VALUES ($1, $2, $3, $4)`,
      [stripeSessionId, userId || null, totalAmount, JSON.stringify(items)]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('📊 ANALYTICS: Error tracking purchase:', error);
    res.status(500).json({ error: 'Failed to track purchase' });
  }
});

// ---------- ANALYTICS RETRIEVAL ENDPOINTS ----------

// Get play statistics
app.get('/api/analytics/play-stats', async (req, res) => {
  try {
    const { userId } = req.query;

    console.log(`📊 ANALYTICS: Fetching play stats${userId ? ` for user ${userId}` : ''}`);

    let mediaWhere = '';
    let playlistWhere = '';
    let slideshowWhere = '';
    const params = [];

    if (userId) {
      mediaWhere = 'WHERE m.user_id = $1';
      playlistWhere = 'WHERE p.user_id = $1';
      slideshowWhere = 'WHERE s.user_id = $1';
      params.push(userId);
    }

    // Get total media plays - count from media_plays table directly
    const totalPlaysQuery = userId 
      ? `SELECT COUNT(*) as total_plays
         FROM media_plays mp
         JOIN media m ON mp.media_id = m.id
         WHERE m.user_id = $1`
      : `SELECT COUNT(*) as total_plays
         FROM media_plays mp`;
    
    const mediaTotalStats = await pool.query(totalPlaysQuery, userId ? [userId] : []);

    // Get unique plays (only > 30 seconds) - distinct (media_id, session/user) combinations
    // This counts each unique listener per song as one unique play
    // Using concatenation to create a unique key for distinct counting
    // Unique plays require: play_duration > 30 AND one per user per media item
    const uniquePlaysQuery = userId
      ? `SELECT COUNT(DISTINCT mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id)) as unique_plays
         FROM media_plays mp
         JOIN media m ON mp.media_id = m.id
         WHERE mp.play_duration > 30 AND m.user_id = $1`
      : `SELECT COUNT(DISTINCT mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id)) as unique_plays
         FROM media_plays mp
         WHERE mp.play_duration > 30`;
    
    const uniquePlaysStats = await pool.query(uniquePlaysQuery, userId ? [userId] : []);

    // Get average duration
    const avgDurationQuery = userId
      ? `SELECT COALESCE(AVG(mp.play_duration), 0) as avg_duration
         FROM media_plays mp
         JOIN media m ON mp.media_id = m.id
         WHERE m.user_id = $1`
      : `SELECT COALESCE(AVG(mp.play_duration), 0) as avg_duration
         FROM media_plays mp`;
    
    const avgDurationStats = await pool.query(avgDurationQuery, userId ? [userId] : []);

    // Get playlist stats
    const playlistStats = await pool.query(
      `SELECT 
        COALESCE(SUM(p.total_plays), 0) as total_plays,
        COALESCE(SUM(p.unique_plays), 0) as unique_plays,
        COUNT(*) as times_created
       FROM playlists p
       ${playlistWhere}`,
      params
    );

    // Get slideshow stats
    const slideshowStats = await pool.query(
      `SELECT 
        COALESCE(SUM(s.total_plays), 0) as total_plays,
        COALESCE(SUM(s.unique_plays), 0) as unique_plays,
        COUNT(*) as times_created
       FROM slideshows s
       ${slideshowWhere}`,
      params
    );

    // Get most played media - use actual play counts from media_plays table
    // Only show media that actually has plays (total_plays > 0)
    // Total Plays: all plays, Unique Plays: distinct (media_id, user_id/session_id) where duration > 30
    const mostPlayed = await pool.query(
      `SELECT 
        m.id, 
        m.title, 
        COUNT(mp.id) as total_plays,
        COUNT(DISTINCT CASE 
          WHEN mp.play_duration > 30 
          THEN mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id) 
        END) as unique_plays
       FROM media m
       LEFT JOIN media_plays mp ON m.id = mp.media_id
       ${mediaWhere}
       GROUP BY m.id, m.title
       HAVING COUNT(mp.id) > 0
       ORDER BY total_plays DESC
       LIMIT 10`,
      params
    );

    const result = {
      media: {
        totalPlays: parseInt(mediaTotalStats.rows[0]?.total_plays || 0),
        uniquePlays: parseInt(uniquePlaysStats.rows[0]?.unique_plays || 0),
        averageDuration: Math.round(parseFloat(avgDurationStats.rows[0]?.avg_duration || 0)),
      },
      playlists: {
        totalPlays: parseInt(playlistStats.rows[0]?.total_plays || 0),
        uniquePlays: parseInt(playlistStats.rows[0]?.unique_plays || 0),
        timesCreated: parseInt(playlistStats.rows[0]?.times_created || 0),
      },
      slideshows: {
        totalPlays: parseInt(slideshowStats.rows[0]?.total_plays || 0),
        uniquePlays: parseInt(slideshowStats.rows[0]?.unique_plays || 0),
        timesCreated: parseInt(slideshowStats.rows[0]?.times_created || 0),
      },
      mostPlayedMedia: mostPlayed.rows,
    };

    console.log('📊 ANALYTICS: Play stats retrieved');
    res.json(result);
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching play stats:', error);
    res.status(500).json({ error: 'Failed to fetch play statistics' });
  }
});

// Get per-media-item stats for a user (for Behavior tab)
app.get('/api/analytics/media-items-stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`📊 ANALYTICS: Fetching media items stats for user ${userId}`);

    // Get stats for each media item owned by the user
    // Total Plays: all plays regardless of duration
    // Unique Plays: distinct (media_id, user_id/session_id) where play_duration > 30
    const mediaItemsStats = await pool.query(
      `SELECT 
        m.id,
        m.title,
        m.file_type as type,
        m.url,
        COUNT(mp.id) as total_plays,
        COUNT(DISTINCT CASE 
          WHEN mp.play_duration > 30 
          THEN mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id) 
        END) as unique_plays
      FROM media m
      LEFT JOIN media_plays mp ON m.id = mp.media_id
      WHERE m.user_id = $1
      GROUP BY m.id, m.title, m.file_type, m.url
      ORDER BY total_plays DESC, m.title ASC`,
      [userId]
    );

    const result = {
      success: true,
      mediaItems: mediaItemsStats.rows.map(row => ({
        id: row.id,
        title: row.title,
        type: row.type,
        url: row.url,
        totalPlays: parseInt(row.total_plays || 0),
        uniquePlays: parseInt(row.unique_plays || 0),
      })),
    };

    console.log(`📊 ANALYTICS: Media items stats retrieved - ${result.mediaItems.length} items`);
    res.json(result);
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching media items stats:', error);
    res.status(500).json({ error: 'Failed to fetch media items statistics' });
  }
});

// Get stats for a specific media item
app.get('/api/analytics/media-stats/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { userId } = req.query;

    console.log(`📊 ANALYTICS: Fetching stats for media ${mediaId}${userId ? ` for user ${userId}` : ''}`);

    // Verify media belongs to user if userId is provided
    if (userId) {
      const mediaCheck = await pool.query(
        'SELECT id FROM media WHERE id = $1 AND user_id = $2',
        [mediaId, userId]
      );
      if (mediaCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Media not found or access denied' });
      }
    }

    // Get total plays for this media item (all plays)
    const totalPlays = await pool.query(
      'SELECT COUNT(*) as total_plays FROM media_plays WHERE media_id = $1',
      [mediaId]
    );

    // Get unique plays for this media item (> 30 seconds, one per user)
    const uniquePlays = await pool.query(
      `SELECT COUNT(DISTINCT mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id)) as unique_plays
       FROM media_plays mp
       WHERE mp.media_id = $1 AND mp.play_duration > 30`,
      [mediaId]
    );

    // Get average duration
    const avgDuration = await pool.query(
      'SELECT COALESCE(AVG(play_duration), 0) as avg_duration FROM media_plays WHERE media_id = $1',
      [mediaId]
    );

    // Get media info
    const mediaInfo = await pool.query(
      'SELECT id, title, file_name, type FROM media WHERE id = $1',
      [mediaId]
    );

    const result = {
      mediaId: parseInt(mediaId),
      media: mediaInfo.rows[0] || null,
      totalPlays: parseInt(totalPlays.rows[0]?.total_plays || 0),
      uniquePlays: parseInt(uniquePlays.rows[0]?.unique_plays || 0),
      averageDuration: Math.round(parseFloat(avgDuration.rows[0]?.avg_duration || 0)),
    };

    console.log('📊 ANALYTICS: Media stats retrieved');
    res.json(result);
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching media stats:', error);
    res.status(500).json({ error: 'Failed to fetch media statistics' });
  }
});

// Get cart conversion statistics
app.get('/api/analytics/cart-conversion', async (req, res) => {
  try {
    const { userId } = req.query;

    console.log(`📊 ANALYTICS: Fetching cart conversion stats${userId ? ` for user ${userId}` : ''}`);

    let cartWhere = '';
    let purchaseJoin = '';
    const params = [];

    if (userId) {
      cartWhere = 'WHERE ce.user_id = $1';
      purchaseJoin = 'AND pe.user_id = $1';
      params.push(userId);
    }

    // Get cart additions
    const cartStats = await pool.query(
      `SELECT 
        COUNT(*) as total_additions,
        COALESCE(SUM(quantity), 0) as total_items_added
       FROM cart_events ce
       ${cartWhere}`,
      params
    );

    // Get purchases
    const purchaseStats = await pool.query(
      `SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(total_amount), 0) as total_revenue
       FROM purchase_events pe
       ${userId ? 'WHERE pe.user_id = $1' : ''}`,
      params
    );

    // Calculate items purchased from items JSONB
    const itemsPurchased = await pool.query(
      `SELECT 
        COALESCE(SUM((item->>'quantity')::integer), 0) as total_items_purchased
       FROM purchase_events pe, jsonb_array_elements(pe.items) as item
       ${userId ? 'WHERE pe.user_id = $1' : ''}`,
      params
    );

    const totalItemsAdded = parseInt(cartStats.rows[0]?.total_items_added || 0);
    const totalItemsPurchased = parseInt(itemsPurchased.rows[0]?.total_items_purchased || 0);
    const conversionRate = totalItemsAdded > 0 
      ? ((totalItemsPurchased / totalItemsAdded) * 100).toFixed(2)
      : 0;

    const totalPurchases = parseInt(purchaseStats.rows[0]?.total_purchases || 0);
    const totalRevenue = parseInt(purchaseStats.rows[0]?.total_revenue || 0);
    const averageOrderValue = totalPurchases > 0 
      ? Math.round(totalRevenue / totalPurchases)
      : 0;

    const result = {
      totalItemsAddedToCart: totalItemsAdded,
      totalItemsPurchased: totalItemsPurchased,
      conversionRate: parseFloat(conversionRate),
      totalPurchases: totalPurchases,
      totalRevenue: totalRevenue,
      averageOrderValue: averageOrderValue,
    };

    console.log('📊 ANALYTICS: Cart conversion stats retrieved');
    res.json(result);
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching cart conversion stats:', error);
    res.status(500).json({ error: 'Failed to fetch cart conversion statistics' });
  }
});

// Get age demographics for media plays
app.get('/api/analytics/media-plays/age-demographics', async (req, res) => {
  try {
    const { userId, uniqueOnly } = req.query;
    const isUniqueOnly = uniqueOnly === 'true' || uniqueOnly === true;

    console.log(`📊 ANALYTICS: Fetching age demographics for media plays${userId ? ` for user ${userId}` : ''}, uniqueOnly: ${isUniqueOnly}`);

    let baseQuery;
    let params = [];

    if (isUniqueOnly) {
      // For unique plays, use DISTINCT on (media_id, session_id) combination
      if (userId) {
        baseQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_age_range, mp.session_id
            FROM media_plays mp
            JOIN media m ON mp.media_id = m.id
            WHERE m.user_id = $1
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_age_range, 'Unknown')
          ORDER BY count DESC
        `;
        params = [userId];
      } else {
        baseQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_age_range, mp.session_id
            FROM media_plays mp
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_age_range, 'Unknown')
          ORDER BY count DESC
        `;
      }
    } else {
      // For total plays, count all plays (including those without demographics)
      if (userId) {
        baseQuery = `
          SELECT 
            COALESCE(mp.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM media_plays mp
          JOIN media m ON mp.media_id = m.id
          WHERE m.user_id = $1
          GROUP BY COALESCE(mp.user_provided_age_range, 'Unknown')
          ORDER BY count DESC
        `;
        params = [userId];
      } else {
        baseQuery = `
          SELECT 
            COALESCE(mp.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM media_plays mp
          GROUP BY COALESCE(mp.user_provided_age_range, 'Unknown')
          ORDER BY count DESC
        `;
      }
    }

    const result = await pool.query(baseQuery, params);
    
    console.log(`📊 ANALYTICS: Age demographics query returned ${result.rows.length} rows`);
    
    res.json({
      success: true,
      uniqueOnly: isUniqueOnly,
      ageRanges: result.rows.map(r => ({
        ageRange: r.age_range,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching age demographics:', error);
    res.status(500).json({ error: 'Failed to fetch age demographics' });
  }
});

// Get location demographics for media plays
app.get('/api/analytics/media-plays/location-demographics', async (req, res) => {
  try {
    const { userId, uniqueOnly } = req.query;
    const isUniqueOnly = uniqueOnly === 'true' || uniqueOnly === true;

    console.log(`📊 ANALYTICS: Fetching location demographics for media plays${userId ? ` for user ${userId}` : ''}, uniqueOnly: ${isUniqueOnly}`);

    let countriesQuery;
    let citiesQuery;
    let params = [];

    if (isUniqueOnly) {
      // For unique plays, use DISTINCT on (media_id, session_id) combination
      if (userId) {
        countriesQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_city, mp.user_provided_state, mp.session_id
            FROM media_plays mp
            JOIN media m ON mp.media_id = m.id
            WHERE m.user_id = $1
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_state, 'Unknown') AS country,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_state, 'Unknown')
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_city, mp.user_provided_state, mp.session_id
            FROM media_plays mp
            JOIN media m ON mp.media_id = m.id
            WHERE m.user_id = $1
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_city, 'Unknown') AS city,
            COALESCE(up.user_provided_state, '') AS region,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_city, 'Unknown'), COALESCE(up.user_provided_state, '')
          ORDER BY count DESC
          LIMIT 10
        `;
        params = [userId];
      } else {
        countriesQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_city, mp.user_provided_state, mp.session_id
            FROM media_plays mp
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_state, 'Unknown') AS country,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_state, 'Unknown')
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_city, mp.user_provided_state, mp.session_id
            FROM media_plays mp
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_city, 'Unknown') AS city,
            COALESCE(up.user_provided_state, '') AS region,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_city, 'Unknown'), COALESCE(up.user_provided_state, '')
          ORDER BY count DESC
          LIMIT 10
        `;
      }
    } else {
      // For total plays, count all plays (including those without location data)
      if (userId) {
        countriesQuery = `
          SELECT 
            COALESCE(mp.user_provided_state, 'Unknown') AS country,
            COUNT(*) AS count
          FROM media_plays mp
          JOIN media m ON mp.media_id = m.id
          WHERE m.user_id = $1
          GROUP BY COALESCE(mp.user_provided_state, 'Unknown')
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          SELECT 
            COALESCE(mp.user_provided_city, 'Unknown') AS city,
            COALESCE(mp.user_provided_state, '') AS region,
            COUNT(*) AS count
          FROM media_plays mp
          JOIN media m ON mp.media_id = m.id
          WHERE m.user_id = $1
          GROUP BY COALESCE(mp.user_provided_city, 'Unknown'), COALESCE(mp.user_provided_state, '')
          ORDER BY count DESC
          LIMIT 10
        `;
        params = [userId];
      } else {
        countriesQuery = `
          SELECT 
            COALESCE(mp.user_provided_state, 'Unknown') AS country,
            COUNT(*) AS count
          FROM media_plays mp
          GROUP BY COALESCE(mp.user_provided_state, 'Unknown')
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          SELECT 
            COALESCE(mp.user_provided_city, 'Unknown') AS city,
            COALESCE(mp.user_provided_state, '') AS region,
            COUNT(*) AS count
          FROM media_plays mp
          GROUP BY COALESCE(mp.user_provided_city, 'Unknown'), COALESCE(mp.user_provided_state, '')
          ORDER BY count DESC
          LIMIT 10
        `;
      }
    }

    const [countriesResult, citiesResult] = await Promise.all([
      pool.query(countriesQuery, params),
      pool.query(citiesQuery, params)
    ]);
    
    console.log(`📊 ANALYTICS: Location demographics query returned ${countriesResult.rows.length} countries, ${citiesResult.rows.length} cities`);
    
    res.json({
      success: true,
      uniqueOnly: isUniqueOnly,
      topCountries: countriesResult.rows.map(r => ({
        country: r.country,
        location_name: r.country,
        count: parseInt(r.count)
      })),
      topCities: citiesResult.rows.map(r => ({
        city: r.city,
        region: r.region,
        country: r.region || '',
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching location demographics:', error);
    res.status(500).json({ error: 'Failed to fetch location demographics' });
  }
});

// Get location demographics for QR code scans
app.get('/api/analytics/qr-scans/location-demographics', authenticateTokenOptional, async (req, res) => {
  try {
    const { userId, days } = req.query;
    const userIdNum = userId ? parseInt(userId, 10) : null;
    const daysNum = days ? parseInt(days, 10) : null;

    console.log(`📊 ANALYTICS: Fetching QR scan location demographics${userIdNum ? ` for user ${userIdNum}` : ''}${daysNum ? ` (last ${daysNum} days)` : ''}`);

    let countriesQuery;
    let citiesQuery;
    let params = [];

    if (userIdNum) {
      // Filter by user's QR codes
      if (daysNum) {
        countriesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, 'Unknown')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
            AND s.scanned_at >= NOW() - ($2 || ' days')::INTERVAL
          GROUP BY COALESCE(
            NULLIF(TRIM(s.country_name), ''),
            COALESCE(s.country_code, 'Unknown')
          )
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ) AS city,
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ) AS region,
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
            AND s.scanned_at >= NOW() - ($2 || ' days')::INTERVAL
          GROUP BY 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ),
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ),
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            )
          ORDER BY count DESC
          LIMIT 20
        `;
        params = [userIdNum, daysNum];
      } else {
        countriesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, 'Unknown')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
          GROUP BY COALESCE(
            NULLIF(TRIM(s.country_name), ''),
            COALESCE(s.country_code, 'Unknown')
          )
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ) AS city,
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ) AS region,
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
          GROUP BY 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ),
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ),
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            )
          ORDER BY count DESC
          LIMIT 20
        `;
        params = [userIdNum];
      }
    } else {
      // All QR scans (admin view or no user filter)
      if (daysNum) {
        countriesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, 'Unknown')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          WHERE s.scanned_at >= NOW() - ($1 || ' days')::INTERVAL
          GROUP BY COALESCE(
            NULLIF(TRIM(s.country_name), ''),
            COALESCE(s.country_code, 'Unknown')
          )
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ) AS city,
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ) AS region,
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          WHERE s.scanned_at >= NOW() - ($1 || ' days')::INTERVAL
          GROUP BY 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ),
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ),
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            )
          ORDER BY count DESC
          LIMIT 20
        `;
        params = [daysNum];
      } else {
        countriesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, 'Unknown')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          GROUP BY COALESCE(
            NULLIF(TRIM(s.country_name), ''),
            COALESCE(s.country_code, 'Unknown')
          )
          ORDER BY count DESC
          LIMIT 10
        `;
        citiesQuery = `
          SELECT 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ) AS city,
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ) AS region,
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            ) AS country,
            COUNT(*) AS count
          FROM qr_scans s
          GROUP BY 
            COALESCE(
              NULLIF(TRIM(s.user_provided_city), ''),
              NULLIF(TRIM(s.city), ''),
              'Unknown'
            ),
            COALESCE(
              NULLIF(TRIM(s.user_provided_state), ''),
              NULLIF(TRIM(s.region), ''),
              ''
            ),
            COALESCE(
              NULLIF(TRIM(s.country_name), ''),
              COALESCE(s.country_code, '')
            )
          ORDER BY count DESC
          LIMIT 20
        `;
        params = [];
      }
    }

    const [countriesResult, citiesResult] = await Promise.all([
      pool.query(countriesQuery, params),
      pool.query(citiesQuery, params)
    ]);
    
    console.log(`📊 ANALYTICS: QR scan location demographics query returned ${countriesResult.rows.length} countries, ${citiesResult.rows.length} cities`);
    
    res.json({
      success: true,
      topCountries: countriesResult.rows.map(r => ({
        country: r.country,
        location_name: r.country,
        count: parseInt(r.count)
      })),
      topCities: citiesResult.rows.map(r => ({
        city: r.city,
        region: r.region,
        country: r.country || '',
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching QR scan location demographics:', error);
    res.status(500).json({ error: 'Failed to fetch QR scan location demographics' });
  }
});

// Get age demographics for QR code scans
app.get('/api/analytics/qr-scans/age-demographics', authenticateTokenOptional, async (req, res) => {
  try {
    const { userId, days } = req.query;
    const userIdNum = userId ? parseInt(userId, 10) : null;
    const daysNum = days ? parseInt(days, 10) : null;

    console.log(`📊 ANALYTICS: Fetching QR scan age demographics${userIdNum ? ` for user ${userIdNum}` : ''}${daysNum ? ` (last ${daysNum} days)` : ''}`);

    let baseQuery;
    let params = [];

    if (userIdNum) {
      // Filter by user's QR codes
      if (daysNum) {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
            AND s.scanned_at >= NOW() - ($2 || ' days')::INTERVAL
            AND s.user_provided_age_range IS NOT NULL
          GROUP BY COALESCE(s.user_provided_age_range, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_age_range, 'Unknown')
              WHEN 'Under 18' THEN 1
              WHEN '18-24' THEN 2
              WHEN '25-34' THEN 3
              WHEN '35-44' THEN 4
              WHEN '45-54' THEN 5
              WHEN '55-64' THEN 6
              WHEN '65+' THEN 7
              ELSE 8
            END
        `;
        params = [userIdNum, daysNum];
      } else {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
            AND s.user_provided_age_range IS NOT NULL
          GROUP BY COALESCE(s.user_provided_age_range, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_age_range, 'Unknown')
              WHEN 'Under 18' THEN 1
              WHEN '18-24' THEN 2
              WHEN '25-34' THEN 3
              WHEN '35-44' THEN 4
              WHEN '45-54' THEN 5
              WHEN '55-64' THEN 6
              WHEN '65+' THEN 7
              ELSE 8
            END
        `;
        params = [userIdNum];
      }
    } else {
      // All QR scans (admin view or no user filter)
      if (daysNum) {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM qr_scans s
          WHERE s.scanned_at >= NOW() - ($1 || ' days')::INTERVAL
            AND s.user_provided_age_range IS NOT NULL
          GROUP BY COALESCE(s.user_provided_age_range, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_age_range, 'Unknown')
              WHEN 'Under 18' THEN 1
              WHEN '18-24' THEN 2
              WHEN '25-34' THEN 3
              WHEN '35-44' THEN 4
              WHEN '45-54' THEN 5
              WHEN '55-64' THEN 6
              WHEN '65+' THEN 7
              ELSE 8
            END
        `;
        params = [daysNum];
      } else {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_age_range, 'Unknown') AS age_range,
            COUNT(*) AS count
          FROM qr_scans s
          WHERE s.user_provided_age_range IS NOT NULL
          GROUP BY COALESCE(s.user_provided_age_range, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_age_range, 'Unknown')
              WHEN 'Under 18' THEN 1
              WHEN '18-24' THEN 2
              WHEN '25-34' THEN 3
              WHEN '35-44' THEN 4
              WHEN '45-54' THEN 5
              WHEN '55-64' THEN 6
              WHEN '65+' THEN 7
              ELSE 8
            END
        `;
        params = [];
      }
    }

    const result = await pool.query(baseQuery, params);
    
    console.log(`📊 ANALYTICS: QR scan age demographics query returned ${result.rows.length} age ranges`);
    
    res.json({
      success: true,
      ageRanges: result.rows.map(r => ({
        ageRange: r.age_range,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching QR scan age demographics:', error);
    res.status(500).json({ error: 'Failed to fetch QR scan age demographics' });
  }
});

// Get gender demographics for QR code scans
app.get('/api/analytics/qr-scans/gender-demographics', authenticateTokenOptional, async (req, res) => {
  try {
    const { userId, days } = req.query;
    const userIdNum = userId ? parseInt(userId, 10) : null;
    const daysNum = days ? parseInt(days, 10) : null;

    console.log(`📊 ANALYTICS: Fetching QR scan gender demographics${userIdNum ? ` for user ${userIdNum}` : ''}${daysNum ? ` (last ${daysNum} days)` : ''}`);

    let baseQuery;
    let params = [];

    if (userIdNum) {
      // Filter by user's QR codes
      if (daysNum) {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
            AND s.scanned_at >= NOW() - ($2 || ' days')::INTERVAL
            AND s.user_provided_gender IS NOT NULL
          GROUP BY COALESCE(s.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
        params = [userIdNum, daysNum];
      } else {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
            AND s.user_provided_gender IS NOT NULL
          GROUP BY COALESCE(s.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
        params = [userIdNum];
      }
    } else {
      // All QR scans (admin view or no user filter)
      if (daysNum) {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM qr_scans s
          WHERE s.scanned_at >= NOW() - ($1 || ' days')::INTERVAL
            AND s.user_provided_gender IS NOT NULL
          GROUP BY COALESCE(s.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
        params = [daysNum];
      } else {
        baseQuery = `
          SELECT 
            COALESCE(s.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM qr_scans s
          WHERE s.user_provided_gender IS NOT NULL
          GROUP BY COALESCE(s.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(s.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
        params = [];
      }
    }

    const result = await pool.query(baseQuery, params);
    
    console.log(`📊 ANALYTICS: QR scan gender demographics query returned ${result.rows.length} gender categories`);
    
    res.json({
      success: true,
      genderDistribution: result.rows.map(r => ({
        gender: r.gender,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching QR scan gender demographics:', error);
    res.status(500).json({ error: 'Failed to fetch QR scan gender demographics' });
  }
});

// Get gender demographics for media plays
app.get('/api/analytics/media-plays/gender-demographics', async (req, res) => {
  try {
    const { userId, uniqueOnly } = req.query;
    const isUniqueOnly = uniqueOnly === 'true' || uniqueOnly === true;

    console.log(`📊 ANALYTICS: Fetching gender demographics for media plays${userId ? ` for user ${userId}` : ''}, uniqueOnly: ${isUniqueOnly}`);

    let baseQuery;
    let params = [];

    if (isUniqueOnly) {
      // For unique plays, use DISTINCT on (media_id, session_id) combination
      if (userId) {
        baseQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_gender, mp.session_id
            FROM media_plays mp
            JOIN media m ON mp.media_id = m.id
            WHERE m.user_id = $1
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(up.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
        params = [userId];
      } else {
        baseQuery = `
          WITH unique_plays AS (
            SELECT DISTINCT ON (mp.media_id, mp.session_id)
              mp.id, mp.user_provided_gender, mp.session_id
            FROM media_plays mp
            ORDER BY mp.media_id, mp.session_id, mp.played_at DESC
          )
          SELECT 
            COALESCE(up.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM unique_plays up
          GROUP BY COALESCE(up.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(up.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
      }
    } else {
      // For total plays, count all plays (including those without demographics)
      if (userId) {
        baseQuery = `
          SELECT 
            COALESCE(mp.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM media_plays mp
          JOIN media m ON mp.media_id = m.id
          WHERE m.user_id = $1
          GROUP BY COALESCE(mp.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(mp.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
        params = [userId];
      } else {
        baseQuery = `
          SELECT 
            COALESCE(mp.user_provided_gender, 'Unknown') AS gender,
            COUNT(*) AS count
          FROM media_plays mp
          GROUP BY COALESCE(mp.user_provided_gender, 'Unknown')
          ORDER BY 
            CASE COALESCE(mp.user_provided_gender, 'Unknown')
              WHEN 'Male' THEN 1
              WHEN 'Female' THEN 2
              WHEN 'Non-binary' THEN 3
              WHEN 'Prefer not to say' THEN 4
              WHEN 'Open-ended' THEN 5
              ELSE 6
            END
        `;
      }
    }

    const result = await pool.query(baseQuery, params);
    
    console.log(`📊 ANALYTICS: Gender demographics query returned ${result.rows.length} rows`);
    
    res.json({
      success: true,
      uniqueOnly: isUniqueOnly,
      genderDistribution: result.rows.map(r => ({
        gender: r.gender,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching gender demographics:', error);
    res.status(500).json({ error: 'Failed to fetch gender demographics' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT id, email, username, created_at FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user's demographics
app.get('/api/user/demographics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      'SELECT age_range, gender FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const demographics = result.rows[0];
    res.json({
      ageRange: demographics.age_range,
      gender: demographics.gender,
      hasData: !!(demographics.age_range && demographics.gender)
    });
  } catch (error) {
    console.error('Error fetching user demographics:', error);
    res.status(500).json({ error: 'Failed to fetch demographics', details: error.message });
  }
});

// One-time migration endpoint (ADMIN ONLY - requires secret key)
app.post('/api/admin/run-demographics-migrations', async (req, res) => {
  try {
    const { secretKey } = req.body;
    
    // Simple protection - you'll need to provide this key
    if (secretKey !== 'migrate-demographics-2025') {
      return res.status(403).json({ error: 'Invalid secret key' });
    }
    
    console.log('🔧 MIGRATION: Running demographics migrations...');
    
    const migrations = [
      {
        name: 'Add user_provided_age_range to qr_scans',
        sql: 'ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS user_provided_age_range TEXT'
      },
      {
        name: 'Add user_provided_gender to qr_scans',
        sql: 'ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS user_provided_gender TEXT'
      },
      {
        name: 'Add age_range to users',
        sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS age_range TEXT'
      },
      {
        name: 'Add gender to users',
        sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT'
      },
      {
        name: 'Index qr_scans age_range',
        sql: 'CREATE INDEX IF NOT EXISTS idx_qr_scans_age_range ON qr_scans(user_provided_age_range)'
      },
      {
        name: 'Index qr_scans gender',
        sql: 'CREATE INDEX IF NOT EXISTS idx_qr_scans_gender ON qr_scans(user_provided_gender)'
      },
      {
        name: 'Index users age_range',
        sql: 'CREATE INDEX IF NOT EXISTS idx_users_age_range ON users(age_range)'
      },
      {
        name: 'Index users gender',
        sql: 'CREATE INDEX IF NOT EXISTS idx_users_gender ON users(gender)'
      },
    ];
    
    const results = [];
    
    for (const migration of migrations) {
      try {
        console.log(`  Running: ${migration.name}`);
        await pool.query(migration.sql);
        results.push({ name: migration.name, status: 'success' });
        console.log(`  ✅ ${migration.name}`);
      } catch (error) {
        console.error(`  ❌ ${migration.name}:`, error.message);
        results.push({ name: migration.name, status: 'error', error: error.message });
      }
    }
    
    console.log('🔧 MIGRATION: Complete!');
    
    res.json({
      success: true,
      message: 'Migrations completed',
      results
    });
  } catch (error) {
    console.error('🔧 MIGRATION: Failed:', error);
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
});

// Debug endpoint to check database connection and schema
app.get('/api/debug/database-info', async (req, res) => {
  try {
    // Get database name and host
    const dbInfo = await pool.query('SELECT current_database(), current_user, version()');
    
    // Check if demographics columns exist
    const columns = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('qr_scans', 'users')
        AND column_name IN ('user_provided_age_range', 'user_provided_gender', 'age_range', 'gender')
      ORDER BY table_name, column_name
    `);
    
    res.json({
      database: dbInfo.rows[0].current_database,
      user: dbInfo.rows[0].current_user,
      version: dbInfo.rows[0].version,
      host: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'unknown',
      demographicsColumns: columns.rows,
      columnsExist: columns.rows.length > 0
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get database info',
      details: error.message
    });
  }
});

// Debug endpoint to check demographics in qr_scans table (public for testing)
app.get('/api/debug/demographics-data', async (req, res) => {
  try {
    // Check if columns exist and have data
    const result = await pool.query(`
      SELECT 
        user_provided_age_range,
        user_provided_gender,
        scanned_at,
        qr_code_id
      FROM qr_scans 
      WHERE user_provided_age_range IS NOT NULL 
         OR user_provided_gender IS NOT NULL
      ORDER BY scanned_at DESC 
      LIMIT 20
    `);
    
    res.json({
      count: result.rows.length,
      data: result.rows,
      message: result.rows.length > 0 
        ? 'Demographics data found!' 
        : 'No demographics data in database yet'
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Query failed', 
      details: error.message,
      hint: 'Database columns might not exist yet - check if migrations ran'
    });
  }
});

// Update current user's demographics
app.put('/api/user/demographics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { ageRange, gender } = req.body;
    
    console.log('👤 USER_DEMOGRAPHICS: Updating for user:', userId, { ageRange, gender });
    
    await pool.query(
      'UPDATE users SET age_range = $1, gender = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [ageRange || null, gender || null, userId]
    );
    
    res.json({ success: true, message: 'Demographics updated successfully' });
  } catch (error) {
    console.error('Error updating user demographics:', error);
    res.status(500).json({ error: 'Failed to update demographics' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    // Case-insensitive email lookup using LOWER()
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) return res.status(401).json({ error: 'Invalid credentials' });
    
    // **FIX**: Ensure isAdmin is included in the token payload
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        isAdmin: user.is_admin // This was missing
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
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
    // Case-insensitive email check
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR username = $2', [email, username]);
    if (existingUser.rows.length > 0) return res.status(409).json({ error: 'Email or username already exists' });
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, is_admin`,
      [email, username, hashedPassword]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ userId: newUser.id, email: newUser.email, isAdmin: newUser.is_admin }, JWT_SECRET, { expiresIn: '24h' });

    // Automatically send verification email
    try {
      await transporter.sendMail({
        from: '"MerchTrader QR" <help@merchtrader.org>',
        to: email,
        subject: 'Verify Your MerchTech Account',
        html: `Thank you for registering! Please verify your email by clicking this link: <a href="${process.env.FRONTEND_URL}/auth/verify-email?token=${token}">Verify Email</a>`,
      });
      console.log(`Verification email sent to ${email}`);
    } catch (emailError) {
      console.error(`🔴 Failed to send verification email to ${email}:`, emailError);
      // Do not block registration if email fails. Log the error for follow-up.
    }

    res.status(201).json({ user: newUser, token });
  } catch (error) {
    console.error('🔴 REGISTRATION ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/send-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const userResult = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = userResult.rows[0];
    if (user.is_email_verified) return res.status(400).json({ error: 'Email is already verified' });

    const verificationToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    await pool.query('UPDATE users SET verification_token = $1 WHERE id = $2', [verificationToken, user.id]);

    const verificationUrl = `http://localhost:8081/auth/verify?token=${verificationToken}`;

    await transporter.sendMail({
      from: '"MerchTrader QR" <help@merchtrader.org>',
      to: email,
      subject: 'Verify Your MerchTech Account',
      html: `<p>Please click the link below to verify your email address:</p><a href="${verificationUrl}">Verify Email</a>`,
    });

    res.status(200).json({ message: 'Verification email sent successfully.' });

  } catch (error) {
    console.error('🔴 SEND VERIFICATION ERROR:', error);
    res.status(500).json({ error: 'Failed to send verification email.' });
  }
});

app.get('/api/auth/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await pool.query(
      `UPDATE users SET is_email_verified = true, verification_token = null WHERE id = $1 AND is_email_verified = false RETURNING id`,
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Token is invalid or user is already verified.' });
    }

    res.redirect(`http://localhost:8081/auth/verification-success`);

  } catch (error) {
    console.error('🔴 VERIFY EMAIL ERROR:', error);
    res.status(400).json({ error: 'Invalid or expired verification token.' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const deleteResult = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error(`Error deleting user ${id}:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.patch('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const {
        subscriptionTier,
        isAdmin: adminStatus,
        isSuspended,
        maxProducts,
        maxAudioFiles,
        maxPlaylists,
        maxQrCodes,
        maxSlideshows,
        maxVideos,
        maxActivationCodes
    } = req.body;

    try {
        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (subscriptionTier !== undefined) {
            updates.push(`subscription_tier = $${paramCount++}`);
            values.push(subscriptionTier);
        }
        if (adminStatus !== undefined) {
            updates.push(`is_admin = $${paramCount++}`);
            values.push(adminStatus);
        }
        if (isSuspended !== undefined) {
            updates.push(`is_suspended = $${paramCount++}`);
            values.push(isSuspended);
        }
        if (maxProducts !== undefined) {
            updates.push(`max_products = $${paramCount++}`);
            values.push(maxProducts === 0 ? null : maxProducts);
        }
        if (maxAudioFiles !== undefined) {
            updates.push(`max_audio_files = $${paramCount++}`);
            values.push(maxAudioFiles === 0 ? null : maxAudioFiles);
        }
        if (maxPlaylists !== undefined) {
            updates.push(`max_playlists = $${paramCount++}`);
            values.push(maxPlaylists === 0 ? null : maxPlaylists);
        }
        if (maxQrCodes !== undefined) {
            updates.push(`max_qr_codes = $${paramCount++}`);
            values.push(maxQrCodes === 0 ? null : maxQrCodes);
        }
        if (maxSlideshows !== undefined) {
            updates.push(`max_slideshows = $${paramCount++}`);
            values.push(maxSlideshows === 0 ? null : maxSlideshows);
        }
        if (maxVideos !== undefined) {
            updates.push(`max_videos = $${paramCount++}`);
            values.push(maxVideos === 0 ? null : maxVideos);
        }
        if (maxActivationCodes !== undefined) {
            updates.push(`max_activation_codes = $${paramCount++}`);
            values.push(maxActivationCodes === 0 ? null : maxActivationCodes);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const query = `
            UPDATE users 
            SET ${updates.join(', ')} 
            WHERE id = $${paramCount} 
            RETURNING id, email, username, subscription_tier, is_admin, is_suspended, 
                     max_products, max_audio_files, max_playlists, max_qr_codes, 
                     max_slideshows, max_videos, max_activation_codes, created_at, updated_at
        `;

        const result = await pool.query(query, values);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log(`✅ Admin updated user ${id} permissions:`, req.body);
        res.json({ user: result.rows[0], message: 'User permissions updated successfully' });
    } catch (error) {
        console.error(`Error updating user ${id} permissions:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Helper Functions ---
const sanitizeImageUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  
  // Define the production base URL for sanitization
  const productionBase = 'https://merchtech5-production.up.railway.app';
  
  const computedBase =
    (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.replace(/\/+$/, '')) ||
    (process.env.NODE_ENV === 'production'
      ? productionBase
      : `http://localhost:${PORT}`);

  return urls.map(url => {
    if (typeof url !== 'string') return null;
    
    let finalUrl = url;

    // CRITICAL FIX: Always replace localhost URLs with the production domain.
    // This sanitizes incorrect data that may have been saved in the database from a dev environment.
    if (/https?:\/\/localhost:\d+/.test(finalUrl)) {
      finalUrl = finalUrl.replace(/https?:\/\/localhost:\d+/, productionBase);
    }
    
    // If it's already using our image proxy, ensure it uses the correct domain
    if (finalUrl.includes('/api/images/s3/')) {
      // Convert relative proxy paths to absolute for React Native clients
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        return `${computedBase}${finalUrl.startsWith('/') ? '' : '/'}${finalUrl}`;
      }
      
      // Fix old domain URLs - corrected typo from 'merchtechapp5' to 'merchtech5'
      if (finalUrl.includes('merchtechapp5-production.up.railway.app')) {
        return finalUrl.replace('merchtechapp5-production.up.railway.app', 'merchtech5-production.up.railway.app');
      }
      
      return finalUrl; // Already absolute
    }
    
    // If it's a direct S3 URL, convert to proxy URL for guaranteed mobile compatibility
    // Direct S3 URLs may not work if bucket isn't public; proxy always works with AWS credentials
    if (finalUrl.includes('amazonaws.com') || finalUrl.includes('merchtechbucket.s3')) {
      // Extract the S3 key from the URL
      const s3KeyMatch = finalUrl.match(/merchtechbucket\.s3[^\/]*\.amazonaws\.com\/(.+)/) || 
                         finalUrl.match(/s3[^\/]*\.amazonaws\.com\/merchtechbucket\/(.+)/);
      if (s3KeyMatch && s3KeyMatch[1]) {
        const s3Key = s3KeyMatch[1];
        console.log(`🖼️ SANITIZE: Converting S3 URL to proxy for mobile: ${s3Key}`);
        return `${computedBase}/api/images/s3/${s3Key}`;
      }
      console.log('🖼️ SANITIZE: Keeping S3 URL (could not extract key):', finalUrl);
      return finalUrl.replace('http://', 'https://');
    }
    
    // If it's already a full URL (but not S3), return as-is
    if (finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
      return finalUrl;
    }
    
    // If it's an S3 key, convert to image proxy URL
    if (finalUrl.includes('/') || finalUrl.includes('.')) {
      return `${computedBase}/api/images/s3/${finalUrl}`;
    }
    
    return finalUrl;
  }).filter(Boolean);
};

const mapProductFields = (product) => {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    prices: product.prices,
    images: product.images,
    metadata: product.metadata,
    inStock: product.in_stock,
    category: product.category,
    userId: product.user_id,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    artistName: product.artist_name
  };
};

// ---------- PRODUCT ROUTES ----------

// Get products – supports ?mine=true to return only caller's items
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const mine = req.query.mine === 'true';
    let result;
    if (mine) {
      result = await pool.query(
        `SELECT p.*, u.username as artist_name 
         FROM products p
         JOIN users u ON p.user_id = u.id
         WHERE p.user_id = $1 AND p.is_deleted = false 
         ORDER BY p.created_at DESC`, 
        [req.user.userId]
      );
    } else {
      result = await pool.query(
        `SELECT p.*, u.username as artist_name 
         FROM products p
         JOIN users u ON p.user_id = u.id
         WHERE p.is_deleted = false 
         ORDER BY p.created_at DESC`
      );
    }
    const productsWithPrices = result.rows.map(p => {
      let pricesArr = p.prices;
      if (!pricesArr || !pricesArr.length) {
        const amount = p.price || (p.metadata && (p.metadata.price || p.metadata.unit_amount)) || 0;
        pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
      }
      
      // Process images through sanitizeImageUrls
      if (p.images) p.images = sanitizeImageUrls(p.images);
      
      return mapProductFields({ 
        ...p, 
        prices: pricesArr,
        inStock: p.in_stock // Map database field to frontend field
      });
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
    const result = await pool.query(
      `SELECT p.*, u.username as artist_name 
       FROM products p
       JOIN users u ON p.user_id = u.id
       WHERE p.is_deleted = false 
       ORDER BY p.created_at DESC`
    );
    const productsWithPrices = result.rows.map(p => {
      let pricesArr = p.prices;
      if (!pricesArr || !pricesArr.length) {
        const amount = p.price || (p.metadata && (p.metadata.price || p.metadata.unit_amount)) || 0;
        pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
      }
      
      // Process images through sanitizeImageUrls
      if (p.images) p.images = sanitizeImageUrls(p.images);
      
      return mapProductFields({ 
        ...p, 
        prices: pricesArr,
        inStock: p.in_stock // Map database field to frontend field
      });
    });
    res.json({ products: productsWithPrices });
  } catch (err) {
    console.error('Error fetching all products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product by ID
app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 GET_PRODUCT: Fetching product with ID:', id);

    const result = await pool.query(
      `SELECT p.*, u.username as artist_name 
       FROM products p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1 AND p.is_deleted = false`,
      [id]
    );

    if (result.rows.length === 0) {
      console.log('❌ GET_PRODUCT: Product not found with ID:', id);
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    console.log('✅ GET_PRODUCT: Found product:', product.name);
    
    // Format prices array
    let pricesArr = product.prices;
    if (!pricesArr || !pricesArr.length) {
      const amount = product.price || (product.metadata && (product.metadata.price || product.metadata.unit_amount)) || 0;
      pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
    }

    // Fix price formatting - if price is abnormally high (> 10000 cents = $100), it might be stored incorrectly
    let formattedPrice = 0;
    if (product.price) {
      let priceInCents = product.price;
      // If price is greater than $100 (10000 cents), it might be stored as dollars*100 instead of cents
      if (priceInCents > 10000) {
        priceInCents = priceInCents / 100; // Convert back to proper cents
      }
      formattedPrice = priceInCents / 100;
    }

    // Process images through sanitizeImageUrls
    if (product.images) product.images = sanitizeImageUrls(product.images);

    const productWithPrices = mapProductFields({ 
      ...product, 
      price: formattedPrice, // Convert cents to dollars
      prices: pricesArr,
      in_stock: product.in_stock !== false // Ensure boolean
    });
    
    res.json({ product: productWithPrices });
  } catch (error) {
    console.error('🔴 GET_PRODUCT: Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Update product (owner or admin)
app.patch('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const prodRes = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const product = prodRes.rows[0];
    if (!req.user.isAdmin && product.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { name, description, inStock, metadata, isSuspended, images, price, prices, category } = req.body;
    const newMetadata = { ...product.metadata, ...metadata };
    const formattedMetadata = newMetadata ? JSON.stringify(newMetadata) : null;
    const formattedPrices = prices ? JSON.stringify(prices) : null;

    await pool.query(
      `UPDATE products SET 
        name = COALESCE($1, name), 
        description = COALESCE($2, description),
        in_stock = COALESCE($3, in_stock),
        metadata = COALESCE($4, metadata),
        is_suspended = COALESCE($5, is_suspended),
        images = COALESCE($6, images),
        price = COALESCE($7, price),
        prices = COALESCE($8, prices),
        category = COALESCE($9, category),
        updated_at = NOW() 
       WHERE id = $10`,
      [name, description, inStock, formattedMetadata, isSuspended, images, price, formattedPrices, category, id]
    );

    const updated = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    res.json({ product: updated.rows[0] });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const prodRes = await pool.query('SELECT user_id FROM products WHERE id = $1', [id]);

    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = prodRes.rows[0];
    if (!req.user.isAdmin && product.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('UPDATE products SET is_deleted = true, updated_at = NOW() WHERE id = $1', [id]);
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, description, images, metadata, inStock, prices, price, category } = req.body;
    const { userId } = req.user;

    if (!name || !prices || prices.length === 0) {
      return res.status(400).json({ error: 'Product name and price are required.' });
    }

    const userResult = await pool.query('SELECT subscription_tier, max_products FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_deleted = false', [userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    let maxProducts;
    if (user?.max_products !== null && user?.max_products !== undefined) {
      maxProducts = user.max_products;
    } else {
      const limits = {
        free: { maxProducts: 1 },
        basic: { maxProducts: 3 },
        premium: { maxProducts: 10 }
      };
      maxProducts = (limits[userTier] || limits.free).maxProducts;
    }
    
    if (currentCount >= maxProducts) {
      return res.status(403).json({ 
        error: `Product limit reached. You have reached your limit of ${maxProducts} products.`,
        limit: maxProducts,
        current: currentCount,
        subscriptionTier: userTier,
        isCustomLimit: user?.max_products !== null && user?.max_products !== undefined
      });
    }

    const formattedMetadata = metadata ? JSON.stringify(metadata) : JSON.stringify({});
    const formattedPrices = prices ? JSON.stringify(prices) : null;

    const result = await pool.query(
      `INSERT INTO products (user_id, name, description, images, metadata, in_stock, price, prices, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
      [userId, name, description, images, formattedMetadata, inStock, price, formattedPrices, category]
    );
    
    const newProduct = result.rows[0];
    newProduct.prices = prices;
    res.status(201).json({ product: newProduct });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- SALES ROUTES ----------

const toCsv = (rows) => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h)=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','));
  }
  return lines.join('\n');
};

// Seller scoped
app.get('/api/sales/user', authenticateToken, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales WHERE user_id=$1 ORDER BY purchased_at DESC',[req.user.userId]);
    res.json({sales: result.rows});
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

app.get('/api/sales/user/csv', authenticateToken, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales WHERE user_id=$1 ORDER BY purchased_at DESC',[req.user.userId]);
    const csv = toCsv(result.rows);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="my-sales.csv"');
    res.send(csv);
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

// Admin
app.get('/api/sales/all', authenticateToken, isAdmin, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales ORDER BY purchased_at DESC');
    res.json({sales: result.rows});
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

app.get('/api/sales/all/csv', authenticateToken, isAdmin, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales ORDER BY purchased_at DESC');
    const csv = toCsv(result.rows);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="all-sales.csv"');
    res.send(csv);
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

app.post('/api/upload', authenticateToken, (req, res, next) => {
    const requestId = `req_${Date.now()}`;
    console.log(`📤 UPLOAD [${requestId}]: Starting upload request for user ${req.user?.userId}`);
    
    // Use multer middleware with proper error handling
    upload.single('image')(req, res, async (err) => {
        if (err) {
            console.error(`❌ MULTER_ERROR [${requestId}]:`, err);
            
            if (err.code === 'FILE_TYPE_NOT_ALLOWED') {
                return res.status(400).json({ 
                    error: 'File type not allowed. Only images, audio, and video are supported.',
                    code: 'FILE_TYPE_NOT_ALLOWED'
                });
            }
            
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: 'File too large. Maximum size is 500MB.',
                    code: 'FILE_TOO_LARGE'
                });
            }
            
            return res.status(400).json({ 
                error: 'File upload error.', 
                message: err.message,
                code: err.code || 'UPLOAD_ERROR'
            });
        }
        
        if (!req.file) {
            console.error(`❌ UPLOAD_ERROR [${requestId}]: No file uploaded.`);
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        if (!s3Service.isConfigured()) {
            console.error(`❌ UPLOAD_ERROR [${requestId}]: S3 service is not configured.`);
            return res.status(500).json({ error: 'File upload service is not available.' });
        }

        try {
            console.log(`📤 UPLOAD [${requestId}]: Uploading to S3...`);
            console.log(`📤 UPLOAD [${requestId}]: File info:`, {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                hasBuffer: !!req.file.buffer,
                bufferLength: req.file.buffer ? req.file.buffer.length : 'undefined'
            });
            
            // 🔍 CRITICAL: Check for buffer truncation
            if (req.file.buffer && req.file.size !== req.file.buffer.length) {
                console.error(`🚨 BUFFER TRUNCATION DETECTED [${requestId}]!`);
                console.error(`   Reported size: ${req.file.size} bytes`);
                console.error(`   Buffer length: ${req.file.buffer.length} bytes`);
                console.error(`   Missing bytes: ${req.file.size - req.file.buffer.length} bytes`);
                console.error(`   Truncation %: ${((req.file.size - req.file.buffer.length) / req.file.size * 100).toFixed(2)}%`);
                
                return res.status(400).json({ 
                    error: 'File upload truncated during processing. This may be due to memory limits or network issues.',
                    code: 'BUFFER_TRUNCATED',
                    details: {
                        expectedSize: req.file.size,
                        actualSize: req.file.buffer.length,
                        missingBytes: req.file.size - req.file.buffer.length,
                        filename: req.file.originalname
                    }
                });
            }
            
            console.log(`✅ UPLOAD [${requestId}]: Buffer integrity verified - no truncation detected`);
            
            // Generate a unique key for the file
            const key = `users/${req.user.userId}/media/${Date.now()}-${req.file.originalname}`;
            
            const result = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);
            
            // 🔍 VALIDATION: Verify upload was successful and complete
            console.log(`🔍 UPLOAD_VALIDATION [${requestId}]: Verifying S3 upload...`);
            try {
                const metadata = await s3Service.getMetadata(result.Key);
                const expectedSize = req.file.size;
                const actualSize = metadata.ContentLength;
                
                console.log(`🔍 UPLOAD_VALIDATION [${requestId}]: Size check - Expected: ${expectedSize}, Actual: ${actualSize}`);
                
                if (actualSize !== expectedSize) {
                    console.error(`❌ UPLOAD_VALIDATION [${requestId}]: Size mismatch! Expected: ${expectedSize}, Got: ${actualSize}`);
                    
                    // Clean up the incomplete file
                    try {
                        await s3Service.deleteFile(result.Key);
                        console.log(`🗑️ UPLOAD_CLEANUP [${requestId}]: Deleted incomplete file from S3`);
                    } catch (cleanupError) {
                        console.error(`❌ UPLOAD_CLEANUP [${requestId}]: Failed to cleanup incomplete file:`, cleanupError);
                    }
                    
                    return res.status(500).json({ 
                        error: 'Upload validation failed: File size mismatch. The file may have been corrupted during upload.',
                        code: 'UPLOAD_INCOMPLETE',
                        details: {
                            expectedSize,
                            actualSize,
                            filename: req.file.originalname
                        }
                    });
                }
                
                console.log(`✅ UPLOAD_VALIDATION [${requestId}]: Upload verified successfully`);
                
            } catch (validationError) {
                console.error(`❌ UPLOAD_VALIDATION [${requestId}]: Validation failed:`, validationError);
                
                // Clean up the potentially incomplete file
                try {
                    await s3Service.deleteFile(result.Key);
                    console.log(`🗑️ UPLOAD_CLEANUP [${requestId}]: Deleted unverified file from S3`);
                } catch (cleanupError) {
                    console.error(`❌ UPLOAD_CLEANUP [${requestId}]: Failed to cleanup unverified file:`, cleanupError);
                }
                
                return res.status(500).json({ 
                    error: 'Upload validation failed: Could not verify file integrity on S3.',
                    code: 'UPLOAD_VALIDATION_FAILED',
                    details: validationError.message
                });
            }
            
            const proxyUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/images/s3/${result.Key}`;
            
            console.log(`✅ UPLOAD_SUCCESS [${requestId}]: S3 URL: ${result.Location}`);
            console.log(`✅ UPLOAD_SUCCESS [${requestId}]: Proxy URL: ${proxyUrl}`);

            res.status(200).json({
                message: 'File uploaded successfully',
                url: result.Location, // Direct S3 URL
                proxy_url: proxyUrl,   // URL proxied through our server
                key: result.Key,
                imageUrl: proxyUrl,    // Legacy field for backward compatibility
                validated: true        // Indicates upload was verified
            });

        } catch (error) {
            console.error(`❌ UPLOAD_ERROR [${requestId}]:`, error);
            res.status(500).json({ 
                error: 'Failed to upload file.', 
                message: error.message 
            });
        }
    });
});

// --- Image Proxy Endpoint ---

// Handle OPTIONS preflight requests for image proxy
app.options('/api/images/s3/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '3600');
  res.status(200).end();
});

app.get('/api/images/s3/*', async (req, res) => {
    const key = req.params[0];
    if (!key) {
        return res.status(400).send('Invalid image key');
    }
    
    // Public image streaming with permissive headers for mobile clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // Set Content-Disposition to "inline" to prevent direct downloads
    // This instructs the browser to display the file, not download it
    res.setHeader('Content-Disposition', 'inline');

    try {
        let s3Key = key;
        
        // Handle legacy URL structure: if key doesn't start with "users/", 
        // try to convert it to the new structure
        if (!key.startsWith('users/')) {
            // Legacy format: "1/filename" -> "users/1/media/filename"
            const keyParts = key.split('/');
            if (keyParts.length >= 2) {
                const userId = keyParts[0];
                const filename = keyParts.slice(1).join('/');
                s3Key = `users/${userId}/media/${filename}`;
                console.log(`🔗 IMAGE_PROXY: Converted legacy key "${key}" to "${s3Key}"`);
            }
        }
        
        const { stream, metadata } = await s3Service.getStream(s3Key);
        
        console.log(`🔍 IMAGE_PROXY: S3 metadata for "${s3Key}":`, metadata);
        
        // Ensure we have a proper image content type
        let contentType = metadata.ContentType;
        if (!contentType || contentType === 'text/plain') {
          // Try to determine content type from file extension
          const ext = s3Key.toLowerCase().split('.').pop();
          switch (ext) {
            case 'jpg':
            case 'jpeg':
              contentType = 'image/jpeg';
              break;
            case 'png':
              contentType = 'image/png';
              break;
            case 'gif':
              contentType = 'image/gif';
              break;
            case 'webp':
              contentType = 'image/webp';
              break;
            default:
              contentType = 'application/octet-stream';
          }
          console.log(`🔧 IMAGE_PROXY: Corrected content type from "${metadata.ContentType}" to "${contentType}"`);
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', metadata.ContentLength);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        stream.pipe(res);
        
        console.log(`✅ IMAGE_PROXY: Successfully streamed "${s3Key}" with content type "${contentType}"`);
        
    } catch (error) {
        console.error(`🔴 IMAGE_PROXY_ERROR: Failed to stream image for key "${key}":`, error);
        
        // If the converted key failed, try the original key as fallback
        if (!key.startsWith('users/')) {
            try {
                console.log(`🔗 IMAGE_PROXY: Trying original key as fallback: "${key}"`);
                const { stream, metadata } = await s3Service.getStream(key);
                res.setHeader('Content-Type', metadata.ContentType);
                res.setHeader('Content-Length', metadata.ContentLength);
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
                stream.pipe(res);
                console.log(`✅ IMAGE_PROXY: Successfully streamed original key "${key}"`);
                return;
            } catch (fallbackError) {
                console.error(`🔴 IMAGE_PROXY_ERROR: Fallback also failed for key "${key}":`, fallbackError);
            }
        }
        
        // Return a placeholder image for missing files (inline SVG, same-origin)
        console.log(`🔴 IMAGE_PROXY: Image not found, returning inline SVG placeholder`);
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-family="Arial, Helvetica, sans-serif" font-size="24">Image Not Found</text></svg>';
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).send(svg);
    }
});
// --- Local Image Endpoint ---
app.get('/api/images/local/:filename', async (req, res) => {
    const filename = req.params.filename;
    if (!filename) {
        return res.status(400).send('Invalid filename');
    }
    
    console.log(`🖼️ LOCAL_IMAGE: Requested filename: "${filename}"`);
    
    try {
        const filePath = path.join(__dirname, 'uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            console.log(`🔴 LOCAL_IMAGE: File not found: ${filePath}`);
            return res.status(404).send('Image not found');
        }
        
        // Get file stats for content length
        const stats = fs.statSync(filePath);
        
        // Determine content type based on file extension
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        
        switch (ext) {
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
            case '.webp':
                contentType = 'image/webp';
                break;
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        console.log(`✅ LOCAL_IMAGE: Successfully streamed "${filename}"`);
        
    } catch (error) {
        console.error(`🔴 LOCAL_IMAGE_ERROR: Failed to stream image "${filename}":`, error);
        res.status(500).send('Failed to stream image');
    }
});
// ---------- MEDIA ROUTES ----------
app.post('/api/media', authenticateToken, async (req, res) => {
  try {
    const { title, filePath, url, filename, fileType, contentType, filesize, duration, uniqueId, s3_key } = req.body;
    
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }

    // 🔍 S3 FILE VALIDATION: Verify file exists on S3 before saving to database
    if (s3_key && s3Service.isConfigured()) {
      console.log(`🔍 MEDIA_VALIDATION: Verifying S3 file exists for key: ${s3_key}`);
      try {
        const metadata = await s3Service.getMetadata(s3_key);
        const expectedSize = filesize;
        const actualSize = metadata.ContentLength;
        
        console.log(`🔍 MEDIA_VALIDATION: Size check - Expected: ${expectedSize}, Actual: ${actualSize}`);
        
        if (expectedSize && actualSize !== expectedSize) {
          console.error(`❌ MEDIA_VALIDATION: Size mismatch! Expected: ${expectedSize}, Got: ${actualSize}`);
          return res.status(400).json({ 
            error: 'File validation failed: File size mismatch on S3. The file may be corrupted or incomplete.',
            code: 'FILE_SIZE_MISMATCH',
            details: {
              expectedSize,
              actualSize,
              s3_key
            }
          });
        }
        
        console.log(`✅ MEDIA_VALIDATION: S3 file verified successfully`);
        
      } catch (validationError) {
        console.error(`❌ MEDIA_VALIDATION: S3 file validation failed:`, validationError);
        return res.status(400).json({ 
          error: 'File validation failed: Could not verify file exists on S3.',
          code: 'FILE_NOT_FOUND_ON_S3',
          details: {
            s3_key,
            message: validationError.message
          }
        });
      }
    }

    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_audio_files FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM media WHERE user_id = $1', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxAudioFiles;
    if (user?.max_audio_files !== null && user?.max_audio_files !== undefined) {
      // Admin has set a custom limit
      maxAudioFiles = user.max_audio_files;
      console.log(`📋 Using admin-set custom limit: ${maxAudioFiles} audio files for user ${req.user.userId}`);
    } else {
      // Use subscription tier limits
      const limits = {
        free: { maxAudioFiles: 3 },
        basic: { maxAudioFiles: 10 },
        premium: { maxAudioFiles: 20 }
      };
      maxAudioFiles = (limits[userTier] || limits.free).maxAudioFiles;
      console.log(`📋 Using subscription tier limit: ${maxAudioFiles} audio files for ${userTier} plan`);
    }
    
    if (currentCount >= maxAudioFiles) {
      console.log(`🚫 Media upload blocked: User ${req.user.userId} has ${currentCount}/${maxAudioFiles} audio files`);
      return res.status(403).json({ 
        error: `Audio file limit reached. You have reached your limit of ${maxAudioFiles} audio files. Please contact support if you need to increase your limit.`,
        limit: maxAudioFiles,
        current: currentCount,
        subscriptionTier: userTier,
        isCustomLimit: user?.max_audio_files !== null && user?.max_audio_files !== undefined
      });
    }

    console.log(`✅ Media upload allowed: User ${req.user.userId} has ${currentCount}/${maxAudioFiles} audio files`);
    // END SUBSCRIPTION CHECK

    const result = await pool.query(
      `INSERT INTO media (user_id, title, file_path, url, filename, file_type, content_type, filesize, duration, unique_id, s3_key) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
      [req.user.userId, title, filePath || url, url, filename, fileType, contentType, filesize, duration, uniqueId, s3_key]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

app.get('/api/media', authenticateToken, async (req, res) => {
  try {
    console.log('🔴 MEDIA: Fetching media files for user:', req.user.userId);
    
    // Check if current user is admin
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    const isAdmin = userResult.rows[0]?.is_admin || false;
    
    console.log('🔴 MEDIA: User is admin:', isAdmin);
    
    let query, params;
    
    if (isAdmin) {
      // Admin can see all files
      query = 'SELECT * FROM media ORDER BY created_at DESC';
      params = [];
      console.log('🔴 MEDIA: Admin access - returning all media files');
    } else {
      // Regular users can only see their own files
      query = 'SELECT * FROM media WHERE user_id = $1 ORDER BY created_at DESC';
      params = [req.user.userId];
      console.log('🔴 MEDIA: Regular user access - returning only own media files');
    }
    
    const result = await pool.query(query, params);
    
    console.log('🔴 MEDIA: Found', result.rows.length, 'media files for user');
    
    // Process media files to handle S3 URLs properly
    const processedMedia = await Promise.all(result.rows.map(async (media) => {
      let properUrl = media.url;
      
      // Handle S3 files - use streaming endpoint for consistency
      if (media.s3_key && s3Service) {
        // Use streaming endpoint for S3 files to ensure consistent playback
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
      } else if (media.url && media.url.startsWith('data:')) {
        // Handle base64 files - use streaming endpoint
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
      } else if (media.filename && !media.s3_key) {
        // Handle local files
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/uploads/${media.filename}`;
      }
      
      return {
        ...media,
        url: properUrl,
        title: media.title,
        fileType: media.file_type,
        contentType: media.content_type,
        type: media.file_type // Add this field for MediaPlayer component
      };
    }));
    
    res.json({ media: processedMedia });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/all', authenticateToken, async (req, res) => {
  try {
    console.log('🔴 MEDIA_ALL: Fetching all media files for user:', req.user.userId);
    
    // Check if current user is admin
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    const isAdmin = userResult.rows[0]?.is_admin || false;
    
    console.log('🔴 MEDIA_ALL: User is admin:', isAdmin);
    
    let query, params;
    
    if (isAdmin) {
      // Admin can see all files
      query = 'SELECT * FROM media ORDER BY created_at DESC';
      params = [];
      console.log('🔴 MEDIA_ALL: Admin access - returning all media files');
    } else {
      // Regular users can only see their own files
      query = 'SELECT * FROM media WHERE user_id = $1 ORDER BY created_at DESC';
      params = [req.user.userId];
      console.log('🔴 MEDIA_ALL: Regular user access - returning only own media files');
    }
    
    const result = await pool.query(query, params);
    
    console.log('🔴 MEDIA_ALL: Found', result.rows.length, 'media files for user');
    
    res.json({ media: result.rows });
  } catch (error) {
    console.error('Error fetching all media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const media = result.rows[0];
    
    // Check if user owns this media file or if user is admin
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    const isAdmin = userResult.rows[0]?.is_admin || false;
    
    // Allow access if: user owns the file OR user is admin
    if (media.user_id !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own media files' });
    }
    
    // Create a proper HTTP URL for the audio file
    const baseUrl = process.env.API_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
      : 'https://merchtech5-production.up.railway.app';
    
    let properUrl = media.url;
    if (media.url && media.url.startsWith('data:')) {
      // If it's base64 data, serve it through our audio streaming endpoint
      properUrl = `${baseUrl}/api/media/${id}/stream`;
    } else if (media.filename) {
      // If we have a filename, construct the proper URL
      properUrl = `${baseUrl}/uploads/${media.filename}`;
    }
    
    // Return media with the proper URL structure expected by the frontend
    const mediaResponse = {
      ...media,
      url: properUrl,
      title: media.title,
      fileType: media.file_type,
      contentType: media.content_type,
      type: media.file_type // Add type property for MediaPlayer compatibility
    };
    
    res.json({ media: mediaResponse });
  } catch (error) {
    console.error('Error fetching media by ID:', error);
    res.status(500).json({ error: 'Failed to fetch media file' });
  }
});

// Handle OPTIONS preflight requests for media streaming
app.options('/api/media/:id/stream', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '3600');
  res.status(204).end();
});

// Stream media file (supports both base64 data and S3 files) - PUBLIC endpoint for browser media compatibility
app.get('/api/media/:id/stream', async (req, res) => {
  console.log(`📺 MEDIA_STREAM: Route handler called for media ${req.params.id}`);
  
  // 🚀 Set CORS headers directly for this route to ensure video/audio streaming works
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  // Ensure embeddability across origins for ranged responses
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Set Content-Disposition to "inline" to prevent direct downloads
  // This instructs the browser to display the file, not download it
  res.setHeader('Content-Disposition', 'inline');

  try {
    const { id } = req.params;
    console.log(`📺 MEDIA_STREAM: Public streaming request for media ${id}`);
    
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      console.log(`📺 MEDIA_STREAM: Media ${id} not found`);
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const media = result.rows[0];
    
    // Public access is allowed for streaming, so no further auth checks are needed here.
    // The original file was more permissive, and we need to restore that for QR code scans.
    
    // Handle S3 files
    let s3Key = media.s3_key;
    
    // If s3_key is null but we have an S3 URL, extract the key from the URL
    if (!s3Key && media.url && media.url.includes('merchtechbucket.s3.')) {
      const urlMatch = media.url.match(/merchtechbucket\.s3\.[^/]+\/(.+)$/);
      if (urlMatch) {
        s3Key = urlMatch[1];
        console.log(`📺 MEDIA_STREAM: Extracted S3 key from URL for media ${id}: ${s3Key}`);
      }
    }
    
    if (s3Key && s3Service) {
      try {
        console.log(`📺 MEDIA_STREAM: Streaming S3 file for media ${id}: ${s3Key}`);
        
        // Get file metadata from S3
        const metadata = await s3Service.getMetadata(s3Key);
        const fileSize = metadata.ContentLength;
        
        // Enhanced content-type detection for audio files
        let contentType = metadata.ContentType || media.content_type;
        
        // If content type is missing or generic, determine from file extension
        if (!contentType || contentType === 'application/octet-stream') {
          const extension = path.extname(media.title || media.filename || s3Key).toLowerCase();
          console.log(`📺 MEDIA_STREAM: Determining content type from extension: ${extension}`);
          
          switch (extension) {
            case '.mp3':
              contentType = 'audio/mpeg';
              break;
            case '.wav':
              contentType = 'audio/wav';
              break;
            case '.m4a':
              contentType = 'audio/mp4';
              break;
            case '.aac':
              contentType = 'audio/aac';
              break;
            case '.ogg':
              contentType = 'audio/ogg';
              break;
            case '.mp4':
              contentType = 'video/mp4';
              break;
            case '.webm':
              contentType = 'video/webm';
              break;
            case '.avi':
              contentType = 'video/x-msvideo';
              break;
            case '.mov':
              contentType = 'video/quicktime';
              break;
            default:
              contentType = media.file_type === 'audio' ? 'audio/mpeg' : 
                           media.file_type === 'video' ? 'video/mp4' : 
                           'application/octet-stream';
          }
          
          console.log(`📺 MEDIA_STREAM: Content type determined as: ${contentType}`);
        }
        
        console.log(`📺 MEDIA_STREAM: S3 metadata for media ${id}:`, {
          ContentLength: metadata.ContentLength,
          ContentType: metadata.ContentType,
          determinedContentType: contentType,
          s3Key: s3Key,
          mediaType: media.file_type,
          title: media.title,
          filename: media.filename
        });
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        const range = req.headers.range;
        
        if (range) {
          // Handle range requests for video/audio streaming
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          res.setHeader('Content-Length', chunksize);
          res.status(206);
          
          // Stream the range from S3
          const streamResponse = await s3Service.getStream(s3Key, { start, end });
          streamResponse.stream.pipe(res);
          
          console.log(`📺 MEDIA_STREAM: Successfully streaming S3 range for media ${id}`);
        console.log(`📺 MEDIA_STREAM: Range response headers sent:`, res.getHeaders());
        console.log(`📺 MEDIA_STREAM: Range response finished:`, res.finished);
          return; // Important: return after starting the stream
        } else {
          // Stream the entire file
          res.setHeader('Content-Length', fileSize);
          
          const streamResponse = await s3Service.getStream(s3Key);
          streamResponse.stream.pipe(res);
          
          console.log(`📺 MEDIA_STREAM: Successfully streaming S3 file for media ${id}`);
        console.log(`📺 MEDIA_STREAM: Response headers sent:`, res.getHeaders());
        console.log(`📺 MEDIA_STREAM: Response finished:`, res.finished);
          return; // Important: return after starting the stream
        }
      } catch (error) {
        console.error(`❌ MEDIA_STREAM: Failed to stream S3 file ${s3Key}:`, error);
        return res.status(500).json({ error: 'Failed to stream S3 file' });
      }
    }
    
    // Handle base64 data files
    if (media.url && media.url.startsWith('data:')) {
      console.log(`📺 MEDIA_STREAM: Streaming base64 data for media ${id}`);
      
      // Parse the data URL
      const dataUrlMatch = media.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({ error: 'Invalid base64 data format' });
      }
      
      const [, mimeType, base64Data] = dataUrlMatch;
      const audioBuffer = Buffer.from(base64Data, 'base64');
      
      // Set appropriate headers for media streaming
      res.setHeader('Content-Type', mimeType || 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Send the media data
      res.send(audioBuffer);
      return;
    }
    
    // Handle local files (fallback)
    if (media.filename) {
      console.log(`📺 MEDIA_STREAM: Attempting to stream local file for media ${id}: ${media.filename}`);
      const filePath = path.join(__dirname, 'uploads', media.filename);
      
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const contentType = media.content_type || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        return;
      }
    }
    
    // No valid streaming source found
    return res.status(400).json({ error: 'No streamable media source found' });
    
  } catch (error) {
    console.error('❌ MEDIA_STREAM: Error streaming media:', error);
    console.error('❌ MEDIA_STREAM: Error stack:', error.stack);
    console.log(`📺 MEDIA_STREAM: Response finished before error:`, res.finished);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream media file' });
    }
  }
});

app.delete('/api/media/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if media belongs to user or user is admin
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

// ---------- CONTENT DETECTION ROUTE ----------
// Smart endpoint to determine if an ID is a playlist or media file
app.get('/api/content/:id/type', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check both tables efficiently with a single query each
    const [playlistCheck, mediaCheck] = await Promise.all([
      pool.query('SELECT id FROM playlists WHERE id = $1 LIMIT 1', [id]),
      pool.query('SELECT id FROM media WHERE id = $1 LIMIT 1', [id])
    ]);
    
    if (playlistCheck.rows.length > 0) {
      res.json({ 
        type: 'playlist', 
        id: id,
        exists: true 
      });
    } else if (mediaCheck.rows.length > 0) {
      res.json({ 
        type: 'media', 
        id: id,
        exists: true 
      });
    } else {
      res.status(404).json({ 
        type: 'unknown', 
        id: id,
        exists: false,
        error: 'Content not found' 
      });
    }
  } catch (error) {
    console.error('Error determining content type:', error);
    res.status(500).json({ error: 'Failed to determine content type' });
  }
});

// ---------- PLAYLIST ROUTES ----------
app.post('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const { name, description, mediaFileIds, requiresActivationCode, isPublic } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_playlists FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM playlists WHERE user_id = $1', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxPlaylists;
    if (user?.max_playlists !== null && user?.max_playlists !== undefined) {
      // Admin has set a custom limit
      maxPlaylists = user.max_playlists;
      console.log(`📋 Using admin-set custom limit: ${maxPlaylists} playlists for user ${req.user.userId}`);
    } else {
      // Use subscription tier limits
      const limits = {
        free: { maxPlaylists: 10 },
        basic: { maxPlaylists: 25 },
        premium: { maxPlaylists: 50 }
      };
      maxPlaylists = (limits[userTier] || limits.free).maxPlaylists;
      console.log(`📋 Using subscription tier limit: ${maxPlaylists} playlists for ${userTier} plan`);
    }
    
    if (currentCount >= maxPlaylists) {
      console.log(`🚫 Playlist creation blocked: User ${req.user.userId} has ${currentCount}/${maxPlaylists} playlists`);
      return res.status(403).json({ 
        error: `Playlist limit reached. You have reached your limit of ${maxPlaylists} playlists. Please contact support if you need to increase your limit.`,
        limit: maxPlaylists,
        current: currentCount,
        subscriptionTier: userTier,
        isCustomLimit: user?.max_playlists !== null && user?.max_playlists !== undefined
      });
    }

    console.log(`✅ Playlist creation allowed: User ${req.user.userId} has ${currentCount}/${maxPlaylists} playlists`);
    // END SUBSCRIPTION CHECK

    const result = await pool.query(
      `INSERT INTO playlists (user_id, name, description, requires_activation_code, is_public, times_created) 
       VALUES ($1, $2, $3, $4, $5, 1) RETURNING *`,
      [req.user.userId, name, description || null, requiresActivationCode || false, isPublic || false]
    );

    const playlist = result.rows[0];
    console.log('📊 ANALYTICS: Playlist created, times_created incremented');

    // Add media files to playlist if provided
    if (mediaFileIds && mediaFileIds.length > 0) {
      for (let i = 0; i < mediaFileIds.length; i++) {
        await pool.query(
          `INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3)`,
          [playlist.id, mediaFileIds[i], i + 1]
        );
      }
    }

    // Fetch complete playlist with media files
    const completePlaylist = await getPlaylistWithMedia(playlist.id);
    res.status(201).json({ playlist: completePlaylist });
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

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
    console.error('🌐 WEB: Error in playlist-access route:', error);
    console.error('🌐 WEB: Error stack:', error.stack);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Server Error - MerchTech</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f3f4f6; }
          .error { color: #dc2626; font-size: 1.5rem; margin-bottom: 1rem; }
          .message { color: #6b7280; }
        </style>
      </head>
      <body>
        <h1 class="error">🔥 Server Error</h1>
        <p class="message">Something went wrong while loading the playlist.</p>
      </body>
      </html>
    `);
  }
});
app.patch('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, requiresActivationCode, isPublic } = req.body;

    console.log('🔴 PLAYLIST_PATCH: Updating playlist:', id);
    console.log('🔴 PLAYLIST_PATCH: Request body:', { name, description, requiresActivationCode, isPublic });
    console.log('🔴 PLAYLIST_PATCH: User ID:', req.user.userId);

    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );

    console.log('🔴 PLAYLIST_PATCH: Owner check result:', ownerCheck.rows);

    if (ownerCheck.rows.length === 0) {
      console.log('🔴 PLAYLIST_PATCH: Playlist not found');
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      console.log('🔴 PLAYLIST_PATCH: Not authorized - owner:', ownerCheck.rows[0].user_id, 'user:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to update this playlist' });
    }

    console.log('🔴 PLAYLIST_PATCH: About to run UPDATE query...');
    const result = await pool.query(
      `UPDATE playlists 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           requires_activation_code = COALESCE($3, requires_activation_code), 
           is_public = COALESCE($4, is_public)
       WHERE id = $5 RETURNING *`,
      [name, description, requiresActivationCode, isPublic, id]
    );

    console.log('🔴 PLAYLIST_PATCH: UPDATE query successful, result:', result.rows[0]);

    const updatedPlaylist = await getPlaylistWithMedia(id);
    console.log('🔴 PLAYLIST_PATCH: getPlaylistWithMedia result:', updatedPlaylist);
    
    res.json({ playlist: updatedPlaylist });
  } catch (error) {
    console.error('🔴 PLAYLIST_PATCH: Error updating playlist:', error);
    console.error('🔴 PLAYLIST_PATCH: Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

app.delete('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this playlist' });
    }

    // Delete playlist (CASCADE will handle playlist_media)
    await pool.query('DELETE FROM playlists WHERE id = $1', [id]);
    
    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});
// Helper function to get playlist with media files
async function getPlaylistWithMedia(playlistId) {
  console.log('🔴 GET_PLAYLIST: Fetching playlist:', playlistId);
  console.log('🔴 GET_PLAYLIST: playlistId type:', typeof playlistId);

  const playlistResult = await pool.query(
    `SELECT p.*, u.username 
     FROM playlists p 
     JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1`,
    [playlistId]
  );

  console.log('🔴 GET_PLAYLIST: Query result rows:', playlistResult.rows.length);
  if (playlistResult.rows.length > 0) {
    console.log('🔴 GET_PLAYLIST: Found playlist:', playlistResult.rows[0].name);
  }

  if (playlistResult.rows.length === 0) {
    console.log('🔴 GET_PLAYLIST: No playlist found, returning null');
    return null;
  }

  const playlistData = playlistResult.rows[0];
  const mediaResult = await pool.query(
    `SELECT m.*, pm.display_order 
     FROM media m 
     JOIN playlist_media pm ON m.id = pm.media_id 
     WHERE pm.playlist_id = $1 
     ORDER BY pm.display_order`,
    [playlistId]
  );

  console.log('🔴 GET_PLAYLIST: Media query result:', mediaResult.rows.length, 'media files found');
  if (mediaResult.rows.length === 0) {
    console.log('🔴 GET_PLAYLIST: No media files found for playlist', playlistId);
    // Let's check if media files exist but aren't linked
    const allMediaResult = await pool.query('SELECT COUNT(*) FROM media');
    console.log('🔴 GET_PLAYLIST: Total media files in database:', allMediaResult.rows[0].count);
    
    const playlistMediaResult = await pool.query('SELECT COUNT(*) FROM playlist_media WHERE playlist_id = $1', [playlistId]);
    console.log('🔴 GET_PLAYLIST: Playlist-media links for playlist', playlistId, ':', playlistMediaResult.rows[0].count);
  }

  const mediaFiles = await Promise.all(mediaResult.rows.map(async (media) => {
    let properUrl = media.url;
    
    // Use streaming endpoint for CORS-free access (streaming endpoint is now working)
    if (media.s3_key && s3Service) {
      // Use streaming endpoint to avoid CORS issues with direct S3 access
      properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
      console.log(`🔧 CORS_FIX: Using streaming endpoint for media ${media.id}`);
    } else if (media.url && media.url.startsWith('data:')) {
      // Handle base64 files - use streaming endpoint
      properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
    } else if (media.filename && !media.s3_key) {
      // Check if local file exists, if not use streaming endpoint for better error handling
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, 'uploads', media.filename);
      
      if (fs.existsSync(filePath)) {
        // File exists locally, use direct file URL
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/uploads/${media.filename}`;
      } else {
        // File doesn't exist locally, use streaming endpoint for better error handling
        console.warn(`Media file with ID ${media.id} has no s3_key and local file doesn't exist. Using streaming endpoint for error handling.`);
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
      }
    } else {
      console.warn(`Media file with ID ${media.id} is missing an s3_key and has no filename. Using streaming endpoint for error handling.`);
      properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
    }

    return {
    id: media.id,
    userId: media.user_id,
    title: media.title,
    description: media.description,
    filename: media.filename,
    filePath: `/uploads/${media.filename}`,
    fileType: media.file_type,
    contentType: media.content_type,
    displayOrder: media.display_order,
    createdAt: media.created_at,
    updatedAt: media.updated_at,
    type: media.file_type,
    s3_key: media.s3_key, // Include s3_key for frontend debugging
      url: properUrl, // Use direct S3 signed URLs for better compatibility
    };
  }));

  // Get product links for this playlist
  let productLinks = [];
  try {
    const productLinksResult = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.playlist_id = $1 AND pl.is_active = true
      ORDER BY pl.display_order, pl.created_at
    `, [playlistId]);

    // Format product links for frontend
    productLinks = productLinksResult.rows.map(link => {
      // Fix price formatting - if price is abnormally high (> 10000 cents = $100), it might be stored incorrectly
      let formattedPrice = null;
      if (link.price) {
        let priceInCents = link.price;
        // If price is greater than $100 (10000 cents), it might be stored as dollars*100 instead of cents
        // This is a temporary fix for the "hi" product that has price 53000 instead of 530
        if (priceInCents > 10000) {
          priceInCents = priceInCents / 100; // Convert back to proper cents
        }
        formattedPrice = `$${(priceInCents / 100).toFixed(2)}`;
      }
      
      return {
        id: link.product_id.toString(), // Use product_id, not link.id
        linkId: link.id.toString(), // Keep link ID for reference
        title: link.title,
        url: link.url,
        description: link.description,
        imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
        images: link.product_images || (link.image_url ? [link.image_url] : []),
        displayOrder: link.display_order,
        isActive: link.is_active,
        price: formattedPrice,
        productName: link.product_name
      };
    });

    console.log('🔴 GET_PLAYLIST: Found', productLinks.length, 'product links');
  } catch (error) {
    console.error('🔴 GET_PLAYLIST: Error fetching product links:', error);
    productLinks = [];
  }

  const finalPlaylist = {
    id: playlistData.id,
    userId: playlistData.user_id,
    name: playlistData.name,
    description: playlistData.description,
    username: playlistData.username,
    requiresActivationCode: playlistData.requires_activation_code,
    isPublic: playlistData.is_public,
    createdAt: playlistData.created_at,
    updatedAt: playlistData.updated_at,
    mediaFiles: mediaFiles,
    productLinks: productLinks,
  };
  
  return finalPlaylist;
}

// ---------- STRIPE UTILITY ROUTES ----------
app.get('/api/stripe/health', (req, res) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  return res.json({
    stripeConfigured: !!secretKey,
    secretKeyType: secretKey?.startsWith('sk_live') ? 'live' : 'test',
    secretKeyValid: !!secretKey,
  });
});

// Sales summary for current user
// Uses normalized orders/order_items tables; supports optional ?days= filter
app.get('/api/analytics/sales-summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    // Aggregate totals from normalized orders/order_items tables
    const totals = await pool.query(
      `WITH filtered_orders AS (
         SELECT * FROM orders
         WHERE user_id = $1 AND purchased_at >= NOW() - ($2 || ' days')::interval
       )
       SELECT 
         COALESCE(SUM(o.total_amount), 0) AS total_revenue,
         COUNT(o.id) AS orders,
         COALESCE(SUM(oi.quantity), 0) AS items_count
       FROM filtered_orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
      `,
      [userId, days]
    );

    const topProducts = await pool.query(
      `SELECT oi.product_name AS product,
              SUM(oi.quantity) AS qty,
              SUM(oi.amount) AS revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.user_id = $1 AND o.purchased_at >= NOW() - ($2 || ' days')::interval
       GROUP BY oi.product_name
       ORDER BY revenue DESC NULLS LAST, qty DESC
       LIMIT 10`,
      [userId, days]
    );

    const recent = await pool.query(
      `SELECT stripe_session_id, total_amount, purchased_at
         FROM orders
        WHERE user_id = $1 AND purchased_at >= NOW() - ($2 || ' days')::interval
        ORDER BY purchased_at DESC
        LIMIT 10`,
      [userId, days]
    );

    res.json({
      totalRevenue: parseInt(totals.rows[0]?.total_revenue || 0),
      orders: parseInt(totals.rows[0]?.orders || 0),
      items: parseInt(totals.rows[0]?.items_count || 0),
      topProducts: topProducts.rows.map(r => ({
        product: r.product || 'Unknown',
        quantity: parseInt(r.qty || 0),
        revenue: parseInt(r.revenue || 0),
      })),
      recent: recent.rows,
      windowDays: days,
    });
  } catch (e) {
    console.error('📊 SALES SUMMARY error:', e);
    res.status(500).json({ totalRevenue: 0, orders: 0, items: 0, topProducts: [], recent: [], windowDays: 30 });
  }
});

// Admin: recent scans debug
app.get('/api/analytics/debug/recent-scans', authenticateToken, isAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rows = await pool.query(
      `SELECT id, qr_code_id, scanned_at, country_code, region, city, device_type, browser_name, operating_system
         FROM qr_scans ORDER BY scanned_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ scans: rows.rows });
  } catch (e) {
    console.error('📊 DEBUG recent-scans error:', e);
    res.status(500).json({ scans: [] });
  }
});

app.post('/api/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { amount, subscriptionTier } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount required' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: { subscriptionTier, userId: req.user.userId },
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret, customerId: paymentIntent.customer });
  } catch (err) {
    console.error('PaymentIntent error', err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Stripe create checkout session (subscription endpoint)
app.post('/api/stripe/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { tier, newUser, subscriptionTier, amount } = req.body;
    
    // Handle both old and new parameter formats
    const selectedTier = tier || subscriptionTier;
    if (!selectedTier) {
      return res.status(400).json({ error: 'Tier is required' });
    }

    // Get user info
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    // Define subscription tiers with pricing
    const tiers = {
      basic: { price: amount || 999, name: 'Basic Plan' },
      pro: { price: amount || 1999, name: 'Pro Plan' },
      premium: { price: amount || 4999, name: 'Premium Plan' },
      enterprise: { price: amount || 4999, name: 'Enterprise Plan' }
    };

    const tierInfo = tiers[selectedTier];
    if (!tierInfo) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: tierInfo.name,
            description: `Subscription to ${tierInfo.name}`,
          },
          unit_amount: tierInfo.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription`,
      customer_email: user.email,
      metadata: {
        userId: user.id.toString(),
        tier: selectedTier,
        newUser: newUser || 'false',
      },
    });

    console.log('✅ SUBSCRIPTION CHECKOUT: Session created successfully. Session ID:', session.id);
    res.json({ url: session.url, sessionId: session.id, success: true });
  } catch (error) {
    console.error('🔴 SUBSCRIPTION CHECKOUT ERROR:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---------- CHECKOUT ROUTE ----------
app.post('/api/checkout/session', authenticateTokenOptional, async (req, res) => {
  try {
    const { items, successUrl, cancelUrl } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Fetch products from DB to build line items
    const ids = items.map((it) => it.productId);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(`SELECT * FROM products WHERE id IN (${placeholders})`, ids);

    const productsMap = new Map();
    rows.forEach((p) => productsMap.set(String(p.id), p));

    const line_items = [];

    for (const it of items) {
      const prod = productsMap.get(String(it.productId));
      if (!prod) continue;
      
      // Check if product is in stock
      if (!prod.in_stock) {
        console.log(`🚫 Product ${prod.name} is out of stock, skipping from checkout`);
        continue;
      }

      let unitAmount = 0;
      if (prod.prices && Array.isArray(prod.prices) && prod.prices.length) {
        unitAmount = prod.prices[0].unit_amount;
      } else if (prod.price) {
        unitAmount = prod.price; // fallback to legacy column
      } else if (prod.metadata && (prod.metadata.unit_amount || prod.metadata.price)) {
        unitAmount = Number(prod.metadata.unit_amount || prod.metadata.price);
      }
      if (unitAmount <= 0) continue;

      // Handle product images
      let productImages = [];
      if (prod.images && prod.images.length > 0) {
        const firstImage = prod.images[0];
        if (firstImage) {
          productImages = [firstImage];
        }
      }

      const lineItem = {
        price_data: {
          currency: 'usd',
          product_data: {
            name: prod.name,
            description: prod.description || 'No description available.',
            images: productImages,
          },
          unit_amount: unitAmount,
        },
        quantity: it.quantity,
      };
      
      line_items.push(lineItem);
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'All items are out of stock or have invalid prices' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: successUrl || `${process.env.FRONTEND_URL}/store/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/store/checkout-cancel`,
      metadata: {
        userId: req.user?.userId ? String(req.user.userId) : 'guest',
      }
    });

    console.log('✅ CHECKOUT: Stripe session created successfully. Session ID:', session.id);
    res.json({ sessionId: session.id, success: true, url: session.url });

  } catch (error) {
    console.error('🔴 CHECKOUT ERROR:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---------- STRIPE WEBHOOK HANDLER ----------
// Note: This endpoint needs raw body, so it should be placed before JSON middleware
// or use express.raw() specifically for this route
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('⚠️ STRIPE_WEBHOOK: STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('✅ STRIPE_WEBHOOK: Signature verified for event:', event.type);
  } catch (err) {
    console.error('⚠️ STRIPE_WEBHOOK: Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('💳 STRIPE_WEBHOOK: Checkout completed for session:', session.id);

        // Extract user ID from metadata
        const userId = session.metadata?.userId !== 'guest' ? parseInt(session.metadata?.userId) : null;
        
        // Get line items from the session
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
        
        // Format items for storage
        const items = lineItems.data.map(item => ({
          productName: item.description,
          quantity: item.quantity,
          amount: item.amount_total,
        }));

        // Track the purchase in both normalized tables and events (idempotent)
        try {
          const existing = await pool.query(
            'SELECT id FROM orders WHERE stripe_session_id = $1',
            [session.id]
          );

          let orderId;
          if (existing.rows.length === 0) {
            const inserted = await pool.query(
              `INSERT INTO orders (user_id, stripe_session_id, total_amount, currency, customer_email)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (stripe_session_id) DO UPDATE SET total_amount = EXCLUDED.total_amount
               RETURNING id`,
              [userId, session.id, session.amount_total || 0, session.currency || 'usd', session.customer_details?.email || null]
            );
            orderId = inserted.rows[0].id;
          } else {
            orderId = existing.rows[0].id;
          }

          // Upsert order items
          for (const it of items) {
            await pool.query(
              `INSERT INTO order_items (order_id, product_name, quantity, amount)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT ON CONSTRAINT uq_order_item_dedupe DO NOTHING`,
              [orderId, it.productName, it.quantity || 1, it.amount || 0]
            );
          }

          // Mirror into purchase_events for backward compatibility
          await pool.query(
            `INSERT INTO purchase_events (stripe_session_id, user_id, total_amount, items) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (stripe_session_id) DO NOTHING`,
            [session.id, userId, session.amount_total, JSON.stringify(items)]
          );
          console.log('💳 STRIPE_WEBHOOK: Order recorded and events mirrored');

          // Notify merchant via email (best-effort)
          try {
            const merchant = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
            const to = merchant.rows[0]?.email;
            if (to) {
              const totalUsd = ((session.amount_total || 0) / 100).toFixed(2);
              await transporter.sendMail({
                from: 'help@merchtrader.org',
                to,
                subject: `New order $${totalUsd}`,
                html: `<p>You received a new order for <strong>$${totalUsd}</strong>.</p>
                       <p>Items:</p>
                       <ul>${items.map(i => `<li>${i.quantity}× ${i.productName} — $${(i.amount/100).toFixed(2)}</li>`).join('')}</ul>
                       <p>Session: ${session.id}</p>`
              });
            }
          } catch (mailErr) {
            console.warn('📧 Order email failed:', mailErr?.message || mailErr);
          }
        } catch (err) {
          console.error('💳 STRIPE_WEBHOOK: Failed to record order/items:', err);
        }

        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log('💳 STRIPE_WEBHOOK: Payment succeeded:', paymentIntent.id);
        // Additional handling if needed
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        console.log('❌ STRIPE_WEBHOOK: Payment failed:', paymentIntent.id);
        // Additional handling if needed
        break;
      }

      default:
        console.log(`🔔 STRIPE_WEBHOOK: Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ STRIPE_WEBHOOK: Error processing event:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ---------- QR CODES API ----------

// Get all QR codes for the logged-in user
app.get('/api/qrcodes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: Fetching QR codes for user:', req.user.userId);
    
    // First try with scan count (deduplicated to match analytics), fall back to simple query if qr_scans table doesn't exist
    let result;
    try {
      // Use deduplication to match analytics approach (unique visitor per minute)
      // This ensures consistency between QR code list and analytics dashboard
      result = await pool.query(
        `WITH dedup_scans AS (
          SELECT DISTINCT ON (
            s.qr_code_id,
            COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
            date_trunc('minute', s.scanned_at)
          ) s.qr_code_id
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
          ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
        )
        SELECT qr.*, COALESCE(COUNT(ds.qr_code_id), 0) as scan_count
         FROM qr_codes qr
         LEFT JOIN dedup_scans ds ON qr.id = ds.qr_code_id
         WHERE qr.user_id = $1 AND qr.is_active = true
         GROUP BY qr.id
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    } catch (scanError) {
      console.log('📱 QR_CODES: qr_scans table not available, using simple query');
      result = await pool.query(
        `SELECT qr.*, 0 as scan_count
         FROM qr_codes qr
         WHERE qr.user_id = $1 AND qr.is_active = true
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    }
    
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

// Get all QR codes for the current user
app.get('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: Fetching QR codes for user:', req.user.userId);
    
    // First try with scan count (deduplicated to match analytics), fall back to simple query if qr_scans table doesn't exist
    let result;
    try {
      // Use deduplication to match analytics approach (unique visitor per minute)
      // This ensures consistency between QR code list and analytics dashboard
      result = await pool.query(
        `WITH dedup_scans AS (
          SELECT DISTINCT ON (
            s.qr_code_id,
            COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
            date_trunc('minute', s.scanned_at)
          ) s.qr_code_id
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
          ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
        )
        SELECT qr.*, COALESCE(COUNT(ds.qr_code_id), 0) as scan_count
         FROM qr_codes qr
         LEFT JOIN dedup_scans ds ON qr.id = ds.qr_code_id
         WHERE qr.user_id = $1 AND qr.is_active = true
         GROUP BY qr.id
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    } catch (scanError) {
      console.log('📱 QR_CODES: qr_scans table not available, using simple query');
      result = await pool.query(
        `SELECT qr.*, 0 as scan_count
         FROM qr_codes qr
         WHERE qr.user_id = $1 AND qr.is_active = true
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    }
    
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

// Get a specific QR code by ID (alias for backward compatibility)
app.get('/api/qrcodes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📱 QR_CODES: Fetching QR code:', id);
    
    // Use deduplication to match analytics approach (unique visitor per minute)
    const result = await pool.query(
      `WITH dedup_scans AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.qr_code_id
        FROM qr_scans s
        WHERE s.qr_code_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT qr.*, COALESCE(COUNT(ds.qr_code_id), 0) as scan_count
       FROM qr_codes qr
       LEFT JOIN dedup_scans ds ON qr.id = ds.qr_code_id
       WHERE qr.id = $1 AND qr.user_id = $2
       GROUP BY qr.id`,
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options,
      scanCount: parseInt(result.rows[0].scan_count) || 0
    };
    
    console.log('📱 QR_CODES: QR code found:', qrCode.name);
    res.json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error fetching QR code:', error);
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

// Get a specific QR code by ID
app.get('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📱 QR_CODES: Fetching QR code:', id);
    
    // Use deduplication to match analytics approach (unique visitor per minute)
    const result = await pool.query(
      `WITH dedup_scans AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.qr_code_id
        FROM qr_scans s
        WHERE s.qr_code_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT qr.*, COALESCE(COUNT(ds.qr_code_id), 0) as scan_count
       FROM qr_codes qr
       LEFT JOIN dedup_scans ds ON qr.id = ds.qr_code_id
       WHERE qr.id = $1 AND qr.user_id = $2
       GROUP BY qr.id`,
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options,
      scanCount: parseInt(result.rows[0].scan_count) || 0
    };
    
    console.log('📱 QR_CODES: QR code found:', qrCode.name);
    res.json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error fetching QR code:', error);
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

// Lightweight public redirect that records a scan, then 302s to target URL
// Supports numeric id, qr_code_data, or short_url as the path param
app.get(['/r/:code', '/qr/:code'], async (req, res) => {
  const { code } = req.params;
  try {
    // Try to resolve QR code by id (numeric), then by qr_code_data, then by short_url
    let qr;
    if (/^\d+$/.test(code)) {
      const r = await pool.query('SELECT id, url FROM qr_codes WHERE id = $1 AND is_active = true', [Number(code)]);
      qr = r.rows[0];
    }
    if (!qr) {
      const r2 = await pool.query('SELECT id, url FROM qr_codes WHERE qr_code_data = $1 AND is_active = true', [code]);
      qr = r2.rows[0];
    }
    if (!qr) {
      const r3 = await pool.query('SELECT id, url FROM qr_codes WHERE short_url = $1 AND is_active = true', [code]);
      qr = r3.rows[0];
    }
    if (!qr) {
      return res.status(404).send('QR not found');
    }

    // Redirect to target
    const target = qr.url;
    if (!target) return res.status(500).send('Target URL missing');
    
    // NOTE: Scan tracking is handled by the destination page (playlist-access/slideshow-access)
    // to avoid duplicate tracking. Only track here for external URLs that don't have their own tracking.
    // For playlist/slideshow URLs, the player screen will handle tracking.
    const isPlaylistOrSlideshowUrl = target.includes('/playlist-access/') || target.includes('/slideshow-access/');
    
    if (!isPlaylistOrSlideshowUrl) {
      // Only track for external URLs or other destinations
      try {
        const ip = getClientIp(req);
        const result = await writeScan(pool, qr.id, req, res);
        // Only insert fallback if writeScan completely failed (threw error or returned falsy)
        // Don't insert fallback if scan was deduplicated (result.deduped = true)
        if (!result?.inserted && !result?.deduped) {
          // As a last resort record a minimal row with ip only
          const ua = req.headers['user-agent'] || '';
          const parsed = parseUserAgent(ua);
          await pool.query(
            `INSERT INTO qr_scans (qr_code_id, scanned_at, location, device, country_name, country_code, device_type, browser_name, operating_system, ip_address)
             VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9)`,
            [qr.id, null, null, null, null, null, parsed.deviceType, parsed.browserName, parsed.operatingSystem, ip]
          );
        }
      } catch (trackErr) {
        console.warn('📊 REDIRECT TRACK FAILED:', trackErr?.message || trackErr);
      }
    } else {
      console.log('📊 REDIRECT: Skipping scan tracking - will be handled by destination page');
    }
    
    return res.redirect(302, target);
  } catch (error) {
    console.error('🔴 QR REDIRECT ERROR:', error);
    return res.status(500).send('Redirect failed');
  }
});

// Create a new QR code (alias for backward compatibility)
app.post('/api/qrcodes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: ============ CREATE QR CODE DEBUG START ============');
    console.log('📱 QR_CODES: Request body:', JSON.stringify(req.body, null, 2));
    console.log('📱 QR_CODES: Authenticated user:', req.user);
    
    const { name, url, description, contentType, options, playlist_id, slideshow_id } = req.body;
    
    if (!name || !url) {
      console.log('📱 QR_CODES: Validation failed - missing name or url:', { name, url });
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    console.log('📱 QR_CODES: Creating QR code:', { name, url, contentType });
    
    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_qr_codes FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM qr_codes WHERE user_id = $1 AND is_active = true', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxQRCodes;
    if (user?.max_qr_codes !== null && user?.max_qr_codes !== undefined) {
      maxQRCodes = user.max_qr_codes;
    } else {
      const limits = {
        free: { maxQRCodes: 10 },
        basic: { maxQRCodes: 50 },
        premium: { maxQRCodes: 100 }
      };
      maxQRCodes = (limits[userTier] || limits.free).maxQRCodes;
    }
    
    if (currentCount >= maxQRCodes) {
      return res.status(403).json({ 
        error: `QR code limit reached. You have reached your limit of ${maxQRCodes} QR codes.`,
        limit: maxQRCodes,
        current: currentCount,
        subscriptionTier: userTier
      });
    }

    // Generate QR code data (simplified - in production you might want to use a proper QR library)
    const qrCodeData = `qr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await pool.query(
      `INSERT INTO qr_codes (user_id, name, url, qr_code_data, options, description, short_url, playlist_id, slideshow_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.user.userId,
        name,
        url,
        qrCodeData,
        JSON.stringify(options || {}),
        description,
        null,
        playlist_id || null,
        slideshow_id || null,
      ]
    );
    
    // Build redirect short URL
    const publicOrigin = process.env.PUBLIC_WEB_ORIGIN || process.env.FRONTEND_URL || 'https://www.merchtrader.org';
    const shortUrl = `${publicOrigin.replace(/\/$/, '')}/r/${result.rows[0].id}`;

    // Persist short_url for convenience
    await pool.query('UPDATE qr_codes SET short_url = $1, updated_at = NOW() WHERE id = $2', [shortUrl, result.rows[0].id]);

    const qrCode = {
      ...result.rows[0],
      short_url: shortUrl,
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options,
      scanCount: 0
    };
    
    console.log('📱 QR_CODES: QR code created successfully:', qrCode.name);
    res.status(201).json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error creating QR code:', error);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});

// Create a new QR code
app.post('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: ============ CREATE QR CODE DEBUG START ============');
    console.log('📱 QR_CODES: Request body:', JSON.stringify(req.body, null, 2));
    console.log('📱 QR_CODES: Authenticated user:', req.user);
    
    const { name, url, description, contentType, options } = req.body;
    
    if (!name || !url) {
      console.log('📱 QR_CODES: Validation failed - missing name or url:', { name, url });
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    console.log('📱 QR_CODES: Creating QR code:', { name, url, contentType });
    
    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_qr_codes FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM qr_codes WHERE user_id = $1 AND is_active = true', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxQRCodes;
    if (user?.max_qr_codes !== null && user?.max_qr_codes !== undefined) {
      maxQRCodes = user.max_qr_codes;
    } else {
      const limits = {
        free: { maxQRCodes: 10 },
        basic: { maxQRCodes: 50 },
        premium: { maxQRCodes: 100 }
      };
      maxQRCodes = (limits[userTier] || limits.free).maxQRCodes;
    }
    
    if (currentCount >= maxQRCodes) {
      return res.status(403).json({ 
        error: `QR code limit reached. You have reached your limit of ${maxQRCodes} QR codes.`,
        limit: maxQRCodes,
        current: currentCount,
        subscriptionTier: userTier
      });
    }

    // Generate QR code data (simplified - in production you might want to use a proper QR library)
    const qrCodeData = `qr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await pool.query(
      `INSERT INTO qr_codes (user_id, name, url, qr_code_data, options, description) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.userId, name, url, qrCodeData, JSON.stringify(options || {}), description]
    );
    
    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options,
      scanCount: 0
    };
    
    console.log('📱 QR_CODES: QR code created successfully:', qrCode.name);
    res.status(201).json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error creating QR code:', error);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});
// Update a QR code (alias for backward compatibility)
app.patch('/api/qrcodes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, options } = req.body;
    
    console.log('📱 QR_CODES: Updating QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT user_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this QR code' });
    }

    const result = await pool.query(
      `UPDATE qr_codes 
       SET name = COALESCE($1, name), 
           url = COALESCE($2, url), 
           description = COALESCE($3, description), 
           options = COALESCE($4, options),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, url, description, options ? JSON.stringify(options) : null, id]
    );

    // Rebuild short_url when URL changes (id and origin stable)
    const publicOrigin = process.env.PUBLIC_WEB_ORIGIN || process.env.FRONTEND_URL || 'https://www.merchtrader.org';
    const shortUrl = `${publicOrigin.replace(/\/$/, '')}/r/${result.rows[0].id}`;
    await pool.query('UPDATE qr_codes SET short_url = $1, updated_at = NOW() WHERE id = $2', [shortUrl, result.rows[0].id]);

    const qrCode = {
      ...result.rows[0],
      short_url: shortUrl,
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options
    };
    
    console.log('📱 QR_CODES: QR code updated successfully:', qrCode.name);
    res.json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error updating QR code:', error);
    res.status(500).json({ error: 'Failed to update QR code' });
  }
});

// Update a QR code
app.patch('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, options } = req.body;
    
    console.log('📱 QR_CODES: Updating QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT user_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this QR code' });
    }

    const result = await pool.query(
      `UPDATE qr_codes 
       SET name = COALESCE($1, name), 
           url = COALESCE($2, url), 
           description = COALESCE($3, description), 
           options = COALESCE($4, options),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, url, description, options ? JSON.stringify(options) : null, id]
    );

    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options
    };
    
    console.log('📱 QR_CODES: QR code updated successfully:', qrCode.name);
    res.json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error updating QR code:', error);
    res.status(500).json({ error: 'Failed to update QR code' });
  }
});
// Delete a QR code (soft delete)
app.delete('/api/qrcodes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📱 QR_CODES: Deleting QR code:', id, 'for user:', req.user.userId);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT user_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    console.log('📱 QR_CODES: Owner check result:', ownerCheck.rows);

    if (ownerCheck.rows.length === 0) {
      console.log('📱 QR_CODES: QR code not found or inactive');
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      console.log('📱 QR_CODES: Ownership mismatch. Owner:', ownerCheck.rows[0].user_id, 'User:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to delete this QR code' });
    }

    // Soft delete by setting is_active to false
    const deleteResult = await pool.query(
      'UPDATE qr_codes SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    
    console.log('📱 QR_CODES: QR code deleted successfully:', deleteResult.rows[0]);
    res.json({ message: 'QR code deleted successfully', qrCode: deleteResult.rows[0] });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error deleting QR code:', error);
    res.status(500).json({ error: 'Failed to delete QR code' });
  }
});

// Alias endpoint for consistency
app.delete('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  // Redirect to the main endpoint
  req.url = req.url.replace('/api/qr-codes/', '/api/qrcodes/');
  return app._router.handle(req, res);
});

// ---------- ACTIVATION CODES API ----------

// Generate new activation code
app.post('/api/activation-codes', authenticateToken, async (req, res) => {
  try {
    const { playlistId, slideshowId, maxUses, expiresAt } = req.body;
    
    // Validate that exactly one content type is specified
    if ((playlistId && slideshowId) || (!playlistId && !slideshowId)) {
      return res.status(400).json({ error: 'Must specify either playlistId or slideshowId, not both' });
    }
    
    // Generate unique code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase() + 
                 Math.random().toString(36).substring(2, 8).toUpperCase();
    
    console.log('🔑 ACTIVATION_CODES: Creating new code:', { code, playlistId, slideshowId, maxUses, expiresAt });
    
    const result = await pool.query(
      `INSERT INTO activation_codes (code, playlist_id, slideshow_id, created_by, max_uses, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [code, playlistId || null, slideshowId || null, req.user.userId, maxUses || null, expiresAt || null]
    );
    
    // Get the created activation code with associated content name
    const codeWithDetails = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name,
              CASE 
                WHEN ac.playlist_id IS NOT NULL THEN 'playlist'
                WHEN ac.slideshow_id IS NOT NULL THEN 'slideshow'
                ELSE 'unknown'
              END as content_type
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.id = $1`,
      [result.rows[0].id]
    );
    
    console.log('🔑 ACTIVATION_CODES: Code created successfully with details:', codeWithDetails.rows[0]);
    res.status(201).json({ activationCode: codeWithDetails.rows[0] });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error creating code:', error);
    res.status(500).json({ error: 'Failed to create activation code' });
  }
});

// Get all activation codes for the user (simple GET endpoint)
app.get('/api/activation-codes', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching all activation codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name,
              CASE 
                WHEN ac.playlist_id IS NOT NULL THEN 'playlist'
                WHEN ac.slideshow_id IS NOT NULL THEN 'slideshow'
                ELSE 'unknown'
              END as content_type
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.created_by = $1
       ORDER BY ac.created_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'activation codes');
    res.json({ activationCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching codes:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
  }
});

// Get all codes generated by user (ALL GENERATED CODES tab)
app.get('/api/activation-codes/generated', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching all generated codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name,
              CASE 
                WHEN ac.playlist_id IS NOT NULL THEN 'playlist'
                WHEN ac.slideshow_id IS NOT NULL THEN 'slideshow'
                ELSE 'unknown'
              END as content_type
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

// Get codes attached to user's profile (MY ACCESS CODES tab)
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

// Attach activation code to user's profile
app.post('/api/activation-codes/attach', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Activation code is required' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Attaching code to user:', { code, userId: req.user.userId });
    
    // First, verify the code exists and is valid
    const codeResult = await pool.query(
      `SELECT * FROM activation_codes 
       WHERE code = $1 AND is_active = true 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR uses_count < max_uses)`,
      [code]
    );
    
    if (codeResult.rows.length === 0) {
      console.log('🔑 ACTIVATION_CODES: Invalid or expired code:', code);
      return res.status(400).json({ error: 'Invalid or expired activation code' });
    }
    
    const activationCode = codeResult.rows[0];
    
    // Check if already attached
    const existingResult = await pool.query(
      `SELECT * FROM user_activation_codes 
       WHERE user_id = $1 AND activation_code_id = $2`,
      [req.user.userId, activationCode.id]
    );
    
    if (existingResult.rows.length > 0) {
      console.log('🔑 ACTIVATION_CODES: Code already attached to user');
      return res.status(400).json({ error: 'Code already attached to your profile' });
    }
    
    // Attach the code
    await pool.query(
      `INSERT INTO user_activation_codes (user_id, activation_code_id) 
       VALUES ($1, $2)`,
      [req.user.userId, activationCode.id]
    );
    
    // Increment usage count
    await pool.query(
      `UPDATE activation_codes SET uses_count = uses_count + 1 WHERE id = $1`,
      [activationCode.id]
    );
    
    console.log('🔑 ACTIVATION_CODES: Code attached successfully');
    res.json({ message: 'Activation code attached successfully', activationCode });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error attaching code:', error);
    res.status(500).json({ error: 'Failed to attach activation code' });
  }
});

// Detach activation code from user's profile (removes access)
app.delete('/api/activation-codes/detach/:codeId', authenticateToken, async (req, res) => {
  try {
    const { codeId } = req.params;
    
    console.log('🔑 ACTIVATION_CODES: Detaching code from user:', { codeId, userId: req.user.userId });
    
    const result = await pool.query(
      `DELETE FROM user_activation_codes 
       WHERE user_id = $1 AND activation_code_id = $2 
       RETURNING *`,
      [req.user.userId, codeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code not found or not attached to your profile' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Code detached successfully');
    res.json({ message: 'Access code removed from your profile' });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error detaching code:', error);
    res.status(500).json({ error: 'Failed to detach activation code' });
  }
});

// Validate activation code for playlist/slideshow access
app.post('/api/activation-codes/validate', async (req, res) => {
  try {
    const { code, playlistId, slideshowId } = req.body;
    
    if (!code || (!playlistId && !slideshowId)) {
      return res.status(400).json({ error: 'Code and content ID required' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Validating code:', { code, playlistId, slideshowId });
    
    const result = await pool.query(
      `SELECT * FROM activation_codes 
       WHERE code = $1 AND is_active = true 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR uses_count < max_uses)
       AND (playlist_id = $2 OR slideshow_id = $3)`,
      [code, playlistId || null, slideshowId || null]
    );
    
    if (result.rows.length === 0) {
      console.log('🔑 ACTIVATION_CODES: Invalid code for content');
      return res.status(400).json({ error: 'Invalid activation code for this content' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Code validated successfully');
    res.json({ valid: true, message: 'Activation code is valid' });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error validating code:', error);
    res.status(500).json({ error: 'Failed to validate activation code' });
  }
});

// Get codes for specific playlist/slideshow (for content creators)
app.get('/api/activation-codes/content/:contentType/:contentId', authenticateToken, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    
    if (contentType !== 'playlist' && contentType !== 'slideshow') {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Fetching codes for content:', { contentType, contentId });
    
    const column = contentType === 'playlist' ? 'playlist_id' : 'slideshow_id';
    const result = await pool.query(
      `SELECT ac.* FROM activation_codes ac
       WHERE ac.${column} = $1 AND ac.created_by = $2
       ORDER BY ac.created_at DESC`,
      [contentId, req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'codes for content');
    res.json({ activationCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching content codes:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
  }
});

// Update activation code (change expiration date, usage limits, or active status)
app.patch('/api/activation-codes/:codeId', authenticateToken, async (req, res) => {
  try {
    const { codeId } = req.params;
    const { maxUses, expiresAt, isActive } = req.body;
    
    console.log('🔑 ACTIVATION_CODES: Updating code:', { codeId, maxUses, expiresAt, isActive });
    
    // First verify the user owns this code
    const ownerResult = await pool.query(
      `SELECT * FROM activation_codes WHERE id = $1 AND created_by = $2`,
      [codeId, req.user.userId]
    );
    
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activation code not found or you do not have permission to edit it' });
    }
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (maxUses !== undefined) {
      updates.push(`max_uses = $${paramCount}`);
      values.push(maxUses === '' || maxUses === null ? null : parseInt(maxUses));
      paramCount++;
    }
    
    if (expiresAt !== undefined) {
      updates.push(`expires_at = $${paramCount}`);
      values.push(expiresAt === '' || expiresAt === null ? null : expiresAt);
      paramCount++;
    }
    
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount}`);
      values.push(isActive);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(codeId);
    
    const updateQuery = `
      UPDATE activation_codes 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;
    
    console.log('🔑 ACTIVATION_CODES: Update query:', updateQuery);
    console.log('🔑 ACTIVATION_CODES: Update values:', values);
    
    const result = await pool.query(updateQuery, values);
    
    console.log('🔑 ACTIVATION_CODES: Code updated successfully:', result.rows[0]);
    res.json({ activationCode: result.rows[0] });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error updating code:', error);
    res.status(500).json({ error: 'Failed to update activation code' });
  }
});

// Delete activation code
app.delete('/api/activation-codes/:codeId', authenticateToken, async (req, res) => {
  try {
    const { codeId } = req.params;
    
    console.log('🔑 ACTIVATION_CODES: Deleting code:', codeId);
    
    // First verify the user owns this code
    const result = await pool.query(
      `DELETE FROM activation_codes 
       WHERE id = $1 AND created_by = $2 
       RETURNING *`,
      [codeId, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activation code not found or you do not have permission to delete it' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Code deleted successfully');
    res.json({ message: 'Activation code deleted successfully' });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error deleting code:', error);
    res.status(500).json({ error: 'Failed to delete activation code' });
  }
});

// Debug endpoint to check activation code linkage (admin only)
app.get('/api/debug/activation-code/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    
    console.log('🔍 DEBUG: Checking activation code:', code);
    
    // Get activation code details
    const codeResult = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name,
              s.id as slideshow_id_check,
              (SELECT COUNT(*) FROM slideshow_images WHERE slideshow_id = s.id) as image_count
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.code = $1`,
      [code]
    );
    
    if (codeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activation code not found' });
    }
    
    const codeData = codeResult.rows[0];
    
    // If it's linked to a slideshow, get more details
    let slideshowDetails = null;
    if (codeData.slideshow_id) {
      const slideshowResult = await pool.query(
        `SELECT s.*, 
                (SELECT COUNT(*) FROM slideshow_images WHERE slideshow_id = s.id) as image_count,
                (SELECT array_agg(si.image_url) FROM slideshow_images si WHERE si.slideshow_id = s.id LIMIT 3) as sample_images
         FROM slideshows s 
         WHERE s.id = $1`,
        [codeData.slideshow_id]
      );
      
      if (slideshowResult.rows.length > 0) {
        slideshowDetails = slideshowResult.rows[0];
      }
    }
    
    // Also search for DJKINGCAKE CHAIN slideshow
    const djkingcakeResult = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM slideshow_images WHERE slideshow_id = s.id) as image_count
       FROM slideshows s 
       WHERE s.name ILIKE '%DJKINGCAKE CHAIN%'`
    );
    
    const debugInfo = {
      activationCode: codeData,
      currentSlideshow: slideshowDetails,
      djkingcakeSlideshow: djkingcakeResult.rows[0] || null,
      issue: codeData.slideshow_name && codeData.image_count === 0 ? 'Linked slideshow has no images' : null,
      recommendation: djkingcakeResult.rows[0] && codeData.slideshow_id !== djkingcakeResult.rows[0].id ? 
        `Consider linking to slideshow ID ${djkingcakeResult.rows[0].id} (${djkingcakeResult.rows[0].name})` : null
    };
    
    console.log('🔍 DEBUG: Activation code analysis:', debugInfo);
    res.json(debugInfo);
    
  } catch (error) {
    console.error('🔍 DEBUG: Error checking activation code:', error);
    res.status(500).json({ error: 'Failed to debug activation code' });
  }
});

// Fix activation code linkage endpoint (admin only)
app.post('/api/debug/fix-activation-code/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const { targetSlideshowId } = req.body;
    
    console.log('🔧 FIXING: Activation code linkage for:', code, 'to slideshow:', targetSlideshowId);
    
    // Verify the target slideshow exists and has images
    const slideshowCheck = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM slideshow_images WHERE slideshow_id = s.id) as image_count
       FROM slideshows s 
       WHERE s.id = $1`,
      [targetSlideshowId]
    );
    
    if (slideshowCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Target slideshow not found' });
    }
    
    const targetSlideshow = slideshowCheck.rows[0];
    
    if (targetSlideshow.image_count === 0) {
      return res.status(400).json({ 
        error: 'Target slideshow has no images',
        slideshow: targetSlideshow
      });
    }
    
    // Update the activation code linkage
    const updateResult = await pool.query(
      `UPDATE activation_codes 
       SET slideshow_id = $1, playlist_id = NULL
       WHERE code = $2 
       RETURNING *`,
      [targetSlideshowId, code]
    );
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activation code not found' });
    }
    
    console.log('✅ FIXED: Activation code linkage updated successfully');
    
    res.json({
      success: true,
      message: `Activation code ${code} now linked to slideshow: ${targetSlideshow.name}`,
      activationCode: updateResult.rows[0],
      targetSlideshow: targetSlideshow
    });
    
  } catch (error) {
    console.error('🔧 ERROR: Failed to fix activation code linkage:', error);
    res.status(500).json({ error: 'Failed to fix activation code linkage' });
  }
});


// ---------- SLIDESHOW API ----------

// Get all slideshows for the current user
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
        
        // Convert snake_case fields to camelCase for frontend compatibility
        return {
          id: slideshow.id,
          userId: slideshow.user_id,
          name: slideshow.name,
          description: slideshow.description,
          requiresActivationCode: slideshow.requires_activation_code,
          isPublic: slideshow.is_public,
          autoplayInterval: slideshow.autoplay_interval,
          transition: slideshow.transition,
          backgroundAudioUrl: slideshow.audio_url,
          createdAt: slideshow.created_at,
          updatedAt: slideshow.updated_at,
          images: imagesResult.rows.map(img => ({
            id: img.id,
            slideshowId: img.slideshow_id,
            imageUrl: img.image_url,
            caption: img.caption,
            displayOrder: img.display_order,
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
// Get a specific slideshow by ID
app.get('/api/slideshows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🎬 SLIDESHOWS: ===== GET SLIDESHOW DEBUG START =====');
    console.log('🎬 SLIDESHOWS: Fetching slideshow ID:', id);
    
    const result = await pool.query(
      `SELECT s.*, u.username 
       FROM slideshows s 
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      console.log('🎬 SLIDESHOWS: ❌ Slideshow not found');
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = result.rows[0];
    
    console.log('🎬 SLIDESHOWS: ✅ Slideshow found in database');
    console.log('🎬 SLIDESHOWS: Raw slideshow data from database:');
    console.log('🎬 SLIDESHOWS:   - id:', slideshow.id);
    console.log('🎬 SLIDESHOWS:   - name:', slideshow.name);
    console.log('🎬 SLIDESHOWS:   - audio_url:', slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - audio_url type:', typeof slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - autoplay_interval:', slideshow.autoplay_interval);
    console.log('🎬 SLIDESHOWS:   - requires_activation_code:', slideshow.requires_activation_code);
    
    const imagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [id]
    );
    
    console.log('🎬 SLIDESHOWS: Found', imagesResult.rows.length, 'images for slideshow');
    
    const images = await Promise.all(imagesResult.rows.map(async (img) => {
      const s3Key = s3Service.extractKeyFromUrl(img.image_url);
      const signedUrl = s3Key ? await s3Service.getSignedUrl(s3Key) : img.image_url;
      
      return {
        id: img.id,
        slideshowId: id,
        displayOrder: img.display_order,
        createdAt: img.created_at,
        title: img.caption || `Image ${img.display_order + 1}`,
        description: img.caption,
        url: signedUrl, 
        type: 'image',
        fileType: 'image',
        contentType: 'image/jpeg'
      };
    }));

    console.log('🎬 SLIDESHOWS: Processing background audio URL...');
    console.log('🎬 SLIDESHOWS: Original audio_url:', slideshow.audio_url);
    
    // Pre-sign the background audio URL if it exists
    let signedAudioUrl = null;
    if (slideshow.audio_url) {
      let actualAudioUrl = slideshow.audio_url;
      
      // Check if the audio_url is a JSON string and parse it
      if (typeof slideshow.audio_url === 'string' && slideshow.audio_url.startsWith('{')) {
        try {
          const audioData = JSON.parse(slideshow.audio_url);
          actualAudioUrl = audioData.url || slideshow.audio_url;
          console.log('🎵 SLIDESHOWS: Parsed JSON audio data, extracted URL:', actualAudioUrl);
        } catch (e) {
          console.log('🎵 SLIDESHOWS: ⚠️ Failed to parse audio_url as JSON:', e.message);
          // Try to extract URL from malformed JSON string using regex
          const urlMatch = slideshow.audio_url.match(/"url":"([^"]+)"/);
          if (urlMatch) {
            actualAudioUrl = urlMatch[1];
            console.log('🎵 SLIDESHOWS: Extracted URL from malformed JSON using regex:', actualAudioUrl);
          } else {
            actualAudioUrl = slideshow.audio_url;
          }
        }
      }
      
      if (actualAudioUrl && actualAudioUrl.includes('amazonaws.com')) {
        console.log('🎵 SLIDESHOWS: Audio URL is S3, generating signed URL...');
        const audioKey = s3Service.extractKeyFromUrl(actualAudioUrl);
        console.log('🎵 SLIDESHOWS: Extracted S3 key:', audioKey);
        if (audioKey) {
          signedAudioUrl = await s3Service.getSignedUrl(audioKey);
          console.log('🎵 SLIDESHOWS: Generated signed audio URL:', signedAudioUrl);
        } else {
          console.log('🎵 SLIDESHOWS: ⚠️ Could not extract S3 key from audio URL');
        }
      } else if (actualAudioUrl) {
        console.log('🎵 SLIDESHOWS: Audio URL is not S3, using as-is');
        signedAudioUrl = actualAudioUrl;
      } else {
        console.log('🎵 SLIDESHOWS: ⚠️ No valid audio URL found after parsing');
      }
    } else {
      console.log('🎵 SLIDESHOWS: No background audio URL found');
    }

    // Get product links for this slideshow
    let productLinks = [];
    try {
      const productLinksResult = await pool.query(`
        SELECT pl.*, p.name as product_name, p.price, p.images as product_images
        FROM product_links pl
        JOIN products p ON pl.product_id = p.id
        WHERE pl.slideshow_id = $1 AND pl.is_active = true
        ORDER BY pl.display_order, pl.created_at
      `, [id]);

      // Format product links for frontend
      productLinks = productLinksResult.rows.map(link => {
        // Fix price formatting - if price is abnormally high (> 10000 cents = $100), it might be stored incorrectly
        let formattedPrice = null;
        if (link.price) {
          let priceInCents = link.price;
          // If price is greater than $100 (10000 cents), it might be stored as dollars*100 instead of cents
          // This is a temporary fix for the "hi" product that has price 53000 instead of 530
          if (priceInCents > 10000) {
            priceInCents = priceInCents / 100; // Convert back to proper cents
          }
          formattedPrice = `$${(priceInCents / 100).toFixed(2)}`;
        }
        
        return {
          id: link.product_id.toString(), // Use product_id, not link.id
          linkId: link.id.toString(), // Keep link ID for reference
          title: link.title,
          url: link.url,
          description: link.description,
          imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
          images: link.product_images || (link.image_url ? [link.image_url] : []),
          displayOrder: link.display_order,
          isActive: link.is_active,
          price: formattedPrice,
          productName: link.product_name
        };
      });

      console.log('🎬 SLIDESHOWS: Found', productLinks.length, 'product links');
    } catch (error) {
      console.error('🎬 SLIDESHOWS: Error fetching product links:', error);
      productLinks = [];
    }

    const finalSlideshow = {
      id: slideshow.id,
      userId: slideshow.user_id,
      name: slideshow.name,
      description: slideshow.description,
      username: slideshow.username,
      isPublic: slideshow.is_public,
      requiresActivationCode: slideshow.requires_activation_code,
      autoplayInterval: slideshow.autoplay_interval,
      backgroundAudioUrl: signedAudioUrl,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      images: images,
      productLinks: productLinks
    };
    
    console.log('🎬 SLIDESHOWS: Final slideshow object prepared:');
    console.log('🎬 SLIDESHOWS:   - id:', finalSlideshow.id);
    console.log('🎬 SLIDESHOWS:   - name:', finalSlideshow.name);
    console.log('🎬 SLIDESHOWS:   - backgroundAudioUrl:', finalSlideshow.backgroundAudioUrl);
    console.log('🎬 SLIDESHOWS:   - backgroundAudioUrl type:', typeof finalSlideshow.backgroundAudioUrl);
    console.log('🎬 SLIDESHOWS:   - autoplayInterval:', finalSlideshow.autoplayInterval);
    console.log('🎬 SLIDESHOWS:   - requiresActivationCode:', finalSlideshow.requiresActivationCode);
    console.log('🎬 SLIDESHOWS:   - images count:', finalSlideshow.images.length);
    
    console.log('🎬 SLIDESHOWS: Sending response to frontend...');
    console.log('🎬 SLIDESHOWS: ===== GET SLIDESHOW DEBUG END =====');
    
    res.json({ slideshow: finalSlideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: ❌ Error fetching slideshow:', error);
    console.error('🎬 SLIDESHOWS: Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product links for a specific slideshow
app.get('/api/slideshows/:slideshowId/products', async (req, res) => {
  try {
    const { slideshowId } = req.params;
    console.log(`🔗 PRODUCTS: Fetching product links for slideshow ${slideshowId}`);

    const result = await pool.query(
      `SELECT p.*
       FROM products p
       JOIN product_links pl ON p.id = pl.product_id
       WHERE pl.slideshow_id = $1 AND p.is_deleted = false`,
      [slideshowId]
    );

    const products = result.rows;

    const productsWithSignedUrls = await Promise.all(products.map(async (product) => {
      // Convert price from cents to dollars
      if (product.price) {
        product.price = product.price / 100;
      }
      
      if (product.image_url && product.image_url.includes('amazonaws.com')) {
        const s3Key = s3Service.extractKeyFromUrl(product.image_url);
        if (s3Key) {
          product.image_url = await s3Service.getSignedUrl(s3Key);
        }
      }
      if (product.image_urls && Array.isArray(product.image_urls)) {
        product.image_urls = await Promise.all(product.image_urls.map(async (url) => {
           if (url && url.includes('amazonaws.com')) {
            const s3Key = s3Service.extractKeyFromUrl(url);
            if (s3Key) {
              return s3Service.getSignedUrl(s3Key);
            }
          }
          return url;
        }));
      }
      return product;
    }));

    console.log(`🔗 PRODUCTS: Found ${productsWithSignedUrls.length} product links.`);
    res.json({ products: productsWithSignedUrls });

  } catch (error) {
    console.error('🔗 PRODUCTS: Error fetching product links for slideshow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific playlist by ID for access control (no auth required)
app.get('/api/playlist-access/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎵 PLAYLIST_ACCESS: Fetching playlist for access:', id);
    
    const playlist = await getPlaylistWithMedia(id);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Convert to access format
    const accessData = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      requiresActivationCode: playlist.requiresActivationCode,
      isPublic: playlist.isPublic,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      mediaFiles: playlist.mediaFiles || [],
      productLinks: playlist.productLinks || [],
      // Add access control flag
      accessRestricted: playlist.requiresActivationCode && !playlist.isPublic
    };
    
    // Attempt to link a QR code to this playlist and record a scan (public tracking)
    try {
      let qrId = null;
      // Primary: link by playlist_id when available
      try {
        const qrRes = await pool.query(
          'SELECT id FROM qr_codes WHERE playlist_id = $1 ORDER BY created_at DESC LIMIT 1',
          [id]
        );
        if (qrRes.rows.length > 0) {
          qrId = qrRes.rows[0].id;
        }
      } catch (_) {}

      // Fallback 1: robust URL matching for legacy codes (normalize host, slashes, strip query)
      if (!qrId) {
        const rawFrontend = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://www.merchtrader.org';
        const frontend = rawFrontend.replace(/\/$/, '');
        const candidates = [
          `${frontend}/playlist-access/${id}`,
          `${frontend.replace('https://www.', 'https://')}/playlist-access/${id}`,
          `${frontend.replace('https://', 'https://www.')}/playlist-access/${id}`,
        ];
        // Search by normalized URL ignoring trailing slash and querystrings
        const qrByUrl = await pool.query(
          `SELECT id FROM qr_codes 
           WHERE is_active = true AND (
             regexp_replace(url, '\\?.*$', '') IN ($1, $2, $3)
             OR regexp_replace(url, '/+$', '') IN ($1, $2, $3)
           )
           ORDER BY created_at DESC LIMIT 1`,
          candidates
        );
        if (qrByUrl.rows.length > 0) qrId = qrByUrl.rows[0].id;
      }

      // Fallback 2: match by path only regardless of domain (handles QR pointing to backend host)
      if (!qrId) {
        try {
          const pathPattern = `/playlist-access/${id}`;
          const qrByPath = await pool.query(
            `SELECT id FROM qr_codes
             WHERE is_active = true AND (
               POSITION($1 in url) > 0 OR POSITION($2 in url) > 0
             )
             ORDER BY created_at DESC LIMIT 1`,
            [pathPattern, `${pathPattern}?`]
          );
          if (qrByPath.rows.length > 0) qrId = qrByPath.rows[0].id;
        } catch (_) {}
      }
      // Fallback 3: strict path equality after stripping domain, query, and trailing slashes
      if (!qrId) {
        try {
          const normalizedPath = `/playlist-access/${id}`;
          const qrByNormalizedPath = await pool.query(
            `SELECT id FROM qr_codes
             WHERE is_active = true AND 
               regexp_replace(
                 regexp_replace(url, '^https?://[^/]+', ''),
                 '/+$', ''
               ) = $1`,
            [normalizedPath]
          );
          if (qrByNormalizedPath.rows.length > 0) qrId = qrByNormalizedPath.rows[0].id;
        } catch (_) {}
      }
      if (qrId) {
        accessData.qr_code_id = qrId;
        // NOTE: Scan tracking is now handled by the playlist-player screen to avoid duplicates
        // The player screen calls /api/analytics/track-scan which handles deduplication properly
        // console.log('🎵 PLAYLIST_ACCESS: QR code linked, tracking deferred to player screen');
      }
    } catch (trackErr) {
      console.warn('📊 ANALYTICS: Failed to link QR code to playlist:', trackErr?.message || trackErr);
    }
    
    console.log('🎵 PLAYLIST_ACCESS: Playlist found:', accessData.name);
    console.log('🎵 PLAYLIST_ACCESS: Access restricted:', accessData.accessRestricted);
    res.json(accessData);
    
  } catch (error) {
    console.error('🎵 PLAYLIST_ACCESS: Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// Get a specific slideshow by ID for access control (no auth required)
app.get('/api/slideshow-access/:id', async (req, res) => {
  const slideshowId = req.params.id;
  const activationCode = req.query.code;
  const client = await pool.connect();

  try {
    // Fetch the slideshow details first
    console.log(`🎬 GET_SLIDESHOW [${slideshowId}]: Starting fetch for access check.`);
    const slideshowRes = await client.query('SELECT * FROM slideshows WHERE id = $1', [slideshowId]);

    if (slideshowRes.rows.length === 0) {
      return res.status(404).json({ message: 'Slideshow not found' });
    }

    let slideshow = slideshowRes.rows[0];

    // If the slideshow is protected, validate the activation code
    if (slideshow.requires_activation_code) {
      if (!activationCode) {
        return res.status(403).json({ message: 'Activation code required' });
      }

      const codeRes = await client.query(
        'SELECT * FROM activation_codes WHERE code = $1 AND slideshow_id = $2 AND (max_uses IS NULL OR uses_count < max_uses) AND (expires_at IS NULL OR expires_at > NOW())',
        [activationCode, slideshowId]
      );

      if (codeRes.rows.length === 0) {
        return res.status(403).json({ message: 'Invalid or expired activation code' });
      }
    }

    // If we've reached here, access is granted, so we can fetch the full details
    console.log(`🎬 GET_SLIDESHOW [${slideshowId}]: Access granted. Fetching full details.`);
    
    // Step 1: Re-fetch slideshow and user data for consistency, using a LEFT JOIN to be safe
    const fullSlideshowResult = await client.query(
      `SELECT s.*, u.username 
       FROM slideshows s 
       LEFT JOIN users u ON s.user_id = u.id 
       WHERE s.id = $1`,
      [slideshowId]
    );
    
    if (fullSlideshowResult.rows.length === 0) {
      // This case is unlikely if the first check passed, but it's a good safeguard
      return res.status(404).json({ message: 'Slideshow data could not be fully retrieved.' });
    }

    const fullSlideshow = fullSlideshowResult.rows[0];

    // Step 2: Fetch images
    const imagesResult = await client.query(
      `SELECT si.id, si.slideshow_id AS "slideshowId", si.image_url, si.caption, si.display_order AS "displayOrder"
       FROM slideshow_images si
       WHERE si.slideshow_id = $1 
       ORDER BY si.display_order`,
      [slideshowId]
    );
    
    // Generate signed URLs for images
    const imagesWithSignedUrls = await Promise.all(
      imagesResult.rows.map(async (image) => {
        try {
          if (image.image_url && image.image_url.includes('s3.us-east-2.amazonaws.com/')) {
            const s3Key = image.image_url.split('s3.us-east-2.amazonaws.com/')[1].split('?')[0];
            const signedUrl = await s3Service.getSignedUrl(s3Key, 3600);
            return { ...image, image_url: signedUrl };
          }
          return image;
        } catch (error) {
          console.error(`Failed to generate signed URL for image ${image.id}:`, error);
          return image; // Return original if signing fails
        }
      })
    );
    
    fullSlideshow.images = imagesWithSignedUrls;

    // Step 3: Fetch product links with full product data
    const productLinksResult = await client.query(
      `SELECT pl.*, p.name as product_name, p.price, p.images as product_images
       FROM product_links pl
       JOIN products p ON pl.product_id = p.id
       WHERE pl.slideshow_id = $1 AND pl.is_active = true
       ORDER BY pl.display_order, pl.created_at`,
      [slideshowId]
    );
    
    // Format product links for frontend (same as in /api/slideshows/:id endpoint)
    fullSlideshow.productLinks = productLinksResult.rows.map(link => {
      // Fix price formatting - if price is abnormally high (> 10000 cents = $100), it might be stored incorrectly
      let formattedPrice = null;
      if (link.price) {
        let priceInCents = link.price;
        // If price is greater than $100 (10000 cents), it might be stored as dollars*100 instead of cents
        // This is a temporary fix for the "hi" product that has price 53000 instead of 530
        if (priceInCents > 10000) {
          priceInCents = priceInCents / 100; // Convert back to proper cents
        }
        formattedPrice = `$${(priceInCents / 100).toFixed(2)}`;
      }
      
      return {
        id: link.product_id.toString(), // Use product_id, not link.id
        linkId: link.id.toString(), // Keep link ID for reference
        title: link.title,
        url: link.url,
        description: link.description,
        imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
        images: link.product_images || (link.image_url ? [link.image_url] : []),
        displayOrder: link.display_order,
        isActive: link.is_active,
        price: formattedPrice,
        productName: link.product_name
      };
    });
    
    // Try to locate a QR code pointing at this slideshow and record a scan
    try {
      let qrId = null;
      try {
        const qrRes = await client.query(
          'SELECT id FROM qr_codes WHERE slideshow_id = $1 ORDER BY created_at DESC LIMIT 1',
          [slideshowId]
        );
        if (qrRes.rows.length > 0) qrId = qrRes.rows[0].id;
      } catch (_) {}

      if (!qrId) {
        const rawFrontend = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://www.merchtrader.org';
        const frontend = rawFrontend.replace(/\/$/, '');
        const candidates = [
          `${frontend}/slideshow-access/${slideshowId}`,
          `${frontend.replace('https://www.', 'https://')}/slideshow-access/${slideshowId}`,
          `${frontend.replace('https://', 'https://www.')}/slideshow-access/${slideshowId}`,
        ];
        const qrByUrl = await client.query(
          `SELECT id FROM qr_codes 
           WHERE is_active = true AND (
             regexp_replace(url, '\\?.*$', '') IN ($1, $2, $3)
             OR regexp_replace(url, '/+$', '') IN ($1, $2, $3)
           )
           ORDER BY created_at DESC LIMIT 1`,
          candidates
        );
        if (qrByUrl.rows.length > 0) qrId = qrByUrl.rows[0].id;
      }
      // Fallback 2: match by path only regardless of domain
      if (!qrId) {
        try {
          const pathPattern = `/slideshow-access/${slideshowId}`;
          const qrByPath = await client.query(
            `SELECT id FROM qr_codes
             WHERE is_active = true AND (
               POSITION($1 in url) > 0 OR POSITION($2 in url) > 0
             )
             ORDER BY created_at DESC LIMIT 1`,
            [pathPattern, `${pathPattern}?`]
          );
          if (qrByPath.rows.length > 0) qrId = qrByPath.rows[0].id;
        } catch (_) {}
      }
      if (qrId) {
        fullSlideshow.qr_code_id = qrId;
        // NOTE: Scan tracking is now handled by the slideshow-player screen to avoid duplicates
        // The player screen calls /api/analytics/track-scan which handles deduplication properly
        // console.log('🎬 SLIDESHOW_ACCESS: QR code linked, tracking deferred to player screen');
      }
    } catch (trackErr) {
      console.warn('📊 ANALYTICS: Failed to link QR code to slideshow:', trackErr?.message || trackErr);
    }
    
    // Step 4: Generate signed URL for audio if it exists
    if (fullSlideshow.audio_url) {
      try {
        // Extract S3 key from the URL
        const audioUrl = fullSlideshow.audio_url;
        if (audioUrl.includes('s3.us-east-2.amazonaws.com/')) {
          const s3Key = audioUrl.split('s3.us-east-2.amazonaws.com/')[1].split('?')[0];
          console.log(`🎵 SLIDESHOW_ACCESS: Generating signed URL for audio key: ${s3Key}`);
          
          const signedUrl = await s3Service.getSignedUrl(s3Key, 3600); // 1 hour expiry
          fullSlideshow.audio_url = signedUrl;
          console.log(`🎵 SLIDESHOW_ACCESS: Generated signed URL for audio`);
        }
      } catch (error) {
        console.error(`🎵 SLIDESHOW_ACCESS: Failed to generate signed URL for audio:`, error);
        // Don't fail the whole request, just leave the original URL
      }
    }
    
    res.json(fullSlideshow);

  } catch (err) {
    console.error(`Failed to fetch slideshow access for ID ${slideshowId}:`, err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/api/slideshows/:id/audio-url', authenticateToken, async (req, res) => {
    const { id } = req.params;
    console.log(`🎵 SLIDESHOW_AUDIO_URL: Fetching audio URL for slideshow ${id}`);
    
    // Fetch the slideshow details
    const slideshowResult = await pool.query('SELECT * FROM slideshows WHERE id = $1', [id]);
    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = slideshowResult.rows[0];
    let audioUrl = slideshow.audio_url;
    
    if (!audioUrl) {
      return res.status(404).json({ error: 'No audio URL for this slideshow' });
    }
    
    // If audio URL is stored as JSON, extract it
    if (typeof audioUrl === 'string' && audioUrl.startsWith('{')) {
      try {
        const audioData = JSON.parse(audioUrl);
        if (audioData && audioData.url) {
          audioUrl = audioData.url;
        }
      } catch (e) {
        // If it's not valid JSON, try to extract URL using regex
        console.log('🎵 SLIDESHOW_AUDIO_URL: Audio URL is not valid JSON, trying regex extraction');
        const urlMatch = audioUrl.match(/"url":"([^"]+)"/);
        if (urlMatch) {
          audioUrl = urlMatch[1];
          console.log('🎵 SLIDESHOW_AUDIO_URL: Extracted URL from malformed JSON using regex:', audioUrl);
        } else {
          console.log('🎵 SLIDESHOW_AUDIO_URL: Could not extract URL, using as string');
        }
      }
    }
    
    res.json({ audioUrl });
  });

// Create a new slideshow
app.post('/api/slideshows', authenticateToken, async (req, res) => {
  try {
    const { name, description, autoplayInterval, transition, requiresActivationCode } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Slideshow name is required' });
    }
    
    console.log('🎬 SLIDESHOWS: Creating slideshow:', name);
    
    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_slideshows FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM slideshows WHERE user_id = $1', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    let maxSlideshows;
    if (user?.max_slideshows !== null && user?.max_slideshows !== undefined) {
      maxSlideshows = user.max_slideshows;
    } else {
      const limits = {
        free: { maxSlideshows: 5 },
        basic: { maxSlideshows: 15 },
        premium: { maxSlideshows: 30 }
      };
      maxSlideshows = (limits[userTier] || limits.free).maxSlideshows;
    }
    
    if (currentCount >= maxSlideshows) {
      return res.status(403).json({ 
        error: `Slideshow limit reached. You have reached your limit of ${maxSlideshows} slideshows.`,
        limit: maxSlideshows,
        current: currentCount,
        subscriptionTier: userTier
      });
    }

    const result = await pool.query(
      `INSERT INTO slideshows (user_id, name, description, autoplay_interval, transition, requires_activation_code, times_created) 
       VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING *`,
      [req.user.userId, name, description, autoplayInterval || 5000, transition || 'fade', requiresActivationCode || false]
    );
    
    const slideshow = {
      ...result.rows[0],
      images: []
    };
    
    console.log('🎬 SLIDESHOWS: Slideshow created successfully:', slideshow.name);
    console.log('📊 ANALYTICS: Slideshow created, times_created incremented');
    res.status(201).json({ slideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error creating slideshow:', error);
    res.status(500).json({ error: 'Failed to create slideshow' });
  }
});

// Update a slideshow
app.patch('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, autoplayInterval, transition, requiresActivationCode, audio_url } = req.body;
    
    console.log('🎬 SLIDESHOWS: ===== SLIDESHOW UPDATE DEBUG START =====');
    console.log('🎬 SLIDESHOWS: Updating slideshow ID:', id);
    console.log('🎬 SLIDESHOWS: Request body received:', JSON.stringify(req.body, null, 2));
    console.log('🎬 SLIDESHOWS: Extracted fields:');
    console.log('🎬 SLIDESHOWS:   - name:', name);
    console.log('🎬 SLIDESHOWS:   - description:', description);
    console.log('🎬 SLIDESHOWS:   - autoplayInterval:', autoplayInterval);
    console.log('🎬 SLIDESHOWS:   - transition:', transition);
    console.log('🎬 SLIDESHOWS:   - requiresActivationCode:', requiresActivationCode);
    console.log('🎬 SLIDESHOWS:   - audio_url:', audio_url);
    console.log('🎬 SLIDESHOWS:   - audio_url type:', typeof audio_url);
    console.log('🎬 SLIDESHOWS: User ID:', req.user.userId);
    
    // Check if user owns the slideshow
    console.log('🎬 SLIDESHOWS: Checking slideshow ownership...');
    const ownerCheck = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      console.log('🎬 SLIDESHOWS: ❌ Slideshow not found');
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      console.log('🎬 SLIDESHOWS: ❌ Not authorized - owner:', ownerCheck.rows[0].user_id, 'user:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to update this slideshow' });
    }

    console.log('🎬 SLIDESHOWS: ✅ Ownership verified');
    
    // Process audio_url - extract just the URL if it's an object
    let processedAudioUrl = audio_url;
    if (audio_url && typeof audio_url === 'object' && audio_url.url) {
      processedAudioUrl = audio_url.url;
      console.log('🎵 SLIDESHOWS: Audio URL is object, extracting URL:', processedAudioUrl);
    } else if (audio_url && typeof audio_url === 'string') {
      // If it's a JSON string, try to parse it and extract the URL
      if (audio_url.startsWith('{')) {
        try {
          const audioData = JSON.parse(audio_url);
          processedAudioUrl = audioData.url || audio_url;
          console.log('🎵 SLIDESHOWS: Audio URL is JSON string, extracted URL:', processedAudioUrl);
        } catch (e) {
          console.log('🎵 SLIDESHOWS: Failed to parse audio URL JSON, using as-is:', audio_url);
          processedAudioUrl = audio_url;
        }
      } else {
        console.log('🎵 SLIDESHOWS: Audio URL is string, using as-is:', processedAudioUrl);
      }
    }
    
    console.log('🎬 SLIDESHOWS: Executing UPDATE query with parameters:');
    console.log('🎬 SLIDESHOWS:   $1 (name):', name);
    console.log('🎬 SLIDESHOWS:   $2 (description):', description);
    console.log('🎬 SLIDESHOWS:   $3 (autoplayInterval):', autoplayInterval);
    console.log('🎬 SLIDESHOWS:   $4 (transition):', transition);
    console.log('🎬 SLIDESHOWS:   $5 (requiresActivationCode):', requiresActivationCode);
    console.log('🎬 SLIDESHOWS:   $6 (processedAudioUrl):', processedAudioUrl);
    console.log('🎬 SLIDESHOWS:   $7 (id):', id);

    const result = await pool.query(
      `UPDATE slideshows 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           autoplay_interval = COALESCE($3, autoplay_interval), 
           transition = COALESCE($4, transition),
           requires_activation_code = COALESCE($5, requires_activation_code),
           audio_url = COALESCE($6, audio_url),
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, description, autoplayInterval, transition, requiresActivationCode, processedAudioUrl, id]
    );

    const slideshow = result.rows[0];
    
    console.log('🎬 SLIDESHOWS: ✅ UPDATE query successful');
    console.log('🎬 SLIDESHOWS: Updated slideshow data from database:');
    console.log('🎬 SLIDESHOWS:   - id:', slideshow.id);
    console.log('🎬 SLIDESHOWS:   - name:', slideshow.name);
    console.log('🎬 SLIDESHOWS:   - audio_url:', slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - audio_url type:', typeof slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - autoplay_interval:', slideshow.autoplay_interval);
    console.log('🎬 SLIDESHOWS:   - requires_activation_code:', slideshow.requires_activation_code);
    console.log('🎬 SLIDESHOWS:   - updated_at:', slideshow.updated_at);
    
    if (processedAudioUrl) {
      console.log('🎵 SLIDESHOWS: ✅ Audio URL was provided and should be updated');
      console.log('🎵 SLIDESHOWS: Original audio_url from request:', audio_url);
      console.log('🎵 SLIDESHOWS: Processed audio_url for database:', processedAudioUrl);
      console.log('🎵 SLIDESHOWS: Stored audio_url in database:', slideshow.audio_url);
      
      if (processedAudioUrl !== slideshow.audio_url) {
        console.log('🎵 SLIDESHOWS: ⚠️ WARNING: Audio URL mismatch!');
        console.log('🎵 SLIDESHOWS: Expected:', processedAudioUrl);
        console.log('🎵 SLIDESHOWS: Got:', slideshow.audio_url);
      } else {
        console.log('🎵 SLIDESHOWS: ✅ Audio URL stored correctly');
      }
    } else {
      console.log('🎵 SLIDESHOWS: ℹ️ No audio_url provided in request');
    }
    
    console.log('🎬 SLIDESHOWS: Preparing response object...');
    const responseSlideshow = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      requiresActivationCode: slideshow.requires_activation_code,
      backgroundAudioUrl: slideshow.audio_url,
      updatedAt: slideshow.updated_at
    };
    
    console.log('🎬 SLIDESHOWS: Response object prepared:');
    console.log('🎬 SLIDESHOWS:', JSON.stringify(responseSlideshow, null, 2));
    console.log('🎬 SLIDESHOWS: ===== SLIDESHOW UPDATE DEBUG END =====');
    
    res.json({ slideshow: responseSlideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: ❌ Error updating slideshow:', error);
    console.error('🎬 SLIDESHOWS: Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to update slideshow' });
  }
});

// Delete a slideshow
app.delete('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🎬 SLIDESHOWS: Deleting slideshow:', id);
    
    // Check if user owns the slideshow
    const ownerCheck = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this slideshow' });
    }

    // Delete slideshow (this will cascade delete images)
    await pool.query('DELETE FROM slideshows WHERE id = $1', [id]);
    
    console.log('🎬 SLIDESHOWS: Slideshow deleted successfully');
    res.json({ message: 'Slideshow deleted successfully' });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error deleting slideshow:', error);
    res.status(500).json({ error: 'Failed to delete slideshow' });
  }
});
// Upload image for slideshow
app.post('/api/slideshows/:id/images', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    console.log('🎬 SLIDESHOW_UPLOAD: Starting image upload process');
    const { id } = req.params;
    const { caption, position } = req.body;
    
    console.log('🎬 SLIDESHOW_UPLOAD: Parameters received:', { 
      id, 
      caption, 
      position,
      hasFile: !!req.file,
      fileInfo: req.file ? {
        originalname: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null
    });
    
    if (!req.file) {
      console.log('🎬 SLIDESHOW_UPLOAD: No file provided');
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Check if user owns the slideshow
    const slideshowResult = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [id]
    );
    
    if (slideshowResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_UPLOAD: Slideshow not found:', id);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    if (slideshowResult.rows[0].user_id !== req.user.userId) {
      console.log('🎬 SLIDESHOW_UPLOAD: User not authorized:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to upload to this slideshow' });
    }
    
    // Upload to S3
    let imageUrl;
    try {
      if (!s3Service) {
        return res.status(500).json({ error: 'S3 service not configured' });
      }
      
      console.log('🎬 SLIDESHOW_UPLOAD: Uploading to S3...');
      const key = `users/${req.user.userId}/media/${Date.now()}-${Math.floor(Math.random() * 1000000000)}.${req.file.originalname.split('.').pop()}`;
      const uploadResult = await s3Service.uploadFile(
        req.file.buffer,
        key,
        req.file.mimetype
      );
      imageUrl = uploadResult.Location || uploadResult.location || `https://merchtechbucket.s3.us-east-2.amazonaws.com/${key}`;
      console.log('🎬 SLIDESHOW_UPLOAD: S3 upload successful:', imageUrl);
    } catch (error) {
      console.error('🎬 SLIDESHOW_UPLOAD: S3 upload failed:', error);
      return res.status(500).json({ error: 'Failed to upload image to S3', details: error.message });
    }
    
    // Get next position if not provided
    let displayOrder = position;
    if (!displayOrder) {
      console.log('🎬 SLIDESHOW_UPLOAD: Getting next position for slideshow:', id);
      const maxPositionResult = await pool.query(
        'SELECT MAX(display_order) as max_pos FROM slideshow_images WHERE slideshow_id = $1',
        [id]
      );
      displayOrder = (maxPositionResult.rows[0].max_pos || 0) + 1;
      console.log('🎬 SLIDESHOW_UPLOAD: Next position calculated:', displayOrder);
    }
    
    // Save image record to database with S3 URL
    console.log('🎬 SLIDESHOW_UPLOAD: About to save image record with S3 URL:', imageUrl);
    
    const imageResult = await pool.query(
      `INSERT INTO slideshow_images (slideshow_id, image_url, caption, display_order, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [id, imageUrl, caption || '', displayOrder]
    );
    
    console.log('🎬 SLIDESHOW_UPLOAD: Image record saved successfully:', imageResult.rows[0]);
    
    const image = {
      id: imageResult.rows[0].id,
      slideshowId: imageResult.rows[0].slideshow_id,
      imageUrl: imageResult.rows[0].image_url,
      caption: imageResult.rows[0].caption,
      displayOrder: imageResult.rows[0].display_order,
      createdAt: imageResult.rows[0].created_at
    };
    
    console.log('🎬 SLIDESHOW_UPLOAD: Image uploaded successfully to S3:', {
      imageId: image.id,
      s3Url: image.imageUrl
    });
    
    res.status(201).json({ image });
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_UPLOAD: Error uploading image:', error);
    console.error('🎬 SLIDESHOW_UPLOAD: Error message:', error.message);
    if (error.stack) {
      console.error('🎬 SLIDESHOW_UPLOAD: Error stack:', error.stack);
    }
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// Delete image from slideshow
app.delete('/api/slideshows/:slideshowId/images/:imageId', authenticateToken, async (req, res) => {
  try {
    const { slideshowId, imageId } = req.params;
    
    console.log('🎬 SLIDESHOW_DELETE_IMAGE: Deleting image:', { slideshowId, imageId });
    
    // Check if user owns the slideshow
    const slideshowResult = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [slideshowId]
    );
    
    if (slideshowResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_DELETE_IMAGE: Slideshow not found:', slideshowId);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    if (slideshowResult.rows[0].user_id !== req.user.userId) {
      console.log('🎬 SLIDESHOW_DELETE_IMAGE: User not authorized:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to delete from this slideshow' });
    }
    
    // Get image details for file deletion
    const imageResult = await pool.query(
      'SELECT * FROM slideshow_images WHERE id = $1 AND slideshow_id = $2',
      [imageId, slideshowId]
    );
    
    if (imageResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_DELETE_IMAGE: Image not found:', imageId);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Delete image record
    await pool.query(
      'DELETE FROM slideshow_images WHERE id = $1',
      [imageId]
    );
    
    // Delete file from S3 if it's an S3 URL
    const imageUrl = imageResult.rows[0].image_url;
    if (imageUrl.includes('amazonaws.com') && s3Service) {
      try {
        const key = s3Service.extractKeyFromUrl(imageUrl);
        if (key) {
          await s3Service.deleteFile(key);
          console.log('🎬 SLIDESHOW_DELETE_IMAGE: S3 file deleted:', key);
        }
      } catch (s3Error) {
        console.error('🎬 SLIDESHOW_DELETE_IMAGE: Failed to delete S3 file:', s3Error);
        // Continue with response even if S3 deletion fails
      }
    } else if (imageUrl.includes('localhost') || imageUrl.includes('uploads/')) {
      // Delete file from filesystem for local files
      const filename = imageUrl.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🎬 SLIDESHOW_DELETE_IMAGE: File deleted from filesystem:', filename);
      }
    }
    
    // Get updated slideshow with remaining images
    const updatedSlideshowResult = await pool.query(
      'SELECT * FROM slideshows WHERE id = $1',
      [slideshowId]
    );
    
    if (updatedSlideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = updatedSlideshowResult.rows[0];
    
    // Get remaining images for the slideshow
    const remainingImagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [slideshowId]
    );
    
    const updatedSlideshow = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      uniqueId: slideshow.unique_id,
      userId: slideshow.user_id,
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      audioUrl: slideshow.audio_url,
      requiresActivationCode: slideshow.requires_activation_code,
      isPublic: slideshow.is_public,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      images: remainingImagesResult.rows.map(img => ({
        id: img.id,
        slideshowId: img.slideshow_id,
        imageUrl: img.image_url,
        caption: img.caption,
        displayOrder: img.display_order,
        createdAt: img.created_at
      }))
    };
    
    console.log('🎬 SLIDESHOW_DELETE_IMAGE: Image deleted successfully, returning updated slideshow with', updatedSlideshow.images.length, 'images');
    res.json({ slideshow: updatedSlideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_DELETE_IMAGE: Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Stream slideshow image endpoint - serves images for slideshow preview
app.get('/api/slideshow-images/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎬 SLIDESHOW_IMAGE_STREAM: Streaming image:', id);
    
    // Set CORS headers for image streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Get image details from database
    const result = await pool.query(
      'SELECT * FROM slideshow_images WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      console.log('🎬 SLIDESHOW_IMAGE_STREAM: Image not found:', id);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const image = result.rows[0];
    const imageUrl = image.image_url;
    
    console.log('🎬 SLIDESHOW_IMAGE_STREAM: Image URL:', imageUrl);
    
    // If it's an S3 URL, stream through our S3 service
    if (imageUrl.includes('amazonaws.com') && s3Service) {
      try {
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Streaming S3 image');
        const key = s3Service.extractKeyFromUrl(imageUrl);
        if (!key) {
          console.error('🎬 SLIDESHOW_IMAGE_STREAM: Could not extract S3 key from URL:', imageUrl);
          return res.status(500).json({ error: 'Invalid S3 URL format' });
        }
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Extracted S3 key:', key);
        
        // Stream the image through our S3 service
        const { stream, metadata } = await s3Service.getStream(key);
        
        // Set appropriate headers for image streaming
        res.setHeader('Content-Type', metadata.ContentType || 'image/jpeg');
        res.setHeader('Content-Length', metadata.ContentLength);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Pipe the response stream directly
        stream.pipe(res);
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Successfully streaming S3 image');
        return;
        
      } catch (error) {
        console.error('🎬 SLIDESHOW_IMAGE_STREAM: Error streaming S3 image:', error);
        return res.status(500).json({ error: 'Failed to stream S3 image' });
      }
    }
    
    // If it's a local file, serve it directly
    if (imageUrl.startsWith('/') || imageUrl.startsWith('./') || imageUrl.includes('uploads/')) {
      const filename = imageUrl.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(filePath)) {
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Serving local file:', filePath);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(filePath);
      }
    }
    
    // For other URLs, try to proxy them
    try {
      console.log('🎬 SLIDESHOW_IMAGE_STREAM: Proxying external URL:', imageUrl);
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        headers: {
          'Range': req.headers.range || undefined
        }
      });
      
      res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Copy content-length if present
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      // Pipe the response stream directly
      response.data.pipe(res);
      return;
    } catch (err) {
      console.error('🎬 SLIDESHOW_IMAGE_STREAM: Error proxying external URL:', err);
      // Fall back to redirect for external URLs
      console.log('🎬 SLIDESHOW_IMAGE_STREAM: Redirecting to external URL');
      return res.redirect(imageUrl);
    }
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_IMAGE_STREAM: Error streaming image:', error);
    res.status(500).json({ error: 'Failed to stream image' });
  }
});

// Get slideshow for preview (no activation code required)
app.get('/api/slideshow-preview/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎬 SLIDESHOW_PREVIEW: Fetching slideshow for preview:', id);
    console.log('🎬 SLIDESHOW_PREVIEW: ID type:', typeof id);
    
    // First, let's check what slideshows exist
    const allSlideshowsResult = await pool.query('SELECT id, name FROM slideshows ORDER BY id');
    console.log('🎬 SLIDESHOW_PREVIEW: All slideshows in database:', allSlideshowsResult.rows);
    
    // Get slideshow details
    const slideshowResult = await pool.query(
      `SELECT s.*, u.username 
       FROM slideshows s 
       LEFT JOIN users u ON s.user_id = u.id 
       WHERE s.id = $1`,
      [id]
    );
    
    console.log('🎬 SLIDESHOW_PREVIEW: Query result for ID', id, ':', slideshowResult.rows);
    
    if (slideshowResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_PREVIEW: Slideshow not found:', id);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = slideshowResult.rows[0];
    console.log('🎬 SLIDESHOW_PREVIEW: Slideshow found:', slideshow.name);
    
    // Get images for the slideshow
    const imagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [id]
    );
    
    console.log('🎬 SLIDESHOW_PREVIEW: Found', imagesResult.rows.length, 'images');
    
    // Generate signed URLs for images
    const imagesWithSignedUrls = await Promise.all(
      imagesResult.rows.map(async (image) => {
        try {
          if (image.image_url && image.image_url.includes('s3.us-east-2.amazonaws.com/')) {
            const s3Key = image.image_url.split('s3.us-east-2.amazonaws.com/')[1].split('?')[0];
            const signedUrl = await s3Service.getSignedUrl(s3Key, 3600);
            return {
              id: image.id,
              slideshowId: image.slideshow_id,
              url: signedUrl,
              caption: image.caption,
              displayOrder: image.display_order,
              createdAt: image.created_at
            };
          }
          return {
            id: image.id,
            slideshowId: image.slideshow_id,
            url: image.image_url,
            caption: image.caption,
            displayOrder: image.display_order,
            createdAt: image.created_at
          };
        } catch (error) {
          console.error(`🎬 SLIDESHOW_PREVIEW: Failed to generate signed URL for image ${image.id}:`, error);
          return {
            id: image.id,
            slideshowId: image.slideshow_id,
            url: image.image_url,
            caption: image.caption,
            displayOrder: image.display_order,
            createdAt: image.created_at
          };
        }
      })
    );
    
    // Get product links
    let productLinks = [];
    try {
      const productLinksResult = await pool.query(`
        SELECT pl.*, p.name as product_name, p.price, p.images as product_images
        FROM product_links pl
        JOIN products p ON pl.product_id = p.id
        WHERE pl.slideshow_id = $1 AND pl.is_active = true
        ORDER BY pl.display_order, pl.created_at
      `, [id]);

      productLinks = productLinksResult.rows.map(link => {
        let formattedPrice = null;
        if (link.price) {
          let priceInCents = link.price;
          if (priceInCents > 10000) {
            priceInCents = priceInCents / 100;
          }
          formattedPrice = `$${(priceInCents / 100).toFixed(2)}`;
        }
        
        return {
          id: link.product_id.toString(),
          linkId: link.id.toString(),
          title: link.title,
          url: link.url,
          description: link.description,
          imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
          images: link.product_images || (link.image_url ? [link.image_url] : []),
          displayOrder: link.display_order,
          isActive: link.is_active,
          price: formattedPrice,
          productName: link.product_name
        };
      });
    } catch (error) {
      console.error('🎬 SLIDESHOW_PREVIEW: Error fetching product links:', error);
      productLinks = [];
    }
    
    // Generate signed URL for audio if it exists
    let audioUrl = slideshow.audio_url;
    if (audioUrl) {
      try {
        if (audioUrl.includes('s3.us-east-2.amazonaws.com/')) {
          const s3Key = audioUrl.split('s3.us-east-2.amazonaws.com/')[1].split('?')[0];
          audioUrl = await s3Service.getSignedUrl(s3Key, 3600);
        }
      } catch (error) {
        console.error('🎬 SLIDESHOW_PREVIEW: Failed to generate signed URL for audio:', error);
      }
    }
    
    const previewSlideshow = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      username: slideshow.username,
      requiresActivationCode: slideshow.requires_activation_code,
      autoplayInterval: slideshow.autoplay_interval,
      audioUrl: audioUrl,
      images: imagesWithSignedUrls,
      productLinks: productLinks,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at
    };
    
    console.log('🎬 SLIDESHOW_PREVIEW: Returning preview data with', previewSlideshow.images.length, 'images');
    res.json(previewSlideshow);
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_PREVIEW: Error fetching slideshow for preview:', error);
    res.status(500).json({ error: 'Failed to fetch slideshow for preview' });
  }
});

// Stream slideshow audio endpoint - serves audio files for slideshow background music
app.get('/api/slideshow-audio/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎵 SLIDESHOW_AUDIO_STREAM: Streaming audio for slideshow:', id);
    
    // Set CORS headers for audio streaming
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    
    // Get slideshow details from database
    const result = await pool.query(
      'SELECT * FROM slideshows WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: Slideshow not found:', id);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = result.rows[0];
    let audioUrl = slideshow.audio_url;
    
    if (!audioUrl) {
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: No audio URL for slideshow:', id);
      return res.status(404).json({ error: 'No audio file for this slideshow' });
    }
    
    // Fix audio_url if it's stored as JSON object
    if (typeof audioUrl === 'string' && audioUrl.startsWith('{')) {
      try {
        const audioData = JSON.parse(audioUrl);
        if (audioData && audioData.url) {
          audioUrl = audioData.url;
        }
      } catch (e) {
        // If it's not valid JSON, try to extract URL using regex
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Audio URL is not valid JSON, trying regex extraction');
        const urlMatch = audioUrl.match(/"url":"([^"]+)"/);
        if (urlMatch) {
          audioUrl = urlMatch[1];
          console.log('🎵 SLIDESHOW_AUDIO_STREAM: Extracted URL from malformed JSON using regex:', audioUrl);
        } else {
          console.log('🎵 SLIDESHOW_AUDIO_STREAM: Could not extract URL, using as string');
        }
      }
    }
    
    console.log('🎵 SLIDESHOW_AUDIO_STREAM: Audio URL:', audioUrl);
    
    // If it's an S3 URL, stream through our S3 service
    if (audioUrl.includes('amazonaws.com') && s3Service) {
      try {
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Streaming S3 audio');
        const key = s3Service.extractKeyFromUrl(audioUrl);
        if (!key) {
          console.error('🎵 SLIDESHOW_AUDIO_STREAM: Could not extract S3 key from URL:', audioUrl);
          return res.status(500).json({ error: 'Invalid S3 URL format' });
        }
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Extracted S3 key:', key);
        
        // Stream the audio through our S3 service
        const { stream, metadata } = await s3Service.getStream(key);
        
        // Set appropriate headers for audio streaming
        res.setHeader('Content-Type', metadata.ContentType || 'audio/mpeg');
        res.setHeader('Content-Length', metadata.ContentLength);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // For HEAD requests, just return headers without body
        if (req.method === 'HEAD') {
          console.log('🎵 SLIDESHOW_AUDIO_STREAM: HEAD request, returning headers only');
          return res.end();
        }
        
        // Pipe the response stream directly
        stream.pipe(res);
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Successfully streaming S3 audio');
        return;
        
      } catch (error) {
        console.error('🎵 SLIDESHOW_AUDIO_STREAM: Error streaming S3 audio:', error);
        return res.status(500).json({ error: 'Failed to stream S3 audio' });
      }
    }
    
    // If it's a local file, serve it directly
    if (audioUrl.startsWith('/') || audioUrl.startsWith('./') || audioUrl.includes('uploads/')) {
      const filename = audioUrl.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(filePath)) {
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Serving local file:', filePath);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(filePath);
      }
    }
    
    // For other URLs, try to proxy them
    try {
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: Proxying external URL:', audioUrl);
      const response = await axios.get(audioUrl, {
        responseType: 'stream',
        headers: {
          'Range': req.headers.range || undefined
        }
      });
      
      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Copy content-length if present
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      // Pipe the response stream directly
      response.data.pipe(res);
      return;
    } catch (err) {
      console.error('🎵 SLIDESHOW_AUDIO_STREAM: Error proxying external URL:', err);
      // Fall back to redirect for external URLs
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: Redirecting to external URL');
      return res.redirect(audioUrl);
    }
    
  } catch (error) {
    console.error('🎵 SLIDESHOW_AUDIO_STREAM: Error streaming audio:', error);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

// ---------- PLAYLIST MEDIA MANAGEMENT ROUTES ----------

// Add media files to a playlist
app.post('/api/playlists/:id/media', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { mediaFileIds } = req.body;
    
    console.log('🔴 PLAYLIST_MEDIA_ADD: Adding media to playlist:', id);
    console.log('🔴 PLAYLIST_MEDIA_ADD: Media file IDs:', mediaFileIds);
    
    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }
    
    // Get current max display order
    const maxOrderResult = await pool.query(
      'SELECT COALESCE(MAX(display_order), 0) as max_order FROM playlist_media WHERE playlist_id = $1',
      [id]
    );
    let nextOrder = parseInt(maxOrderResult.rows[0].max_order) + 1;
    
    // Add media files to playlist
    if (mediaFileIds && mediaFileIds.length > 0) {
      for (const mediaId of mediaFileIds) {
        // Check if media file exists and user can access it (own file or admin)
        const mediaCheck = await pool.query(
          'SELECT id, user_id FROM media WHERE id = $1',
          [mediaId]
        );
        
        if (mediaCheck.rows.length === 0) {
          return res.status(404).json({ error: `Media file ${mediaId} not found` });
        }
        
        const mediaFile = mediaCheck.rows[0];
        
        // Check if user is admin
        const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
        const isAdmin = userResult.rows[0]?.is_admin || false;
        
        // Allow access if: user owns the file OR user is admin
        if (mediaFile.user_id !== req.user.userId && !isAdmin) {
          return res.status(403).json({ error: `Media file ${mediaId} not authorized` });
        }
        
        // Check if already linked
        const existingLink = await pool.query(
          'SELECT id FROM playlist_media WHERE playlist_id = $1 AND media_id = $2',
          [id, mediaId]
        );
        
        if (existingLink.rows.length === 0) {
          await pool.query(
            'INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3)',
            [id, mediaId, nextOrder]
          );
          nextOrder++;
        }
      }
    }
    
    // Return updated playlist
    const updatedPlaylist = await getPlaylistWithMedia(id);
    res.json({ playlist: updatedPlaylist });
    
  } catch (error) {
    console.error('🔴 PLAYLIST_MEDIA_ADD: Error adding media:', error);
    res.status(500).json({ error: 'Failed to add media to playlist' });
  }
});

// Remove media file from a playlist
app.delete('/api/playlists/:id/media/:mediaId', authenticateToken, async (req, res) => {
  try {
    const { id, mediaId } = req.params;
    
    console.log('🔴 PLAYLIST_MEDIA_REMOVE: Removing media from playlist:', id, 'media:', mediaId);
    
    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }
    
    // Remove media from playlist
    const result = await pool.query(
      'DELETE FROM playlist_media WHERE playlist_id = $1 AND media_id = $2',
      [id, mediaId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Media file not found in playlist' });
    }
    
    // Return updated playlist
    const updatedPlaylist = await getPlaylistWithMedia(id);
    res.json({ playlist: updatedPlaylist });
    
  } catch (error) {
    console.error('🔴 PLAYLIST_MEDIA_REMOVE: Error removing media:', error);
    res.status(500).json({ error: 'Failed to remove media from playlist' });
  }
});
// Update playlist media order
app.put('/api/playlists/:id/media', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { mediaFileIds } = req.body; // Array of media IDs in desired order
    
    console.log('🔴 PLAYLIST_MEDIA_UPDATE: Updating playlist media order:', id);
    console.log('🔴 PLAYLIST_MEDIA_UPDATE: New order:', mediaFileIds);
    
    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }
    
    // Clear existing media links
    await pool.query('DELETE FROM playlist_media WHERE playlist_id = $1', [id]);
    
    // Add media files in new order
    if (mediaFileIds && mediaFileIds.length > 0) {
      for (let i = 0; i < mediaFileIds.length; i++) {
        const mediaId = mediaFileIds[i];
        
        // Check if media file exists and user can access it (own file or admin)
        const mediaCheck = await pool.query(
          'SELECT id, user_id FROM media WHERE id = $1',
          [mediaId]
        );
        
        if (mediaCheck.rows.length === 0) {
          return res.status(404).json({ error: `Media file ${mediaId} not found` });
        }
        
        const mediaFile = mediaCheck.rows[0];
        
        // Check if user is admin
        const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
        const isAdmin = userResult.rows[0]?.is_admin || false;
        
        // Allow access if: user owns the file OR user is admin
        if (mediaFile.user_id !== req.user.userId && !isAdmin) {
          return res.status(403).json({ error: `Media file ${mediaId} not authorized` });
        }
        
        await pool.query(
          'INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3)',
          [id, mediaId, i + 1]
        );
      }
    }
    
    // Return updated playlist
    const updatedPlaylist = await getPlaylistWithMedia(id);
    res.json({ playlist: updatedPlaylist });
    
  } catch (error) {
    console.error('🔴 PLAYLIST_MEDIA_UPDATE: Error updating playlist media:', error);
    res.status(500).json({ error: 'Failed to update playlist media' });
  }
});

// ---------- CHAT ROUTES ----------
app.get('/api/playlists/:playlistId/chat', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    console.log('🔴 CHAT: Fetching messages for playlist:', playlistId);

    // Check if playlist exists and is accessible
    const playlistResult = await pool.query(
      'SELECT id, requires_activation_code, is_public FROM playlists WHERE id = $1',
      [playlistId]
    );

    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlist = playlistResult.rows[0];

    // For now, allow all users to view chat for public playlists
    // TODO: Add activation code check for protected playlists if needed

    const result = await pool.query(
      `SELECT cm.*, u.username 
       FROM chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.playlist_id = $1 AND cm.is_deleted = FALSE 
       ORDER BY cm.created_at DESC 
       LIMIT $2 OFFSET $3`,
      [playlistId, parseInt(limit), parseInt(offset)]
    );

    const messages = result.rows.map(msg => ({
      id: msg.id,
      playlistId: msg.playlist_id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      isDeleted: msg.is_deleted
    }));

    console.log('🔴 CHAT: Found', messages.length, 'messages');
    res.json({ messages: messages.reverse() }); // Reverse to show oldest first
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

app.post('/api/playlists/:playlistId/chat', authenticateToken, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    console.log('🔴 CHAT: Creating message for playlist:', playlistId, 'by user:', req.user.userId);

    // Check if playlist exists
    const playlistResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1',
      [playlistId]
    );

    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Insert the message
    const result = await pool.query(
      `INSERT INTO chat_messages (playlist_id, user_id, message) 
       VALUES ($1, $2, $3) RETURNING *`,
      [playlistId, req.user.userId, message.trim()]
    );

    // Get the message with username
    const messageResult = await pool.query(
      `SELECT cm.*, u.username 
       FROM chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.id = $1`,
      [result.rows[0].id]
    );

    const newMessage = messageResult.rows[0];
    const formattedMessage = {
      id: newMessage.id,
      playlistId: newMessage.playlist_id,
      userId: newMessage.user_id,
      username: newMessage.username,
      message: newMessage.message,
      createdAt: newMessage.created_at,
      updatedAt: newMessage.updated_at,
      isDeleted: newMessage.is_deleted
    };

    console.log('🔴 CHAT: Message created:', formattedMessage.id);
    res.status(201).json({ message: formattedMessage });
  } catch (error) {
    console.error('Error creating chat message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

app.delete('/api/playlists/:playlistId/chat/:messageId', authenticateToken, async (req, res) => {
  try {
    const { playlistId, messageId } = req.params;

    console.log('🔴 CHAT: Deleting message:', messageId, 'from playlist:', playlistId);

    // Check if user owns the message or is admin
    const messageResult = await pool.query(
      'SELECT user_id FROM chat_messages WHERE id = $1 AND playlist_id = $2',
      [messageId, playlistId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageOwnerId = messageResult.rows[0].user_id;
    
    // Check if user is admin
    const userResult = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    const isAdmin = userResult.rows[0]?.is_admin || false;

    if (messageOwnerId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    // Soft delete the message
    await pool.query(
      'UPDATE chat_messages SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1',
      [messageId]
    );

    console.log('🔴 CHAT: Message deleted:', messageId);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});


// ---------- SLIDESHOW CHAT ROUTES ----------
app.get('/api/slideshows/:slideshowId/chat', async (req, res) => {
  try {
    const { slideshowId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    console.log('🎬 SLIDESHOW_CHAT: Fetching messages for slideshow:', slideshowId);

    // Check if slideshow exists and is accessible
    const slideshowResult = await pool.query(
      'SELECT id, requires_activation_code, is_public FROM slideshows WHERE id = $1',
      [slideshowId]
    );

    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    const slideshow = slideshowResult.rows[0];

    // For now, allow all users to view chat for public slideshows
    // TODO: Add activation code check for protected slideshows if needed

    const result = await pool.query(
      `SELECT cm.*, u.username 
       FROM slideshow_chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.slideshow_id = $1 AND cm.is_deleted = FALSE 
       ORDER BY cm.created_at DESC 
       LIMIT $2 OFFSET $3`,
      [slideshowId, parseInt(limit), parseInt(offset)]
    );

    const messages = result.rows.map(msg => ({
      id: msg.id,
      slideshowId: msg.slideshow_id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      isDeleted: msg.is_deleted
    }));

    console.log('🎬 SLIDESHOW_CHAT: Found', messages.length, 'messages');
    res.json({ messages: messages.reverse() }); // Reverse to show oldest first
  } catch (error) {
    console.error('Error fetching slideshow chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

app.post('/api/slideshows/:slideshowId/chat', authenticateToken, async (req, res) => {
  try {
    const { slideshowId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    console.log('🎬 SLIDESHOW_CHAT: Creating message for slideshow:', slideshowId, 'by user:', req.user.userId);

    // Check if slideshow exists
    const slideshowResult = await pool.query(
      'SELECT id FROM slideshows WHERE id = $1',
      [slideshowId]
    );

    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    // Insert the message
    const result = await pool.query(
      `INSERT INTO slideshow_chat_messages (slideshow_id, user_id, message) 
       VALUES ($1, $2, $3) RETURNING *`,
      [slideshowId, req.user.userId, message.trim()]
    );

    // Get the message with username
    const messageResult = await pool.query(
      `SELECT cm.*, u.username 
       FROM slideshow_chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.id = $1`,
      [result.rows[0].id]
    );

    const newMessage = messageResult.rows[0];
    const formattedMessage = {
      id: newMessage.id,
      slideshowId: newMessage.slideshow_id,
      userId: newMessage.user_id,
      username: newMessage.username,
      message: newMessage.message,
      createdAt: newMessage.created_at,
      updatedAt: newMessage.updated_at,
      isDeleted: newMessage.is_deleted
    };

    console.log('🎬 SLIDESHOW_CHAT: Message created:', formattedMessage.id);
    res.status(201).json({ message: formattedMessage });
  } catch (error) {
    console.error('Error creating slideshow chat message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

app.delete('/api/slideshows/:slideshowId/chat/:messageId', authenticateToken, async (req, res) => {
  try {
    const { slideshowId, messageId } = req.params;

    console.log('🎬 SLIDESHOW_CHAT: Deleting message:', messageId, 'from slideshow:', slideshowId);

    // Check if user owns the message or is admin
    const messageResult = await pool.query(
      'SELECT user_id FROM slideshow_chat_messages WHERE id = $1 AND slideshow_id = $2',
      [messageId, slideshowId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageOwnerId = messageResult.rows[0].user_id;
    
    // Check if user is admin
    const userResult = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    const isAdmin = userResult.rows[0]?.is_admin || false;

    if (messageOwnerId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    // Soft delete the message
    await pool.query(
      'UPDATE slideshow_chat_messages SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1',
      [messageId]
    );

    console.log('🎬 SLIDESHOW_CHAT: Message deleted:', messageId);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting slideshow chat message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ---------- CHAT ENDPOINTS ----------

// Get universal chat messages
app.get('/api/chat/universal', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, filterType = 'all', userId, category, messageType } = req.query;
    
    console.log('🌍 UNIVERSAL_CHAT: Fetching messages with filters:', { 
      limit, offset, filterType, userId, category, messageType 
    });

    let query = `
      SELECT cm.*, u.username, u.id as user_id
      FROM universal_chat_messages cm 
      JOIN users u ON cm.user_id = u.id 
      WHERE cm.is_deleted = FALSE
    `;
    
    const queryParams = [];
    let paramIndex = 1;

    // Add filters
    if (filterType === 'user_store' && userId) {
      query += ` AND cm.user_id = $${paramIndex}`;
      queryParams.push(userId);
      paramIndex++;
    }
    
    if (filterType === 'category' && category) {
      query += ` AND cm.product_category = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }
    
    if (messageType) {
      query += ` AND cm.message_type = $${paramIndex}`;
      queryParams.push(messageType);
      paramIndex++;
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, queryParams);

    const messages = result.rows.map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      messageType: msg.message_type || 'general',
      category: msg.product_category,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at
    }));

    console.log('🌍 UNIVERSAL_CHAT: Found', messages.length, 'messages');
    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('🌍 UNIVERSAL_CHAT: Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

// Post universal chat message
app.post('/api/chat/universal', authenticateToken, async (req, res) => {
  try {
    const { message, messageType = 'general', relatedProductId, relatedStoreUserId, productCategory } = req.body;
    const userId = req.user.id;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    console.log('🌍 UNIVERSAL_CHAT: Posting message:', { 
      userId, message: message.trim(), messageType, productCategory 
    });

    const result = await pool.query(
      `INSERT INTO universal_chat_messages (user_id, message, message_type, product_category, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW()) 
       RETURNING *`,
      [userId, message.trim(), messageType, productCategory]
    );

    const newMessage = result.rows[0];

    // Get username for response
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    const username = userResult.rows[0]?.username || 'Unknown';

    const responseMessage = {
      id: newMessage.id,
      userId: newMessage.user_id,
      username: username,
      message: newMessage.message,
      messageType: newMessage.message_type,
      category: newMessage.product_category,
      createdAt: newMessage.created_at,
      updatedAt: newMessage.updated_at
    };

    console.log('🌍 UNIVERSAL_CHAT: Message posted successfully');
    res.json({ message: responseMessage });
  } catch (error) {
    console.error('🌍 UNIVERSAL_CHAT: Error posting message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// Delete universal chat message
app.delete('/api/chat/universal/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    console.log('🌍 UNIVERSAL_CHAT: Deleting message:', messageId, 'by user:', userId);

    // Check if message exists and belongs to user (or user is admin)
    const messageResult = await pool.query(
      'SELECT user_id FROM universal_chat_messages WHERE id = $1 AND is_deleted = FALSE',
      [messageId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageOwnerId = messageResult.rows[0].user_id;
    
    if (messageOwnerId !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await pool.query(
      'UPDATE universal_chat_messages SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1',
      [messageId]
    );

    console.log('🌍 UNIVERSAL_CHAT: Message deleted successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('🌍 UNIVERSAL_CHAT: Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Get chat categories
app.get('/api/chat/categories', authenticateToken, async (req, res) => {
  try {
    console.log('🌍 CHAT_CATEGORIES: Fetching categories');
    
    // Get distinct categories from universal chat messages
    const result = await pool.query(
      `SELECT DISTINCT product_category 
       FROM universal_chat_messages 
       WHERE product_category IS NOT NULL AND product_category != '' AND is_deleted = FALSE 
       ORDER BY product_category`
    );

    const categories = result.rows.map(row => row.product_category);
    
    // Add some default categories if none exist
    if (categories.length === 0) {
      categories.push('general', 'products', 'support', 'feedback');
    }

    console.log('🌍 CHAT_CATEGORIES: Found categories:', categories);
    res.json({ categories });
  } catch (error) {
    console.error('🌍 CHAT_CATEGORIES: Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch chat categories' });
  }
});

// ---------- PRODUCT LINKS ROUTES ----------

// Get product links for a playlist
app.get('/api/playlists/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.playlist_id = $1 AND pl.is_active = true
      ORDER BY pl.display_order, pl.created_at
    `, [id]);

    // Convert price from cents to dollars and format images
    const formattedLinks = result.rows.map(link => ({
      ...link,
      price: link.price ? (link.price / 100).toFixed(2) : null,
      image_url: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url
    }));

    res.json(formattedLinks);
  } catch (error) {
    console.error('❌ Get playlist product links error:', error);
    res.status(500).json({ error: 'Failed to get product links' });
  }
});

// Add product link to playlist
app.post('/api/playlists/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    console.log('🔗 PRODUCT_LINK: Adding product link:', { playlistId: id, productId, userId: req.user.userId });

    // Check if playlist exists and user owns it
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied' });
    }

    // Check if product exists and user owns it
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [productId, req.user.userId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    const product = productResult.rows[0];

    // Add link with product details
    const result = await pool.query(`
      INSERT INTO product_links (playlist_id, product_id, title, url, description, image_url, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM product_links WHERE playlist_id = $1))
      ON CONFLICT (playlist_id, product_id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      id, 
      productId, 
      product.name,
      `${process.env.FRONTEND_URL || 'http://localhost:8081'}/store/product/${productId}`,
      product.description || product.name,
      product.images && product.images.length > 0 ? product.images[0] : null
    ]);

    console.log('✅ PRODUCT_LINK: Product link created:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Add playlist product link error:', error);
    res.status(500).json({ error: 'Failed to add product link' });
  }
});

// Remove product link from playlist
app.delete('/api/playlists/:id/product-links/:productId', authenticateToken, async (req, res) => {
  try {
    const { id, productId } = req.params;
    
    console.log('🔗 PRODUCT_LINK: Removing product link:', { playlistId: id, productId, userId: req.user.userId });

    // Check if playlist exists and user owns it
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied' });
    }

    // Remove link
    const result = await pool.query(`
      DELETE FROM product_links 
      WHERE playlist_id = $1 AND product_id = $2 RETURNING *
    `, [id, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    console.log('✅ PRODUCT_LINK: Product link removed:', result.rows[0]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Remove playlist product link error:', error);
    res.status(500).json({ error: 'Failed to remove product link' });
  }
});

// ---------- SLIDESHOW PRODUCT LINKS ROUTES ----------

// Get product links for a slideshow
app.get('/api/slideshows/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Getting product links for slideshow:', id);
    
    const result = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.slideshow_id = $1 AND pl.is_active = true
      ORDER BY pl.display_order, pl.created_at
    `, [id]);

    // Convert price from cents to dollars and format images
    const formattedLinks = result.rows.map(link => ({
      ...link,
      price: link.price ? (link.price / 100).toFixed(2) : null,
      image_url: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url
    }));

    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Found', formattedLinks.length, 'product links');
    res.json(formattedLinks);
  } catch (error) {
    console.error('❌ Get slideshow product links error:', error);
    res.status(500).json({ error: 'Failed to get product links' });
  }
});

// Add product link to slideshow
app.post('/api/slideshows/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Adding product link:', { slideshowId: id, productId, userId: req.user.userId });

    // Check if slideshow exists and user owns it
    const slideshowResult = await pool.query('SELECT * FROM slideshows WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found or access denied' });
    }

    // Check if product exists and user owns it
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [productId, req.user.userId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    const product = productResult.rows[0];

    // Add link with product details
    const result = await pool.query(`
      INSERT INTO product_links (slideshow_id, product_id, title, url, description, image_url, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM product_links WHERE slideshow_id = $1))
      ON CONFLICT (slideshow_id, product_id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      id, 
      productId, 
      product.name,
      `${process.env.FRONTEND_URL || 'http://localhost:8081'}/store/product/${productId}`,
      product.description || product.name,
      product.images && product.images.length > 0 ? product.images[0] : null
    ]);

    console.log('✅ SLIDESHOW_PRODUCT_LINK: Product link created:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Add slideshow product link error:', error);
    res.status(500).json({ error: 'Failed to add product link' });
  }
});

// Remove product link from slideshow
app.delete('/api/slideshows/:id/product-links/:productId', authenticateToken, async (req, res) => {
  try {
    const { id, productId } = req.params;
    
    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Removing product link:', { slideshowId: id, productId, userId: req.user.userId });

    // Check if slideshow exists and user owns it
    const slideshowResult = await pool.query('SELECT * FROM slideshows WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found or access denied' });
    }

    // Remove link
    const result = await pool.query(`
      DELETE FROM product_links 
      WHERE slideshow_id = $1 AND product_id = $2 RETURNING *
    `, [id, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    console.log('✅ SLIDESHOW_PRODUCT_LINK: Product link removed:', result.rows[0]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Remove slideshow product link error:', error);
    res.status(500).json({ error: 'Failed to remove product link' });
  }
});

// ---------- WEB ROUTES FOR QR CODE SCANNING ----------
// These routes serve HTML pages for people who scan QR codes but don't have the app

// Test route to verify deployment
app.get('/test-route', (req, res) => {
  res.send('Test route working! Deployment timestamp: ' + new Date().toISOString());
});
// Media player route - serve the specific HTML file for this route
app.get('/media-player/:id', (req, res) => {
  const { id } = req.params;
  console.log('🎬 MEDIA_PLAYER: Serving media player HTML for ID:', id);
  
  // Serve the specific media player HTML file
  const mediaPlayerPath = path.join(__dirname, '../../dist/media-player/[id].html');
  console.log('🎬 MEDIA_PLAYER: Serving file:', mediaPlayerPath);
  
  res.sendFile(mediaPlayerPath, (err) => {
    if (err) {
      console.error('🎬 MEDIA_PLAYER: Error serving media player HTML:', err);
      // Fallback to index.html if the specific file doesn't exist
      res.sendFile(path.join(__dirname, '../../dist/index.html'), (fallbackErr) => {
        if (fallbackErr) {
          console.error('🎬 MEDIA_PLAYER: Error serving fallback index.html:', fallbackErr);
          res.status(500).json({ error: 'Error serving media player' });
        }
      });
    }
  });
});

// Generate HTML media player page
function generateMediaPlayerHTML(playlist) {
  const mediaFiles = playlist.mediaFiles || [];  // Fixed: use mediaFiles not media_files
  const mediaList = mediaFiles.map(file => ({
    id: file.id,
    title: file.title,
    url: `${process.env.BASE_URL || 'https://merchtech5-production.up.railway.app'}/api/media/${file.id}/stream`,
    type: file.fileType,  // Fixed: use fileType not file_type
    contentType: file.contentType  // Fixed: use contentType not content_type
  }));

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${playlist.name} - MerchTech</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
        }
        
        .container {
          max-width: 800px;
          width: 100%;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 30px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        h1 {
          text-align: center;
          margin-bottom: 30px;
          font-size: 2.5em;
          font-weight: 700;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .media-player {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 15px;
          padding: 20px;
          margin-bottom: 20px;
  }
        
        .current-track {
          text-align: center;
          margin-bottom: 20px;
        }
        
        .track-title {
          font-size: 1.5em;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .track-info {
          opacity: 0.8;
          font-size: 0.9em;
        }
        
        .media-element {
          width: 100%;
          border-radius: 10px;
          margin-bottom: 15px;
          background: black;
        }
        
        .controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 20px;
          margin-bottom: 20px;
        }
        
        .control-btn {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          color: white;
          font-size: 1.5em;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .control-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.05);
        }
        
        .play-btn {
          background: #007AFF;
          width: 60px;
          height: 60px;
          font-size: 1.8em;
        }
        
        .play-btn:hover {
          background: #0056CC;
        }
        
        .progress-container {
          margin-bottom: 20px;
        }
        
        .progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
          overflow: hidden;
          cursor: pointer;
        }
        
        .progress-fill {
          height: 100%;
          background: #007AFF;
          width: 0%;
          transition: width 0.1s ease;
        }
        
        .time-display {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 0.9em;
          opacity: 0.8;
        }
        
        .playlist {
          margin-top: 30px;
        }
        
        .playlist-title {
          font-size: 1.3em;
          font-weight: 600;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .track-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          }
        
          .track-item { 
          background: rgba(255, 255, 255, 0.1);
            padding: 15px; 
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 15px;
          }
        
        .track-item:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        .track-item.active {
          background: rgba(0, 122, 255, 0.3);
          border: 2px solid #007AFF;
        }
        
          .track-number { 
          background: rgba(255, 255, 255, 0.2);
            width: 30px; 
            height: 30px; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
          font-weight: 600;
          font-size: 0.9em;
          }
        
        .track-details {
          flex: 1;
        }
        
        .track-name {
          font-weight: 600;
          margin-bottom: 5px;
        }
        
        .track-type {
          font-size: 0.8em;
          opacity: 0.7;
          text-transform: uppercase;
        }
        
        .loading {
            text-align: center;
          padding: 20px;
          opacity: 0.7;
        }
        
        .error {
          background: rgba(220, 38, 38, 0.2);
          color: #fca5a5;
            padding: 15px; 
            border-radius: 10px; 
            text-align: center;
          margin-bottom: 20px;
        }
        
        @media (max-width: 768px) {
          .container {
            padding: 20px; 
          }
          
          h1 {
            font-size: 2em;
          }
          
          .controls {
            gap: 15px;
          }
          
          .control-btn {
            width: 45px;
            height: 45px;
            font-size: 1.3em;
          }
          
          .play-btn {
            width: 55px;
            height: 55px;
            font-size: 1.6em;
          }
          }
        </style>
      </head>
      <body>
        <div class="container">
        <h1>${playlist.name}</h1>
        
        <div class="media-player">
          <div class="current-track">
            <div class="track-title" id="currentTitle">Select a track to play</div>
            <div class="track-info" id="currentInfo">Choose from ${mediaFiles.length} tracks</div>
          </div>

          <div id="mediaContainer">
            <div class="loading">Click a track below to start playing</div>
              </div>
          
          <div class="controls">
            <button class="control-btn" id="prevBtn" onclick="previousTrack()">⏮</button>
            <button class="control-btn play-btn" id="playBtn" onclick="togglePlay()">▶</button>
            <button class="control-btn" id="nextBtn" onclick="nextTrack()">⏭</button>
            </div>

          <div class="progress-container">
            <div class="progress-bar" id="progressBar" onclick="seek(event)">
              <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="time-display">
              <span id="currentTime">0:00</span>
              <span id="totalTime">0:00</span>
            </div>
          </div>
            </div>

        <div class="playlist">
          <div class="playlist-title">Playlist (${mediaFiles.length} tracks)</div>
          <div class="track-list">
            ${mediaList.map((file, index) => `
              <div class="track-item" onclick="loadTrack(${index})">
                  <div class="track-number">${index + 1}</div>
                <div class="track-details">
                  <div class="track-name">${file.title}</div>
                  <div class="track-type">${file.type || 'media'}</div>
                </div>
              </div>
              `).join('')}
          </div>
          </div>
        </div>

        <script>
        const mediaFiles = ${JSON.stringify(mediaList)};
        let currentTrack = 0;
        let isPlaying = false;
        let currentMedia = null;

        function loadTrack(index) {
          if (index < 0 || index >= mediaFiles.length) return;
          
          currentTrack = index;
          const file = mediaFiles[index];
          
          // Update UI
          document.getElementById('currentTitle').textContent = file.title;
          document.getElementById('currentInfo').textContent = \`Track \${index + 1} of \${mediaFiles.length}\`;
          
          // Update active track in playlist
          document.querySelectorAll('.track-item').forEach((item, i) => {
            item.classList.toggle('active', i === index);
          });
          
          // Create media element
          const mediaContainer = document.getElementById('mediaContainer');
          mediaContainer.innerHTML = '';
          
          if (file.type === 'video' || file.contentType?.startsWith('video/')) {
            currentMedia = document.createElement('video');
            currentMedia.controls = true;
            currentMedia.className = 'media-element';
            currentMedia.style.width = '100%';
            currentMedia.style.height = 'auto';
            currentMedia.style.maxHeight = '400px';
          } else {
            currentMedia = document.createElement('audio');
            currentMedia.controls = true;
            currentMedia.className = 'media-element';
            currentMedia.style.width = '100%';
          }
          
          currentMedia.src = file.url;
          currentMedia.onloadedmetadata = () => {
            updateTimeDisplay();
          };
          
          currentMedia.ontimeupdate = () => {
            updateProgress();
          };
          
          currentMedia.onended = () => {
            nextTrack();
          };
          
          currentMedia.onplay = () => {
            isPlaying = true;
            updatePlayButton();
          };
          
          currentMedia.onpause = () => {
            isPlaying = false;
            updatePlayButton();
          };
          
          mediaContainer.appendChild(currentMedia);
          
          // Auto-play after loading
          setTimeout(() => {
            if (currentMedia) {
              currentMedia.play();
            }
          }, 100);
        }
        
        function togglePlay() {
          if (!currentMedia) {
            if (mediaFiles.length > 0) {
              loadTrack(0);
            }
              return;
            }

          if (isPlaying) {
            currentMedia.pause();
            } else {
            currentMedia.play();
          }
        }
        
        function previousTrack() {
          const prevIndex = currentTrack > 0 ? currentTrack - 1 : mediaFiles.length - 1;
          loadTrack(prevIndex);
          }

        function nextTrack() {
          const nextIndex = currentTrack < mediaFiles.length - 1 ? currentTrack + 1 : 0;
          loadTrack(nextIndex);
        }
        
        function updatePlayButton() {
          const playBtn = document.getElementById('playBtn');
          playBtn.textContent = isPlaying ? '⏸' : '▶';
        }
        
        function updateProgress() {
          if (!currentMedia) return;
          
          const progress = (currentMedia.currentTime / currentMedia.duration) * 100;
          document.getElementById('progressFill').style.width = progress + '%';
          
          updateTimeDisplay();
          }

        function updateTimeDisplay() {
          if (!currentMedia) return;
          
          const current = formatTime(currentMedia.currentTime);
          const total = formatTime(currentMedia.duration);
          
          document.getElementById('currentTime').textContent = current;
          document.getElementById('totalTime').textContent = total;
        }
        
        function formatTime(seconds) {
          if (isNaN(seconds)) return '0:00';
          const mins = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          return mins + ':' + secs.toString().padStart(2, '0');
        }
        
        function seek(event) {
          if (!currentMedia) return;
          
          const progressBar = document.getElementById('progressBar');
          const rect = progressBar.getBoundingClientRect();
          const pos = (event.clientX - rect.left) / rect.width;
          currentMedia.currentTime = pos * currentMedia.duration;
          }

        // Initialize with first track if available
        if (mediaFiles.length > 0) {
          // Don't auto-load, let user choose
          document.getElementById('currentTitle').textContent = 'Ready to play';
          document.getElementById('currentInfo').textContent = 'Choose any track below to start';
        }
        </script>
      </body>
      </html>
    `;
}

// REMOVED: app.get('/playlist-access/:id') - This was interfering with React Native app's client-side routing
// The React Native app handles this route through app/(public)/playlist-access/[id].tsx

// This must be the last non-error-handling route
app.get('*', (req, res) => {
  // If the request path looks like an API call, it means no API route was matched,
  // so we should send a 404 instead of the web app.
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  // For any other route, serve the main index.html file.
  // This allows the React Native web app's router to handle the path.
  console.log(`🌐 WEB: Serving index.html for non-API route: ${req.path}`);
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) {
      console.error(`❌ WEB_SERVE_ERROR: Could not send index.html for path ${req.path}:`, err);
      // Check if the file doesn't exist, which likely means the web app wasn't built.
      if (err.code === 'ENOENT') {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
            <title>500 - Server Configuration Error</title>
            <style>body { font-family: sans-serif; text-align: center; padding-top: 50px; }</style>
      </head>
      <body>
            <h1>Error 500: Server Misconfiguration</h1>
            <p>The application's web files (dist/index.html) could not be found.</p>
            <p>This usually means the <code>npm run build</code> or <code>expo export -p web</code> command was not run during deployment.</p>
      </body>
      </html>
    `);
      } else {
        res.status(500).send('Error serving the application.');
      }
    }
  });
});


// Database fix function - runs on startup
async function fixActivationCodes() {
  try {
    console.log('🔧 STARTUP: Checking activation code linkages...');
    
    // Fix EJ1EUFKRFG9H to point to DJKINGCAKE CHAIN
    const djkingcakeResult = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM slideshow_images WHERE slideshow_id = s.id) as image_count
       FROM slideshows s 
       WHERE s.name ILIKE '%DJKINGCAKE CHAIN%'`
    );
    
    if (djkingcakeResult.rows.length > 0) {
      const djkingcake = djkingcakeResult.rows[0];
      console.log(`🎯 Found DJKINGCAKE CHAIN slideshow: ID ${djkingcake.id} with ${djkingcake.image_count} images`);
      
      // Update EJ1EUFKRFG9H to point to DJKINGCAKE CHAIN
      const updateResult = await pool.query(
        `UPDATE activation_codes 
         SET slideshow_id = $1, playlist_id = NULL
         WHERE code = $2 
         RETURNING *`,
        [djkingcake.id, 'EJ1EUFKRFG9H']
      );
      
      if (updateResult.rows.length > 0) {
        console.log('✅ FIXED: EJ1EUFKRFG9H now points to DJKINGCAKE CHAIN');
      } else {
        console.log('⚠️ WARNING: EJ1EUFKRFG9H activation code not found in database');
      }
      
      // Fix KCCISPOYSQSB to point to DJKINGCAKE CHAIN as well
      const updateResult2 = await pool.query(
        `UPDATE activation_codes 
         SET slideshow_id = $1, playlist_id = NULL
         WHERE code = $2 
         RETURNING *`,
        [djkingcake.id, 'KCCISPOYSQSB']
      );
      
      if (updateResult2.rows.length > 0) {
        console.log('✅ FIXED: KCCISPOYSQSB now points to DJKINGCAKE CHAIN');
      }
    } else {
      console.log('⚠️ WARNING: DJKINGCAKE CHAIN slideshow not found');
    }
    
    console.log('🔧 STARTUP: Activation code fixes complete');
    
  } catch (error) {
    console.error('❌ STARTUP: Error fixing activation codes:', error);
  }
}

// --- SERVER START ---
const server = app.listen(PORT, '0.0.0.0', async () => {
  const address = server.address();
  console.log(`✅ Server listening on http://${address.address}:${address.port}`);
  console.log(`🚀 To test locally, open http://localhost:${PORT}`);
  
  // Run database fixes on startup
  await fixActivationCodes();
});

// 🔧 INCREASE SERVER TIMEOUT FOR LARGE UPLOADS
server.timeout = 10 * 60 * 1000; // 10 minutes timeout
server.keepAliveTimeout = 10 * 60 * 1000; // 10 minutes keep-alive
server.headersTimeout = 10 * 60 * 1000; // 10 minutes headers timeout

console.log(`🔧 Server timeouts set to 10 minutes for large uploads`);