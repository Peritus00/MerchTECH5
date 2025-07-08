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
  s3Service = new s3Module.S3Service();
  console.log('✅ S3 service loaded and instantiated successfully');
  console.log('   AWS Region:', process.env.AWS_REGION);
  console.log('   S3 Bucket:', process.env.AWS_S3_BUCKET_NAME);
  console.log('   AWS Access Key:', process.env.AWS_ACCESS_KEY_ID ? 'Configured' : 'Missing');
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

// 🔒 CORS CONFIGURATION - ALLOW CUSTOM DOMAIN
const corsOptions = {
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json());

// 🔒 SECURITY HEADERS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Handle preflight requests
app.options('*', cors(corsOptions));

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

// Email configuration - Brevo/SendinBlue
const createTransporter = () => {
  // Check if we have Brevo SMTP key configured
  if (process.env.BREVO_SMTP_KEY) {
    console.log('✅ Using Brevo email service');
    return nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: '8e773a002@smtp-brevo.com', // Your Brevo SMTP user
        pass: process.env.BREVO_SMTP_KEY
      }
    });
  } else {
    console.log('⚠️ Brevo SMTP key not configured. Using test account.');
    // For testing - create a test account
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: 'test@ethereal.email',
        pass: 'test123'
      }
    });
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, username) => {
  try {
    const transporter = createTransporter();
    
    const resetUrl = `https://app.merchtech.net/auth/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.BREVO_SMTP_KEY ? 'noreply@merchtech.net' : 'test@ethereal.email',
      to: email,
      subject: 'MerchTech - Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">MerchTech Password Reset</h2>
          <p>Hello ${username || 'there'},</p>
          <p>You requested a password reset for your MerchTech account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This email was sent from MerchTech. If you have any questions, please contact support.
          </p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    return false;
  }
};

// Forgot Password endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    const result = await pool.query('SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({ message: 'If the email exists, a password reset link has been sent.' });
    }
    
    const user = result.rows[0];
    const resetToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    
    // Store reset token in database
    await pool.query('UPDATE users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL \'1 hour\' WHERE id = $2', [resetToken, user.id]);
    
    // Send email
    const emailSent = await sendPasswordResetEmail(user.email, resetToken, user.username);
    
    if (emailSent) {
      res.json({ message: 'Password reset link sent to your email' });
    } else {
      // If email fails, still return success but log the issue
      console.error('⚠️ Email failed but token was generated for:', user.email);
      res.json({ 
        message: 'Password reset link sent to your email',
        resetToken: resetToken // Only include in development/testing
      });
    }
  } catch (error) {
    console.error('🔴 FORGOT PASSWORD ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset Password endpoint
app.post('/api/auth/reset-password', async (req, res) => {
  console.log('🚨 RESET PASSWORD ENDPOINT CALLED!');
  res.setHeader('X-Debug', 'Endpoint called');
  try {
    console.log('🔍 RESET PASSWORD DEBUG - FULL REQUEST:');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('Raw request body keys:', Object.keys(req.body));
    console.log('🚨 FIRST PARAMETER VALUE:', req.body.token || req.body.password || 'NOT FOUND');
    
    const { token, newPassword, password } = req.body;
    
    // Handle both parameter names for backward compatibility
    const actualPassword = newPassword || password;
    const actualToken = token;
    
    if (!actualToken || !actualPassword) {
      console.log('❌ Missing parameters:', { hasToken: !!actualToken, hasPassword: !!actualPassword });
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    console.log('🔍 RESET PASSWORD DEBUG:');
    console.log('Token received:', actualToken ? actualToken.substring(0, 20) + '...' : 'null');
    console.log('Token length:', actualToken ? actualToken.length : 0);
    console.log('Password received:', actualPassword ? actualPassword.substring(0, 10) + '...' : 'null');
    
    // Decode URL-encoded token if needed
    let decodedToken = actualToken;
    try {
      decodedToken = decodeURIComponent(actualToken);
      console.log('Token after URL decode:', decodedToken.substring(0, 20) + '...');
    } catch (e) {
      console.log('Token was not URL-encoded, using as-is');
    }
    
    // Verify token
    const decoded = jwt.verify(decodedToken, JWT_SECRET);
    if (!decoded.userId) return res.status(400).json({ error: 'Invalid reset token' });
    
    // Check if token exists and is not expired in database
    const result = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND reset_token = $2 AND reset_token_expires > NOW()',
      [decoded.userId, decodedToken]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    // Hash new password and update
    const hashedPassword = await bcrypt.hash(actualPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, decoded.userId]
    );
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('🔴 RESET PASSWORD ERROR:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Invalid reset token' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify Email endpoint
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token is required' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.userId) return res.status(400).json({ error: 'Invalid verification token' });
    
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [decoded.userId]);
    
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('🔴 VERIFY EMAIL ERROR:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Invalid verification token' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile endpoint
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, is_admin, subscription_tier, max_audio_files, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('🔴 GET PROFILE ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile endpoint
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { username, email } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (username) {
      updates.push(`username = $${paramCount}`);
      values.push(username);
      paramCount++;
    }
    
    if (email) {
      updates.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(req.user.userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, email, username, is_admin`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('🔴 UPDATE PROFILE ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// S3 Presigned URL generation endpoint
app.post('/api/upload/presigned', authenticateToken, async (req, res) => {
  try {
    const { fileName, contentType, fileSize } = req.body;
    
    if (!fileName || !contentType) {
      return res.status(400).json({ error: 'fileName and contentType are required' });
    }

    if (!s3Service) {
      return res.status(500).json({ error: 'S3 service not configured' });
    }

    const { uploadUrl, fileUrl, key } = await s3Service.getPresignedUploadUrl(
      fileName, 
      contentType, 
      req.user.userId, 
      fileSize
    );

    res.json({ uploadUrl, fileUrl, key });
  } catch (error) {
    console.error('❌ Presigned URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// S3 Direct upload endpoint (for smaller files)
app.post('/api/upload/s3', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!s3Service) {
      return res.status(500).json({ error: 'S3 service not configured' });
    }

    const { originalname, mimetype, buffer, size } = req.file;
    
    const fileUrl = await s3Service.uploadFile(
      buffer,
      originalname,
      mimetype,
      req.user.userId
    );

    res.json({ 
      fileUrl,
      fileName: originalname,
      contentType: mimetype,
      fileSize: size
    });
  } catch (error) {
    console.error('❌ S3 upload error:', error);
    res.status(500).json({ error: 'Failed to upload file to S3' });
  }
});

// Legacy upload endpoint (for backward compatibility)
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl: fileUrl });
});

