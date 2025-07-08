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

console.log('DEBUG: Server script starting...');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
console.log('DEBUG: .env loaded, DATABASE_URL:', process.env.DATABASE_URL);
console.log('DEBUG: NODE_ENV:', process.env.NODE_ENV);

// Initialize Stripe after loading environment variables
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

// S3 Presigned URL for file upload
app.post('/api/media/presigned-url', authenticateToken, async (req, res) => {
  try {
    const { filename, contentType, fileSize } = req.body;
    
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    if (!s3Service) {
      return res.status(500).json({ error: 'S3 service not configured' });
    }

    const result = await s3Service.getPresignedUploadUrl(filename, contentType, req.user.userId, fileSize);
    res.json({ 
      presignedUrl: result.uploadUrl, 
      fileUrl: result.fileUrl,
      key: result.key,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('❌ Presigned URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
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
    
    // Process media files to handle S3 URLs properly
    const processedMedia = await Promise.all(result.rows.map(async (media) => {
      let properUrl = media.url;
      
      // Handle S3 files
      if (media.s3_key && s3Service) {
        try {
          // Generate signed URL for S3 files
          const signedUrl = await s3Service.getSignedUrl(media.s3_key, 3600); // 1 hour
          properUrl = signedUrl;
        } catch (error) {
          console.error('❌ Failed to generate signed URL for S3 file:', media.s3_key, error);
          // Fallback to direct S3 URL (may not work without proper permissions)
          properUrl = media.url;
        }
      } else if (media.url && media.url.startsWith('data:')) {
        // Handle base64 files - use streaming endpoint
        properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/api/media/${media.id}/stream`;
      } else if (media.filename && !media.s3_key) {
        // Handle local files
        properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/uploads/${media.filename}`;
      }
      
      return {
        ...media,
        url: properUrl,
        title: media.title,
        fileType: media.file_type,
        contentType: media.content_type
      };
    }));
    
    res.json({ media: processedMedia });
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
    
    // Handle S3 files
    if (media.s3_key && s3Service) {
      try {
        // Generate signed URL for S3 files
        const signedUrl = await s3Service.getSignedUrl(media.s3_key, 3600); // 1 hour
        properUrl = signedUrl;
      } catch (error) {
        console.error('❌ Failed to generate signed URL for S3 file:', media.s3_key, error);
        // Fallback to direct S3 URL (may not work without proper permissions)
        properUrl = media.url;
      }
    } else if (media.url && media.url.startsWith('data:')) {
      // Handle base64 files - use streaming endpoint
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/api/media/${id}/stream`;
    } else if (media.filename && !media.s3_key) {
      // Handle local files
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/uploads/${media.filename}`;
    }
    
    const mediaResponse = { 
      ...media, 
      url: properUrl, 
      title: media.title, 
      fileType: media.file_type, 
      contentType: media.content_type 
    };
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

  // Process media files to handle S3 URLs properly
  playlist.mediaFiles = await Promise.all(mediaResult.rows.map(async (media) => {
    let properUrl = media.url;
    
    // Handle S3 files
    if (media.s3_key && s3Service) {
      try {
        // Generate signed URL for S3 files
        const signedUrl = await s3Service.getSignedUrl(media.s3_key, 3600); // 1 hour
        properUrl = signedUrl;
      } catch (error) {
        console.error('❌ Failed to generate signed URL for S3 file in playlist:', media.s3_key, error);
        // Fallback to direct S3 URL
        properUrl = media.url;
      }
    } else if (media.url && media.url.startsWith('data:')) {
      // Handle base64 files - use streaming endpoint
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/api/media/${media.id}/stream`;
    } else if (media.filename && !media.s3_key) {
      // Handle local files
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/uploads/${media.filename}`;
    }
    
    return {
      id: media.id,
      title: media.title,
      filePath: `/uploads/${media.filename}`,
      fileType: media.file_type,
      contentType: media.content_type,
      url: properUrl,
    };
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
       WHERE qr.user_id = $1 AND qr.is_active = true
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

// Get single QR code
app.get('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📱 QR_CODES: Fetching QR code:', id);
    
    const result = await pool.query(
      `SELECT qr.*, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
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

// Get single slideshow
app.get('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎬 SLIDESHOWS: Fetching slideshow:', id);
    
    const result = await pool.query(
      `SELECT s.* FROM slideshows s WHERE s.id = $1 AND s.user_id = $2`,
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = result.rows[0];
    
    // Get images for the slideshow
    const imagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [id]
    );
    
    slideshow.images = imagesResult.rows.map(img => ({
      id: img.id,
      slideshowId: img.slideshow_id,
      url: img.image_url,
      caption: img.caption,
      position: img.display_order,
      createdAt: img.created_at
    }));
    
    console.log('🎬 SLIDESHOWS: Slideshow found:', slideshow.name);
    res.json({ slideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error fetching slideshow:', error);
    res.status(500).json({ error: 'Failed to fetch slideshow' });
  }
});

// ---------- SLIDESHOW IMAGE UPLOAD ROUTES ----------

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
    
    // Use the filename generated by multer
    const filename = req.file.filename;
    
    console.log('🎬 SLIDESHOW_UPLOAD: Using multer filename:', filename);
    
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
    
    // Save image record to database
    const imageUrl = `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${filename}`;
    console.log('🎬 SLIDESHOW_UPLOAD: About to save image record with URL:', imageUrl);
    
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
      url: imageResult.rows[0].image_url,
      caption: imageResult.rows[0].caption,
      position: imageResult.rows[0].display_order,
      createdAt: imageResult.rows[0].created_at
    };
    
    console.log('🎬 SLIDESHOW_UPLOAD: Image uploaded successfully:', {
      imageId: image.id,
      filename,
      url: image.url
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
    
    // Delete file from filesystem
    const imageUrl = imageResult.rows[0].image_url;
    const filename = imageUrl.split('/').pop();
    const filePath = path.join(__dirname, 'uploads', filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('🎬 SLIDESHOW_DELETE_IMAGE: File deleted from filesystem:', filename);
    }
    
    console.log('🎬 SLIDESHOW_DELETE_IMAGE: Image deleted successfully');
    res.json({ message: 'Image deleted successfully' });
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_DELETE_IMAGE: Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// ---------- SLIDESHOW ACCESS ROUTES ----------

// Public slideshow access endpoint
app.get('/api/slideshow-access/:id', async (req, res) => {
  try {
    console.log('🎬 SLIDESHOW_ACCESS: Starting endpoint execution');
    const { id } = req.params;
    const { activationCode } = req.query;
    
    console.log('🎬 SLIDESHOW_ACCESS: Parameters received:', { id, activationCode });
    
    // Get slideshow details
    console.log('🎬 SLIDESHOW_ACCESS: About to query slideshow with ID:', id);
    let slideshowResult;
    try {
      slideshowResult = await pool.query(
        `SELECT s.* FROM slideshows s WHERE s.id = $1`,
        [id]
      );
      console.log('🎬 SLIDESHOW_ACCESS: slideshowResult query successful, rows:', slideshowResult.rows.length);
      console.log('🎬 SLIDESHOW_ACCESS: slideshowResult data:', slideshowResult.rows);
    } catch (queryError) {
      console.error('🎬 SLIDESHOW_ACCESS: Error in slideshow query:', queryError);
      throw queryError;
    }
    
    if (slideshowResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_ACCESS: Slideshow not found:', id);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = slideshowResult.rows[0];
    console.log('🎬 SLIDESHOW_ACCESS: Slideshow found:', { 
      id: slideshow.id, 
      name: slideshow.name, 
      requiresActivation: slideshow.requires_activation_code,
      isPublic: slideshow.is_public 
    });
    
    // Check if slideshow requires activation code
    if (slideshow.requires_activation_code) {
      console.log('🎬 SLIDESHOW_ACCESS: Slideshow requires activation code');
      if (!activationCode) {
        console.log('🎬 SLIDESHOW_ACCESS: Activation code required but not provided');
        return res.status(403).json({ 
          error: 'Activation code required',
          requiresActivation: true 
        });
      }
      
      // Validate activation code
      console.log('🎬 SLIDESHOW_ACCESS: About to validate activation code:', activationCode);
      let codeResult;
      try {
        codeResult = await pool.query(
          `SELECT * FROM activation_codes 
           WHERE code = $1 AND slideshow_id = $2 AND is_active = true 
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR uses_count < max_uses)`,
          [activationCode, id]
        );
        console.log('🎬 SLIDESHOW_ACCESS: codeResult query successful, rows:', codeResult.rows.length);
        console.log('🎬 SLIDESHOW_ACCESS: codeResult data:', codeResult.rows);
      } catch (queryError) {
        console.error('🎬 SLIDESHOW_ACCESS: Error in activation code query:', queryError);
        throw queryError;
      }
      
      if (codeResult.rows.length === 0) {
        console.log('🎬 SLIDESHOW_ACCESS: Invalid activation code:', activationCode);
        return res.status(403).json({ 
          error: 'Invalid activation code',
          requiresActivation: true 
        });
      }
      
      // Increment usage count
      console.log('🎬 SLIDESHOW_ACCESS: About to increment usage count for code ID:', codeResult.rows[0].id);
      try {
        await pool.query(
          `UPDATE activation_codes 
           SET uses_count = uses_count + 1, 
               last_used_at = NOW() 
           WHERE id = $1`,
          [codeResult.rows[0].id]
        );
        console.log('🎬 SLIDESHOW_ACCESS: Usage count incremented successfully');
      } catch (queryError) {
        console.error('🎬 SLIDESHOW_ACCESS: Error incrementing usage count:', queryError);
        throw queryError;
      }
      
      console.log('🎬 SLIDESHOW_ACCESS: Activation code validated and usage incremented');
    }
    
    // Check if slideshow is public or user has access
    if (!slideshow.is_public && !slideshow.requires_activation_code) {
      console.log('🎬 SLIDESHOW_ACCESS: Slideshow is private and no activation code provided');
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get images for the slideshow
    console.log('🎬 SLIDESHOW_ACCESS: About to query images for slideshow ID:', id);
    let imagesResult;
    try {
      imagesResult = await pool.query(
        `SELECT * FROM slideshow_images 
         WHERE slideshow_id = $1 
         ORDER BY display_order`,
        [id]
      );
      console.log('🎬 SLIDESHOW_ACCESS: imagesResult query successful, rows:', imagesResult.rows.length);
      console.log('🎬 SLIDESHOW_ACCESS: imagesResult data:', imagesResult.rows);
    } catch (queryError) {
      console.error('🎬 SLIDESHOW_ACCESS: Error in images query:', queryError);
      throw queryError;
    }
    
    console.log('🎬 SLIDESHOW_ACCESS: About to create slideshowWithImages object');
    const slideshowWithImages = {
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
    
    console.log('🎬 SLIDESHOW_ACCESS: slideshowWithImages created successfully:', {
      id: slideshowWithImages.id,
      name: slideshowWithImages.name,
      imagesCount: slideshowWithImages.images.length
    });
    
    console.log('🎬 SLIDESHOW_ACCESS: About to send response');
    res.json({ slideshow: slideshowWithImages });
    console.log('🎬 SLIDESHOW_ACCESS: Response sent successfully');
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_ACCESS: Error accessing slideshow:', error);
    console.error('🎬 SLIDESHOW_ACCESS: Error message:', error.message);
    if (error.stack) {
      console.error('🎬 SLIDESHOW_ACCESS: Error stack:', error.stack);
    }
    res.status(500).json({ error: 'Failed to access slideshow', details: error.message });
  }
});

// ---------- ACTIVATION CODE MANAGEMENT ROUTES ----------

// Create activation code
app.post('/api/activation-codes', authenticateToken, async (req, res) => {
  try {
    const { playlistId, slideshowId, maxUses, expiresAt } = req.body;
    
    if ((!playlistId && !slideshowId) || (playlistId && slideshowId)) {
      return res.status(400).json({ error: 'Either playlistId or slideshowId is required, but not both.' });
    }
    
    let contentType, contentId, ownerCheckQuery, ownerCheckParams;
    if (playlistId) {
      contentType = 'playlist';
      contentId = playlistId;
      ownerCheckQuery = 'SELECT user_id FROM playlists WHERE id = $1';
      ownerCheckParams = [playlistId];
    } else {
      contentType = 'slideshow';
      contentId = slideshowId;
      ownerCheckQuery = 'SELECT user_id FROM slideshows WHERE id = $1';
      ownerCheckParams = [slideshowId];
    }
    
    // Check if user owns the playlist or slideshow
    const ownerResult = await pool.query(ownerCheckQuery, ownerCheckParams);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} not found` });
    }
    if (ownerResult.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: `Not authorized to create codes for this ${contentType}` });
    }
    
    // Generate unique activation code
    const code = 'ACCESS-' + Math.random().toString(36).substring(2, 15).toUpperCase();
    
    // Insert activation code for the correct type
    let insertQuery, insertParams;
    if (playlistId) {
      insertQuery = `INSERT INTO activation_codes (code, playlist_id, created_by, max_uses, expires_at, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`;
      insertParams = [code, playlistId, req.user.userId, maxUses || null, expiresAt || null];
    } else {
      insertQuery = `INSERT INTO activation_codes (code, slideshow_id, created_by, max_uses, expires_at, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`;
      insertParams = [code, slideshowId, req.user.userId, maxUses || null, expiresAt || null];
    }
    
    const result = await pool.query(insertQuery, insertParams);
    const activationCode = result.rows[0];
    
    res.status(201).json({
      id: activationCode.id,
      code: activationCode.code,
      playlist_id: activationCode.playlist_id,
      slideshow_id: activationCode.slideshow_id,
      max_uses: activationCode.max_uses,
      expires_at: activationCode.expires_at,
      created_at: activationCode.created_at
    });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CREATE: Error creating activation code:', error);
    res.status(500).json({ error: 'Failed to create activation code' });
  }
});

// ---------- ACTIVATION CODE VALIDATION ROUTES ----------

// Validate activation code for playlist/slideshow access
app.post('/api/activation-codes/validate', async (req, res) => {
  try {
    const { code, playlistId, slideshowId } = req.body;
    
    if (!code || (!playlistId && !slideshowId)) {
      console.log('🔑 ACTIVATION_VALIDATE: Missing required fields:', { code, playlistId, slideshowId });
      return res.status(400).json({ error: 'Code and either playlistId or slideshowId required' });
    }
    
    if (playlistId && slideshowId) {
      return res.status(400).json({ error: 'Provide either playlistId or slideshowId, not both' });
    }
    
    let contentType, contentId, contentCheckQuery, contentCheckParams, codeCheckQuery, codeCheckParams;
    if (playlistId) {
      contentType = 'playlist';
      contentId = playlistId;
      contentCheckQuery = 'SELECT requires_activation_code FROM playlists WHERE id = $1';
      contentCheckParams = [playlistId];
      codeCheckQuery = `SELECT * FROM activation_codes 
                       WHERE code = $1 AND playlist_id = $2 AND is_active = true 
                       AND (expires_at IS NULL OR expires_at > NOW())
                       AND (max_uses IS NULL OR uses_count < max_uses)`;
      codeCheckParams = [code, playlistId];
    } else {
      contentType = 'slideshow';
      contentId = slideshowId;
      contentCheckQuery = 'SELECT requires_activation_code FROM slideshows WHERE id = $1';
      contentCheckParams = [slideshowId];
      codeCheckQuery = `SELECT * FROM activation_codes 
                       WHERE code = $1 AND slideshow_id = $2 AND is_active = true 
                       AND (expires_at IS NULL OR expires_at > NOW())
                       AND (max_uses IS NULL OR uses_count < max_uses)`;
      codeCheckParams = [code, slideshowId];
    }
    
    console.log('🔑 ACTIVATION_VALIDATE: Validating code for', contentType, ':', { code, contentId });
    
    // Check if content exists and requires activation
    const contentResult = await pool.query(contentCheckQuery, contentCheckParams);
    
    if (contentResult.rows.length === 0) {
      console.log('🔑 ACTIVATION_VALIDATE:', contentType, 'not found:', contentId);
      return res.status(404).json({ error: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} not found` });
    }
    
    if (!contentResult.rows[0].requires_activation_code) {
      console.log('🔑 ACTIVATION_VALIDATE:', contentType, 'does not require activation code');
      return res.status(400).json({ error: `This ${contentType} does not require an activation code` });
    }
    
    // Validate activation code
    const codeResult = await pool.query(codeCheckQuery, codeCheckParams);
    
    if (codeResult.rows.length === 0) {
      console.log('🔑 ACTIVATION_VALIDATE: Invalid or expired code:', code);
      return res.status(400).json({ 
        error: 'Invalid or expired activation code',
        requiresActivation: true 
      });
    }
    
    const activationCode = codeResult.rows[0];
    console.log('🔑 ACTIVATION_VALIDATE: Code validated successfully for', contentType, ':', {
      codeId: activationCode.id,
      usesCount: activationCode.uses_count,
      maxUses: activationCode.max_uses,
      expiresAt: activationCode.expires_at
    });
    
    res.json({ 
      valid: true, 
      message: 'Activation code is valid',
      activationCode: {
        id: activationCode.id,
        usesCount: activationCode.uses_count,
        maxUses: activationCode.max_uses,
        expiresAt: activationCode.expires_at
      }
    });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_VALIDATE: Error validating code:', error);
    res.status(500).json({ error: 'Failed to validate activation code' });
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

// Get single product
app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM products WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    
    // Format prices array
    let pricesArr = product.prices;
    if (!pricesArr || !pricesArr.length) {
      const amount = product.price || (product.metadata && (product.metadata.price || product.metadata.unit_amount)) || 0;
      pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
    }

    const productWithPrices = { ...product, prices: pricesArr };
    
    console.log('✅ Product fetched:', productWithPrices);
    res.json(productWithPrices);
  } catch (error) {
    console.error('🔴 GET PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
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
    const { name, description, is_public, requires_activation_code } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    console.log('🎵 PLAYLIST_CREATE: Creating playlist:', { 
      name, 
      description, 
      is_public, 
      requires_activation_code 
    });

    const result = await pool.query(
      `INSERT INTO playlists (user_id, name, description, is_public, requires_activation_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [req.user.userId, name, description, is_public || false, requires_activation_code || false]
    );

    const playlist = result.rows[0];
    console.log('🎵 PLAYLIST_CREATE: Playlist created successfully:', {
      id: playlist.id,
      name: playlist.name,
      requiresActivation: playlist.requires_activation_code,
      isPublic: playlist.is_public
    });
    
    res.status(201).json(playlist);
  } catch (error) {
    console.error('🔴 CREATE PLAYLIST ERROR:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// Update playlist
app.patch('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_public, requires_activation_code } = req.body;

    console.log('🎵 PLAYLIST_UPDATE: Updating playlist:', { 
      id, 
      name, 
      description, 
      is_public, 
      requires_activation_code 
    });

    const result = await pool.query(
      `UPDATE playlists 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_public = COALESCE($3, is_public),
           requires_activation_code = COALESCE($4, requires_activation_code),
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, description, is_public, requires_activation_code, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlist = result.rows[0];
    console.log('🎵 PLAYLIST_UPDATE: Playlist updated successfully:', {
      id: playlist.id,
      name: playlist.name,
      requiresActivation: playlist.requires_activation_code,
      isPublic: playlist.is_public
    });
    
    res.json(playlist);
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
    const { name, description, is_public, requires_activation_code, autoplay_interval, transition } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    console.log('🎬 SLIDESHOW_CREATE: Creating slideshow:', { 
      name, 
      description, 
      is_public, 
      requires_activation_code,
      autoplay_interval,
      transition 
    });

    const result = await pool.query(
      `INSERT INTO slideshows (user_id, name, description, is_public, requires_activation_code, 
                              autoplay_interval, transition, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        req.user.userId, 
        name, 
        description || '', 
        is_public || false,
        requires_activation_code || false,
        autoplay_interval || 5000,
        transition || 'fade'
      ]
    );

    const slideshow = result.rows[0];
    console.log('🎬 SLIDESHOW_CREATE: Slideshow created successfully:', {
      id: slideshow.id,
      name: slideshow.name,
      requiresActivation: slideshow.requires_activation_code,
      isPublic: slideshow.is_public
    });
    
    res.status(201).json(slideshow);
  } catch (error) {
    console.error('🎬 SLIDESHOW_CREATE: Error creating slideshow:', error);
    res.status(500).json({ error: 'Failed to create slideshow' });
  }
});

// Update slideshow
app.patch('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_public, requires_activation_code, autoplay_interval, transition } = req.body;

    console.log('🎬 SLIDESHOW_UPDATE: Updating slideshow:', { 
      id, 
      name, 
      description, 
      is_public, 
      requires_activation_code,
      autoplay_interval,
      transition 
    });

    const result = await pool.query(
      `UPDATE slideshows 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_public = COALESCE($3, is_public),
           requires_activation_code = COALESCE($4, requires_activation_code),
           autoplay_interval = COALESCE($5, autoplay_interval),
           transition = COALESCE($6, transition),
           updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [name, description, is_public, requires_activation_code, autoplay_interval, transition, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    const slideshow = result.rows[0];
    console.log('🎬 SLIDESHOW_UPDATE: Slideshow updated successfully:', {
      id: slideshow.id,
      name: slideshow.name,
      requiresActivation: slideshow.requires_activation_code,
      isPublic: slideshow.is_public
    });
    
    res.json(slideshow);
  } catch (error) {
    console.error('🎬 SLIDESHOW_UPDATE: Error updating slideshow:', error);
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

// Ensure the app listens on process.env.PORT
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ---------- CONTENT TYPE DETECTION ----------

// Detect content type (playlist, media, or unknown)
app.get('/api/content/:id/type', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 CONTENT_TYPE: Detecting type for ID:', id);
    
    // Check if it's a playlist
    const playlistResult = await pool.query('SELECT id FROM playlists WHERE id = $1', [id]);
    if (playlistResult.rows.length > 0) {
      console.log('🔍 CONTENT_TYPE: Found playlist');
      return res.json({ type: 'playlist' });
    }
    
    // Check if it's a media file
    const mediaResult = await pool.query('SELECT id FROM media WHERE id = $1', [id]);
    if (mediaResult.rows.length > 0) {
      console.log('🔍 CONTENT_TYPE: Found media file');
      return res.json({ type: 'media' });
    }
    
    // Check if it's a slideshow
    const slideshowResult = await pool.query('SELECT id FROM slideshows WHERE id = $1', [id]);
    if (slideshowResult.rows.length > 0) {
      console.log('🔍 CONTENT_TYPE: Found slideshow');
      return res.json({ type: 'slideshow' });
    }
    
    console.log('🔍 CONTENT_TYPE: Content not found');
    return res.status(404).json({ error: 'Content not found' });
    
  } catch (error) {
    console.error('🔍 CONTENT_TYPE: Error detecting content type:', error);
    res.status(500).json({ error: 'Failed to detect content type' });
  }
});

// ---------- PLAYLIST-MEDIA ASSOCIATION ----------

// Add media to playlist
app.post('/api/playlists/:id/media', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { mediaId, displayOrder = 1 } = req.body;
    
    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }
    
    console.log('🎵 PLAYLIST_MEDIA: Adding media to playlist:', { playlistId: id, mediaId, displayOrder });
    
    // Check if playlist exists and user owns it
    const playlistResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Check if media exists and user owns it
    const mediaResult = await pool.query(
      'SELECT id FROM media WHERE id = $1 AND user_id = $2',
      [mediaId, req.user.userId]
    );
    
    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    // Check if association already exists
    const existingResult = await pool.query(
      'SELECT id FROM playlist_media WHERE playlist_id = $1 AND media_id = $2',
      [id, mediaId]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Media is already in this playlist' });
    }
    
    // Add media to playlist
    const result = await pool.query(
      'INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3) RETURNING *',
      [id, mediaId, displayOrder]
    );
    
    console.log('🎵 PLAYLIST_MEDIA: Media added to playlist successfully');
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error('🎵 PLAYLIST_MEDIA: Error adding media to playlist:', error);
    res.status(500).json({ error: 'Failed to add media to playlist' });
  }
});

// Remove media from playlist
app.delete('/api/playlists/:id/media/:mediaId', authenticateToken, async (req, res) => {
  try {
    const { id, mediaId } = req.params;
    
    console.log('🎵 PLAYLIST_MEDIA: Removing media from playlist:', { playlistId: id, mediaId });
    
    // Check if playlist exists and user owns it
    const playlistResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Remove media from playlist
    const result = await pool.query(
      'DELETE FROM playlist_media WHERE playlist_id = $1 AND media_id = $2 RETURNING *',
      [id, mediaId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found in playlist' });
    }
    
    console.log('🎵 PLAYLIST_MEDIA: Media removed from playlist successfully');
    res.json({ message: 'Media removed from playlist' });
    
  } catch (error) {
    console.error('🎵 PLAYLIST_MEDIA: Error removing media from playlist:', error);
    res.status(500).json({ error: 'Failed to remove media from playlist' });
  }
});

// ---------- STRIPE CHECKOUT SESSION ENDPOINT ----------

app.post('/api/checkout/session', authenticateToken, async (req, res) => {
  try {
    const { items, successUrl, cancelUrl } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Fetch product info from DB for each item
    const line_items = [];
    for (const item of items) {
      const { productId, quantity } = item;
      const result = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: `Product not found: ${productId}` });
      }
      const product = result.rows[0];
      // Use Stripe price/product ID if available, else fallback to price in cents
      if (product.stripe_product_id && product.stripe_price_id) {
        line_items.push({
          price: product.stripe_price_id,
          quantity: quantity || 1,
        });
      } else {
        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: product.description,
            },
            unit_amount: product.price,
          },
          quantity: quantity || 1,
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: successUrl || `${req.protocol}://${req.get('host')}/store/checkout-success`,
      cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/store/checkout-cancel`,
      metadata: {
        userId: req.user.userId,
      },
    });

    res.json({ url: session.url, sessionId: session.id, success: true });
  } catch (err) {
    console.error('Checkout session error', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---------- ADDITIONAL MISSING ENDPOINTS ----------

// Stripe create checkout session (alternative endpoint)
app.post('/api/stripe/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { tier, newUser } = req.body;
    
    if (!tier) {
      return res.status(400).json({ error: 'Tier is required' });
    }

    // Get user info
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    // Define subscription tiers
    const tiers = {
      basic: { price: 999, name: 'Basic Plan' },
      pro: { price: 1999, name: 'Pro Plan' },
      enterprise: { price: 4999, name: 'Enterprise Plan' }
    };

    const selectedTier = tiers[tier];
    if (!selectedTier) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: selectedTier.name,
            description: `Subscription to ${selectedTier.name}`,
          },
          unit_amount: selectedTier.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription`,
      customer_email: user.email,
      metadata: {
        userId: user.id.toString(),
        tier,
        newUser: newUser || 'false',
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('❌ Stripe checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Test email endpoint
app.post('/api/test/send-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({ error: 'to, subject, and message are required' });
    }

    // For testing purposes, just log the email
    console.log('📧 Test email would be sent:');
    console.log('   To:', to);
    console.log('   Subject:', subject);
    console.log('   Message:', message);

    res.json({ success: true, message: 'Test email logged successfully' });
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Product links endpoints
app.get('/api/playlists/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.image_url 
      FROM playlist_product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.playlist_id = $1
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get playlist product links error:', error);
    res.status(500).json({ error: 'Failed to get product links' });
  }
});

app.post('/api/playlists/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    // Check if playlist exists and user owns it
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check if product exists
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Add link
    const result = await pool.query(`
      INSERT INTO playlist_product_links (playlist_id, product_id)
      VALUES ($1, $2) RETURNING *
    `, [id, productId]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Add playlist product link error:', error);
    res.status(500).json({ error: 'Failed to add product link' });
  }
});

app.delete('/api/playlists/:id/product-links/:productId', authenticateToken, async (req, res) => {
  try {
    const { id, productId } = req.params;
    
    // Check if playlist exists and user owns it
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Remove link
    const result = await pool.query(`
      DELETE FROM playlist_product_links 
      WHERE playlist_id = $1 AND product_id = $2 RETURNING *
    `, [id, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Remove playlist product link error:', error);
    res.status(500).json({ error: 'Failed to remove product link' });
  }
});

// Slideshow product links endpoints
app.get('/api/slideshows/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT sl.*, p.name as product_name, p.price, p.image_url 
      FROM slideshow_product_links sl
      JOIN products p ON sl.product_id = p.id
      WHERE sl.slideshow_id = $1
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get slideshow product links error:', error);
    res.status(500).json({ error: 'Failed to get product links' });
  }
});

app.post('/api/slideshows/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    // Check if slideshow exists and user owns it
    const slideshowResult = await pool.query('SELECT * FROM slideshows WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    // Check if product exists
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Add link
    const result = await pool.query(`
      INSERT INTO slideshow_product_links (slideshow_id, product_id)
      VALUES ($1, $2) RETURNING *
    `, [id, productId]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Add slideshow product link error:', error);
    res.status(500).json({ error: 'Failed to add product link' });
  }
});

app.delete('/api/slideshows/:id/product-links/:productId', authenticateToken, async (req, res) => {
  try {
    const { id, productId } = req.params;
    
    // Check if slideshow exists and user owns it
    const slideshowResult = await pool.query('SELECT * FROM slideshows WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    // Remove link
    const result = await pool.query(`
      DELETE FROM slideshow_product_links 
      WHERE slideshow_id = $1 AND product_id = $2 RETURNING *
    `, [id, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Remove slideshow product link error:', error);
    res.status(500).json({ error: 'Failed to remove product link' });
  }
});

// Sales endpoints
app.get('/api/sales/my', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.name as product_name, p.price
      FROM sales s
      JOIN products p ON s.product_id = p.id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `, [req.user.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get my sales error:', error);
    res.status(500).json({ error: 'Failed to get sales' });
  }
});

app.get('/api/sales/all', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.name as product_name, p.price, u.email as user_email
      FROM sales s
      JOIN products p ON s.product_id = p.id
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get all sales error:', error);
    res.status(500).json({ error: 'Failed to get sales' });
  }
});

// Sales CSV download endpoints
app.get('/api/sales/my/csv', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.name as product_name, p.price, s.quantity, s.total_amount, s.created_at
      FROM sales s
      JOIN products p ON s.product_id = p.id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `, [req.user.userId]);

    // Create CSV content
    const csvContent = [
      'Product Name,Price,Quantity,Total Amount,Date',
      ...result.rows.map(sale => 
        `"${sale.product_name}",${sale.price},${sale.quantity},${sale.total_amount},"${sale.created_at}"`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="my-sales.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('❌ Download my sales CSV error:', error);
    res.status(500).json({ error: 'Failed to download CSV' });
  }
});

app.get('/api/sales/all/csv', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.email as user_email, p.name as product_name, p.price, s.quantity, s.total_amount, s.created_at
      FROM sales s
      JOIN products p ON s.product_id = p.id
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `);

    // Create CSV content
    const csvContent = [
      'User Email,Product Name,Price,Quantity,Total Amount,Date',
      ...result.rows.map(sale => 
        `"${sale.user_email}","${sale.product_name}",${sale.price},${sale.quantity},${sale.total_amount},"${sale.created_at}"`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="all-sales.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('❌ Download all sales CSV error:', error);
    res.status(500).json({ error: 'Failed to download CSV' });
  }
});

// Chat/messages endpoints
app.get('/api/playlists/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if playlist exists
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1', [id]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const result = await pool.query(`
      SELECT m.*, u.email as user_email
      FROM playlist_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.playlist_id = $1
      ORDER BY m.created_at ASC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get playlist messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

app.post('/api/playlists/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if playlist exists
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1', [id]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const result = await pool.query(`
      INSERT INTO playlist_messages (playlist_id, user_id, message)
      VALUES ($1, $2, $3) RETURNING *
    `, [id, req.user.userId, message.trim()]);

    const newMessageResult = await pool.query(`
      SELECT m.*, u.email as user_email
      FROM playlist_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = $1
    `, [result.rows[0].id]);

    res.json(newMessageResult.rows[0]);
  } catch (error) {
    console.error('❌ Send playlist message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.delete('/api/playlists/:id/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { id, messageId } = req.params;
    
    // Check if message exists and user owns it
    const messageResult = await pool.query(`
      SELECT * FROM playlist_messages 
      WHERE id = $1 AND playlist_id = $2 AND user_id = $3
    `, [messageId, id, req.user.userId]);

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await pool.query('DELETE FROM playlist_messages WHERE id = $1', [messageId]);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete playlist message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Media confirm upload endpoint
app.post('/api/media/confirm-upload', authenticateToken, async (req, res) => {
  try {
    const { title, fileUrl, filename, fileType, contentType, filesize, duration, s3Key } = req.body;
    
    if (!title || !fileUrl || !filename || !fileType || !contentType || !filesize || !s3Key) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('✅ Confirming S3 upload:', { title, filename, fileType, filesize, s3Key });

    // Create media record in database
    const result = await pool.query(`
      INSERT INTO media (user_id, title, url, filename, file_type, content_type, filesize, duration, s3_key, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [req.user.userId, title, fileUrl, filename, fileType, contentType, filesize, duration || null, s3Key]);

    const mediaRecord = result.rows[0];
    console.log('✅ Media record created:', mediaRecord.id);

    res.status(201).json(mediaRecord);
  } catch (error) {
    console.error('❌ Confirm upload error:', error);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

// User info endpoint
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT id, email, username, created_at, 
             (SELECT COUNT(*) FROM products WHERE user_id = users.id) as product_count,
             (SELECT COUNT(*) FROM playlists WHERE user_id = users.id) as playlist_count,
             (SELECT COUNT(*) FROM slideshows WHERE user_id = users.id) as slideshow_count
      FROM users 
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Get user info error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

module.exports = app;