// S3 Signed URL for file access
app.post('/api/media/signed-url', authenticateToken, async (req, res) => {
  try {
    const { fileUrl, expiresIn = 3600 } = req.body;
    
    if (!fileUrl) {
      return res.status(400).json({ error: 'fileUrl is required' });
    }

    if (!s3Service) {
      return res.status(500).json({ error: 'S3 service not configured' });
    }

    const key = s3Service.extractKeyFromUrl(fileUrl);
    if (!key) {
      return res.status(400).json({ error: 'Invalid S3 file URL' });
    }

    const signedUrl = await s3Service.getSignedUrl(key, expiresIn);
    res.json({ signedUrl });
  } catch (error) {
    console.error('❌ Signed URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
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

// Get signed URL for S3 file access
app.get('/api/media/:id/signed-url', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresIn = 3600 } = req.query; // Default 1 hour

    const mediaResult = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const media = mediaResult.rows[0];
    
    // Check permissions
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    const isAdmin = userResult.rows[0]?.is_admin;
    if (media.user_id !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // If it's an S3 URL, generate a signed URL
    if (media.url && media.url.includes('amazonaws.com') && s3Service) {
      const key = s3Service.extractKeyFromUrl(media.url);
      if (key) {
        const signedUrl = await s3Service.getSignedUrl(key, parseInt(expiresIn));
        return res.json({ signedUrl, expiresIn: parseInt(expiresIn) });
      }
    }

    // If not S3 or no key found, return the original URL
    res.json({ url: media.url });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ error: 'Failed to generate signed URL' });
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

    // If it's an S3 file, delete it from S3 as well
    if (media.url && media.url.includes('amazonaws.com') && s3Service) {
      const key = s3Service.extractKeyFromUrl(media.url);
      if (key) {
        try {
          await s3Service.deleteFile(key);
          console.log(`🗑️ Deleted S3 file: ${key}`);
        } catch (s3Error) {
          console.error('⚠️ Failed to delete S3 file:', s3Error);
          // Continue with database deletion even if S3 deletion fails
        }
      }
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
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'codes');
    res.json(result.rows);
  } catch (error) {
    console.error('🔴 ACTIVATION_CODES ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
  }
});

app.get('/api/activation-codes/my-access', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching user access codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name,
              'playlist' as content_type
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.used_by = $1
       ORDER BY ac.used_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'access codes');
    res.json(result.rows);
  } catch (error) {
    console.error('🔴 ACTIVATION_CODES ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch access codes' });
  }
});

// ---------- MISSING CRITICAL ENDPOINTS ----------

// Send verification email
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

    const verificationUrl = `${process.env.FRONTEND_URL || 'https://merchtech-server-c37xiap81-perrie-bentons-projects.vercel.app'}/auth/verify?token=${verificationToken}`;

    await transporter.sendMail({
      from: '"MerchTech QR" <help@merchtech.net>',
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

// Verify email with token
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

    res.redirect(`${process.env.FRONTEND_URL || 'https://merchtech-server-c37xiap81-perrie-bentons-projects.vercel.app'}/auth/verification-success`);

  } catch (error) {
    console.error('🔴 VERIFY EMAIL ERROR:', error);
    res.status(400).json({ error: 'Invalid or expired verification token.' });
  }
});

// Create product
app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, description, price, metadata, stripe_product_id } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const result = await pool.query(
      `INSERT INTO products (user_id, name, description, price, metadata, stripe_product_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [req.user.userId, name, description, price, metadata, stripe_product_id]
    );

    console.log('✅ Product created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('🔴 CREATE PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
app.patch('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, metadata, stripe_product_id } = req.body;

    const result = await pool.query(
      `UPDATE products 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           metadata = COALESCE($4, metadata),
           stripe_product_id = COALESCE($5, stripe_product_id),
           updated_at = NOW()
       WHERE id = $6 AND user_id = $7 AND is_deleted = false
       RETURNING *`,
      [name, description, price, metadata, stripe_product_id, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log('✅ Product updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 UPDATE PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE products SET is_deleted = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_deleted = false
       RETURNING id`,
      [id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log('✅ Product deleted:', id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('🔴 DELETE PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Create playlist
app.post('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const { name, description, is_public } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      `INSERT INTO playlists (user_id, name, description, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [req.user.userId, name, description, is_public || false]
    );

    console.log('✅ Playlist created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('🔴 CREATE PLAYLIST ERROR:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// Update playlist
app.patch('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_public } = req.body;

    const result = await pool.query(
      `UPDATE playlists 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_public = COALESCE($3, is_public),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, description, is_public, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    console.log('✅ Playlist updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 UPDATE PLAYLIST ERROR:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

// Delete playlist
app.delete('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM playlists WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    console.log('✅ Playlist deleted:', id);
    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('🔴 DELETE PLAYLIST ERROR:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Create QR code
app.post('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    const { name, url, playlist_id, slideshow_id, metadata } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const result = await pool.query(
      `INSERT INTO qr_codes (user_id, name, url, playlist_id, slideshow_id, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [req.user.userId, name, url, playlist_id, slideshow_id, metadata]
    );

    console.log('✅ QR code created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('🔴 CREATE QR CODE ERROR:', error);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});

// Update QR code
app.patch('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, playlist_id, slideshow_id, metadata } = req.body;

    const result = await pool.query(
      `UPDATE qr_codes 
       SET name = COALESCE($1, name),
           url = COALESCE($2, url),
           playlist_id = COALESCE($3, playlist_id),
           slideshow_id = COALESCE($4, slideshow_id),
           metadata = COALESCE($5, metadata),
           updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, url, playlist_id, slideshow_id, metadata, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    console.log('✅ QR code updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 UPDATE QR CODE ERROR:', error);
    res.status(500).json({ error: 'Failed to update QR code' });
  }
});

// Delete QR code
app.delete('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM qr_codes WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    console.log('✅ QR code deleted:', id);
    res.json({ message: 'QR code deleted successfully' });
  } catch (error) {
    console.error('🔴 DELETE QR CODE ERROR:', error);
    res.status(500).json({ error: 'Failed to delete QR code' });
  }
});

// Create slideshow
app.post('/api/slideshows', authenticateToken, async (req, res) => {
  try {
    const { name, description, is_public } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      `INSERT INTO slideshows (user_id, name, description, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [req.user.userId, name, description, is_public || false]
    );

    console.log('✅ Slideshow created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('🔴 CREATE SLIDESHOW ERROR:', error);
    res.status(500).json({ error: 'Failed to create slideshow' });
  }
});

// Update slideshow
app.patch('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_public } = req.body;

    const result = await pool.query(
      `UPDATE slideshows 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_public = COALESCE($3, is_public),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, description, is_public, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    console.log('✅ Slideshow updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 UPDATE SLIDESHOW ERROR:', error);
    res.status(500).json({ error: 'Failed to update slideshow' });
  }
});

// Delete slideshow
app.delete('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM slideshows WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    console.log('✅ Slideshow deleted:', id);
    res.json({ message: 'Slideshow deleted successfully' });
  } catch (error) {
    console.error('🔴 DELETE SLIDESHOW ERROR:', error);
    res.status(500).json({ error: 'Failed to delete slideshow' });
  }
});

// ---------- ADMIN ENDPOINTS ----------

app.get('/api/admin/all-users', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('👥 ADMIN: Fetching all users');
    const result = await pool.query(
      `SELECT id, email, username, subscription_tier, is_admin, is_suspended,
              max_products, max_audio_files, max_playlists, max_qr_codes, 
              max_slideshows, max_videos, max_activation_codes, created_at, updated_at
       FROM users 
       ORDER BY created_at DESC`
    );
    
    console.log('👥 ADMIN: Found', result.rows.length, 'users');
    res.json(result.rows);
  } catch (error) {
    console.error('🔴 ADMIN ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
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

// Temporary migration endpoint
app.post('/api/migrate', async (req, res) => {
  try {
    console.log('🔧 Running database migration...');
    
    const migrationSQL = `
      -- Add missing columns to products table for Stripe integration
      ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

      -- Add missing columns to users table for admin permissions
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_audio_files INTEGER DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_playlists INTEGER DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_qr_codes INTEGER DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_slideshows INTEGER DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_videos INTEGER DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_activation_codes INTEGER DEFAULT NULL;

      -- Add missing columns to qr_codes table
      ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;
      ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE SET NULL;
      ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

      -- Add missing columns to slideshows table
      ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
      ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS audio_url TEXT;

      -- Add missing columns to playlists table
      ALTER TABLE playlists ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

      -- Add missing columns to activation_codes table
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS used_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS used_at TIMESTAMP DEFAULT NULL;
    `;
    
    const statements = migrationSQL.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('🔧 Executing:', statement.trim().substring(0, 50) + '...');
        await pool.query(statement);
      }
    }
    
    console.log('✅ Migration completed successfully!');
    res.json({ message: 'Migration completed successfully' });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ error: 'Migration failed: ' + error.message });
  }
});

// Ensure the app listens on process.env.PORT
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
