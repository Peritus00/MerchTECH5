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

// Log AWS key suffixes for deployment debugging (do not log full secrets)
const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
console.log('AWS Access Key Suffix:', accessKey ? accessKey.slice(-4) : 'Not set');
console.log('AWS Secret Key Suffix:', secretKey ? secretKey.slice(-4) : 'Not set');

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
  console.log('⚠️  S3 service not available, trying direct initialization');
  console.log('   Error:', jsError.message);
  console.log('   Stack:', jsError.stack);
  console.log('   Environment variables check:');
  console.log('   - AWS_ACCESS_KEY_ID length:', process.env.AWS_ACCESS_KEY_ID?.length || 0);
  console.log('   - AWS_SECRET_ACCESS_KEY length:', process.env.AWS_SECRET_ACCESS_KEY?.length || 0);
  console.log('   - AWS_REGION:', process.env.AWS_REGION);
  console.log('   - AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME);
  
  // Try direct S3 client creation as fallback
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    const testClient = new S3Client({
      region: (process.env.AWS_REGION || 'us-east-1').replace(/\s+/g, ''),
      credentials: {
        accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').replace(/\s+/g, ''),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').replace(/\s+/g, ''),
      },
    });
    console.log('✅ Direct S3 client creation successful - S3 service should work');
  } catch (directError) {
    console.log('❌ Direct S3 client creation failed:', directError.message);
  }
  
  s3Service = null;
}

const app = express();

// 🔒 CORS CONFIGURATION - ALLOW CUSTOM DOMAIN
const corsOptions = {
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Increase limit for QR code logos
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsDir));

// 🔒 SECURE FILE UPLOAD CONFIGURATION - S3 STORAGE
const storage = multer.memoryStorage(); // Use memory storage for S3 uploads
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for video files
  },
  fileFilter: (req, file, cb) => {
    // Allow images, audio, and video files
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp3|wav|m4a|aac|ogg|mp4|webm|avi|mov|wmv|flv|mkv|3gp|3gpp|quicktime|hevc|h264|h265/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                    file.mimetype.startsWith('audio/') || 
                    file.mimetype.startsWith('image/') ||
                    file.mimetype.startsWith('video/');
    
    // Special handling for files that might be detected as application/octet-stream
    const isAudioFile = path.extname(file.originalname).toLowerCase().match(/\.(mp3|wav|m4a|aac|ogg)$/);
    const isImageFile = path.extname(file.originalname).toLowerCase().match(/\.(jpeg|jpg|png|gif|webp)$/);
    const isVideoFile = path.extname(file.originalname).toLowerCase().match(/\.(mp4|webm|avi|mov|wmv|flv|mkv|3gp|3gpp|quicktime)$/);
    
    console.log('🔍 FILE_FILTER: Checking file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      extension: path.extname(file.originalname).toLowerCase(),
      extname: extname,
      mimetypeMatch: mimetype,
      isAudioFile: !!isAudioFile,
      isImageFile: !!isImageFile,
      isVideoFile: !!isVideoFile,
      allowedTypesTest: allowedTypes.test(file.mimetype),
      startsWithAudio: file.mimetype.startsWith('audio/'),
      startsWithImage: file.mimetype.startsWith('image/'),
      startsWithVideo: file.mimetype.startsWith('video/')
    });
    
    if ((mimetype && extname) || isAudioFile || isImageFile || isVideoFile) {
      console.log('✅ FILE_FILTER: File accepted');
      return cb(null, true);
    } else {
      console.log('❌ FILE_FILTER: File rejected');
      cb(new Error('Only image, audio, and video files are allowed'));
    }
  }
});

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

// --- DEBUG ENDPOINT FOR S3 SERVICE STATUS ---
app.get('/api/debug/s3', (req, res) => {
  // Test direct S3 client creation
  let directS3Test = null;
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    const testClient = new S3Client({
      region: (process.env.AWS_REGION || 'us-east-1').replace(/\s+/g, ''),
      credentials: {
        accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').replace(/\s+/g, ''),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').replace(/\s+/g, ''),
      },
    });
    directS3Test = 'Success - S3Client created directly';
  } catch (error) {
    directS3Test = `Failed - ${error.message}`;
  }

  res.json({
    s3ServiceAvailable: !!s3Service,
    environmentVariables: {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.slice(0, 4)}...${process.env.AWS_ACCESS_KEY_ID.slice(-4)}` : 'Missing',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? `${process.env.AWS_SECRET_ACCESS_KEY.slice(0, 4)}...${process.env.AWS_SECRET_ACCESS_KEY.slice(-4)}` : 'Missing',
      AWS_REGION: process.env.AWS_REGION || 'Missing',
      AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || 'Missing'
    },
    s3ServiceConfigured: s3Service ? s3Service.isConfigured() : false,
    directS3Test: directS3Test
  });
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

// Get current user info endpoint (for subscription limits)
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, is_admin, subscription_tier, max_audio_files, max_video_files, max_products, max_playlists, max_qr_codes, max_slideshows, max_activation_codes, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('🔴 GET USER ME ERROR:', error);
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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  console.log('🔎 [DEBUG] /api/upload/s3 called');
  try {
    if (!req.file) {
      console.log('❌ [DEBUG] No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!s3Service) {
      console.log('❌ [DEBUG] S3 service not configured');
      return res.status(500).json({ error: 'S3 service not configured' });
    }
    const { originalname, mimetype, buffer, size } = req.file;
    console.log('🔎 [DEBUG] File info:', { originalname, mimetype, size });
    const fileUrl = await s3Service.uploadFile(
      buffer,
      originalname,
      mimetype,
      req.user.userId
    );
    console.log('✅ [DEBUG] File uploaded to S3:', fileUrl);
    res.json({ 
      fileUrl,
      fileName: originalname,
      contentType: mimetype,
      fileSize: size
    });
  } catch (error) {
    console.error('❌ [DEBUG] S3 upload error:', error);
    res.status(500).json({ error: 'Failed to upload file to S3', details: error.message });
  }
});

// Legacy upload endpoint (for backward compatibility)
app.post('/api/upload', authenticateToken, upload.single('image'), async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (!req.file) {
    console.error('📤 UPLOAD: No file in request');
    console.error('📤 UPLOAD: Request details:', {
      body: req.body,
      files: req.files,
      headers: req.headers['content-type']
    });
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    if (!s3Service) {
      return res.status(500).json({ error: 'S3 service not configured' });
    }
    
    console.log('📤 UPLOAD: Uploading file to S3:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      fieldname: req.file.fieldname,
      buffer: req.file.buffer ? 'Buffer present' : 'No buffer'
    });
    
    // Generate a unique key for the file
    const key = `users/${req.user.userId}/media/${Date.now()}-${req.file.originalname}`;
    
    const uploadResult = await s3Service.uploadFile(
      req.file.buffer,
      key,
      req.file.mimetype
    );
    
    // Extract the URL from the S3 response
    const fileUrl = uploadResult.Location || uploadResult.location || uploadResult;
    
    // Extract the filename from the key that was uploaded
    const keyParts = key.split('/');
    const uploadedFilename = keyParts[keyParts.length - 1]; // Get the last part (filename)
    
    // Create a proxy URL for serving the image through our server
    let proxyUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/images/s3/${req.user.userId}/${uploadedFilename}`;
    
    // Apply URL sanitization to ensure HTTPS and correct domain
    proxyUrl = sanitizeImageUrls([proxyUrl])[0];
    
    console.log('📤 UPLOAD: S3 upload successful:', fileUrl);
    console.log('📤 UPLOAD: S3 key:', key);
    console.log('📤 UPLOAD: Proxy URL:', proxyUrl);
    console.log('📤 UPLOAD: Full upload result:', uploadResult);
    res.json({ imageUrl: proxyUrl });
    
  } catch (error) {
    console.error('📤 UPLOAD: S3 upload failed:', error);
    console.error('📤 UPLOAD: Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ error: 'Failed to upload file to S3', details: error.message });
  }
});

// S3 Presigned URL for file upload (legacy - kept for compatibility)
app.post('/api/media/presigned-url', authenticateToken, async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  console.log('🔎 [DEBUG] /api/media/presigned-url called (legacy endpoint)');
  try {
    console.log('🔎 [DEBUG] Request body:', req.body);
    console.log('🔎 [DEBUG] Authenticated user:', req.user);
    const { filename, contentType, fileSize } = req.body;
    if (!filename || !contentType) {
      console.log('❌ [DEBUG] Missing filename or contentType:', { filename, contentType });
      return res.status(400).json({ error: 'filename and contentType are required' });
    }
    if (!s3Service) {
      console.log('❌ [DEBUG] S3 service not configured');
      return res.status(500).json({ error: 'S3 service not configured' });
    }
    const result = await s3Service.getPresignedUploadUrl(filename, contentType, req.user.userId, fileSize);
    console.log('✅ [DEBUG] Presigned URL result:', result);
    res.json({ 
      presignedUrl: result.uploadUrl, 
      fileUrl: result.fileUrl,
      key: result.key,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('❌ [DEBUG] Presigned URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL', details: error.message });
  }
});

// S3 POST Policy for browser uploads (new - recommended)
app.post('/api/media/post-policy', authenticateToken, async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  console.log('🔎 [DEBUG] /api/media/post-policy called');
  try {
    console.log('🔎 [DEBUG] Request body:', req.body);
    console.log('🔎 [DEBUG] Authenticated user:', req.user);
    const { filename, contentType, fileSize } = req.body;
    if (!filename || !contentType) {
      console.log('❌ [DEBUG] Missing filename or contentType:', { filename, contentType });
      return res.status(400).json({ error: 'filename and contentType are required' });
    }
    if (!s3Service) {
      console.log('❌ [DEBUG] S3 service not configured');
      return res.status(500).json({ error: 'S3 service not configured' });
    }
    const result = await s3Service.getPostPolicy(filename, contentType, req.user.userId, fileSize);
    console.log('✅ [DEBUG] POST policy result:', result);
    res.json({
      url: result.url,
      fields: result.fields,
      fileUrl: result.fileUrl,
      key: result.key
    });
  } catch (error) {
    console.error('❌ [DEBUG] POST policy generation error:', error);
    res.status(500).json({ error: 'Failed to generate POST policy', details: error.message });
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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    const { title, filePath, url, filename, fileType, contentType, filesize, duration, uniqueId } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }
    // SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_audio_files, max_video_files FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    // Check limits based on file type
    if (fileType === 'video') {
      const videoCountResult = await pool.query('SELECT COUNT(*) FROM media WHERE user_id = $1 AND file_type = $2', [req.user.userId, 'video']);
      const currentVideoCount = parseInt(videoCountResult.rows[0].count);
      let maxVideoFiles;
      if (user?.max_video_files !== null && user?.max_video_files !== undefined) {
        maxVideoFiles = user.max_video_files;
      } else {
        const limits = { free: { maxVideoFiles: 1 }, basic: { maxVideoFiles: 5 }, premium: { maxVideoFiles: 15 } };
        maxVideoFiles = (limits[userTier] || limits.free).maxVideoFiles;
      }
      if (currentVideoCount >= maxVideoFiles) {
        return res.status(403).json({ error: `Video file limit reached. You have reached your limit of ${maxVideoFiles} video files. Please contact support if you need to increase your limit.`, limit: maxVideoFiles, current: currentVideoCount, subscriptionTier: userTier, isCustomLimit: user?.max_video_files !== null && user?.max_video_files !== undefined });
      }
    } else {
      // Audio and other media files
      const countResult = await pool.query('SELECT COUNT(*) FROM media WHERE user_id = $1 AND file_type != $2', [req.user.userId, 'video']);
      const currentCount = parseInt(countResult.rows[0].count);
      let maxAudioFiles;
      if (user?.max_audio_files !== null && user?.max_audio_files !== undefined) {
        maxAudioFiles = user.max_audio_files;
      } else {
        const limits = { free: { maxAudioFiles: 3 }, basic: { maxAudioFiles: 10 }, premium: { maxAudioFiles: 20 } };
        maxAudioFiles = (limits[userTier] || limits.free).maxAudioFiles;
      }
      if (currentCount >= maxAudioFiles) {
        return res.status(403).json({ error: `Media file limit reached. You have reached your limit of ${maxAudioFiles} media files. Please contact support if you need to increase your limit.`, limit: maxAudioFiles, current: currentCount, subscriptionTier: userTier, isCustomLimit: user?.max_audio_files !== null && user?.max_audio_files !== undefined });
      }
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
      
      // Handle S3 files - use streaming endpoint for consistency
      if (media.s3_key && s3Service) {
        // Use streaming endpoint for S3 files to ensure consistent playback
        properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${media.id}/stream`;
      } else if (media.url && media.url.startsWith('data:')) {
        // Handle base64 files - use streaming endpoint
        properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${media.id}/stream`;
      } else if (media.filename && !media.s3_key) {
        // Handle local files
        properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/uploads/${media.filename}`;
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
    
    // Handle S3 files - return direct signed URL for better performance
    if (media.s3_key && s3Service) {
      try {
        // Generate signed URL for S3 files - longer expiry for video files
        const expiryTime = media.file_type === 'video' ? 7200 : 3600; // 2 hours for video, 1 hour for others
        const signedUrl = await s3Service.getSignedUrl(media.s3_key, expiryTime);
        properUrl = signedUrl;
        console.log(`🔗 Generated direct S3 signed URL for ${media.file_type} file:`, media.s3_key);
      } catch (error) {
        console.error('❌ Failed to generate signed URL for S3 file:', media.s3_key, error);
        // Fallback to streaming endpoint if signed URL fails
        properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${id}/stream`;
      }
    } else if (media.url && media.url.startsWith('data:')) {
      // Handle base64 files - use streaming endpoint
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${id}/stream`;
    } else if (media.filename && !media.s3_key) {
      // Handle local files
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/uploads/${media.filename}`;
    }
    
    const mediaResponse = { 
      ...media, 
      url: properUrl, 
      title: media.title, 
      fileType: media.file_type, 
      contentType: media.content_type,
      type: media.file_type // Add this field for MediaPlayer component
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

    if (!media.s3_key || !s3Service) {
      return res.status(404).json({ error: 'No streamable S3 file found for this media record' });
    }
    
    // Get file metadata from S3 to get content length and type
    const metadata = await s3Service.getMetadata(media.s3_key);
    const fileSize = metadata.ContentLength;
    const contentType = metadata.ContentType || media.content_type;
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      console.log(`STREAMING: Range request for ${media.s3_key}: bytes=${start}-${end}`);

      // Ensure range is valid
      if (start >= fileSize || end >= fileSize) {
        res.status(416).send('Requested range not satisfiable');
        return;
      }
      
      const s3Stream = s3Service.getStream(media.s3_key, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
      });
      
      s3Stream.pipe(res);

    } else {
      console.log(`STREAMING: Full file request for ${media.s3_key}`);
      res.setHeader('Content-Length', fileSize);
      const s3Stream = s3Service.getStream(media.s3_key);
      s3Stream.pipe(res);
    }

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

// Helper function to map product database fields to frontend fields
const mapProductFields = (product) => ({
  ...product,
  inStock: product.in_stock
});

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
      return { 
        ...p, 
        price: p.price / 100, // Convert cents to dollars
        prices: pricesArr,
        inStock: p.in_stock // Map database field to frontend field
      };
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
      return { 
        ...p, 
        price: p.price / 100, // Convert cents to dollars
        prices: pricesArr,
        inStock: p.in_stock // Map database field to frontend field
      };
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
  
  // Ensure playlistId is an integer
  const playlistIdInt = parseInt(playlistId);
  if (isNaN(playlistIdInt)) {
    console.log('🔴 GET_PLAYLIST: Invalid playlist ID:', playlistId);
    return null;
  }
  
  const playlistResult = await pool.query(
    `SELECT p.*, u.username 
     FROM playlists p 
     JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1`,
    [playlistIdInt]
  );

  if (playlistResult.rows.length === 0) {
    console.log('🔴 GET_PLAYLIST: Playlist not found:', playlistIdInt);
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
    [playlistIdInt]
  );

  // Process media files to handle S3 URLs properly
  playlist.mediaFiles = await Promise.all(mediaResult.rows.map(async (media) => {
    let properUrl = media.url;
    
    // Handle S3 files - use streaming endpoint for consistency
    if (media.s3_key && s3Service) {
      // Use streaming endpoint for S3 files to ensure consistent playback
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${media.id}/stream`;
    } else if (media.url && media.url.startsWith('data:')) {
      // Handle base64 files - use streaming endpoint
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${media.id}/stream`;
    } else if (media.filename && !media.s3_key) {
      // Handle local files
      properUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/uploads/${media.filename}`;
    }
    
    return {
      id: media.id,
      title: media.title,
      filePath: `/uploads/${media.filename}`,
      fileType: media.file_type,
      contentType: media.content_type,
      type: media.file_type, // Add this field for MediaPlayer component
      url: properUrl,
    };
  }));

  // Get product links for this playlist
  try {
    const productLinksResult = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.playlist_id = $1 AND pl.is_active = true 
        AND p.is_deleted = false AND p.in_stock = true
      ORDER BY pl.display_order, pl.created_at
    `, [playlistIdInt]);

    // Format product links for frontend
    playlist.productLinks = productLinksResult.rows.map(link => ({
      id: link.product_id.toString(), // Use product_id, not link.id
      linkId: link.id.toString(), // Keep link ID for reference
      title: link.title,
      url: link.url,
      description: link.description,
      imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
      images: link.product_images || (link.image_url ? [link.image_url] : []),
      displayOrder: link.display_order,
      isActive: link.is_active,
      price: link.price ? `$${(link.price / 100).toFixed(2)}` : null,
      productName: link.product_name
    }));

    console.log('🔴 GET_PLAYLIST: Found', playlist.productLinks.length, 'product links');
  } catch (error) {
    console.error('🔴 GET_PLAYLIST: Error fetching product links:', error);
    playlist.productLinks = [];
  }

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
    is_public: playlist.is_public,
    productLinksCount: convertedPlaylist.productLinks?.length || 0
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

    // Filter out any null playlists (in case getPlaylistWithMedia fails)
    const validPlaylists = playlists.filter(playlist => playlist !== null);

    res.json({ playlists: validPlaylists });
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
      metadata: typeof qr.metadata === 'string' ? JSON.parse(qr.metadata) : qr.metadata,
      scanCount: parseInt(qr.scan_count) || 0,
      qrCodeImageUrl: qr.qr_code_image_url
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
      metadata: typeof result.rows[0].metadata === 'string' ? JSON.parse(result.rows[0].metadata) : result.rows[0].metadata,
      scanCount: parseInt(result.rows[0].scan_count) || 0,
      qrCodeImageUrl: result.rows[0].qr_code_image_url
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
        
        // Manually map fields to ensure camelCase
        return {
          id: slideshow.id,
          name: slideshow.name,
          description: slideshow.description,
          uniqueId: slideshow.unique_id,
          userId: slideshow.user_id,
          autoplayInterval: slideshow.autoplay_interval,
          transition: slideshow.transition,
          audioUrl: slideshow.audio_url,
          isPublic: slideshow.is_public,
          requiresActivationCode: slideshow.requires_activation_code,
          createdAt: slideshow.created_at,
          updatedAt: slideshow.updated_at,
          images: imagesResult.rows.map(img => ({
            id: img.id,
            slideshowId: img.slideshow_id,
            imageUrl: img.image_url,
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
    
    const images = imagesResult.rows.map(img => ({
      id: img.id,
      slideshowId: img.slideshow_id,
      imageUrl: img.image_url,
      caption: img.caption,
      position: img.display_order,
      createdAt: img.created_at
    }));

    // Manually map fields to ensure camelCase
    const formattedSlideshow = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      uniqueId: slideshow.unique_id,
      userId: slideshow.user_id,
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      audioUrl: slideshow.audio_url,
      isPublic: slideshow.is_public,
      requiresActivationCode: slideshow.requires_activation_code,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      images: images
    };
    
    console.log('🎬 SLIDESHOWS: Slideshow found:', formattedSlideshow.name);
    res.json({ slideshow: formattedSlideshow });
    
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
      position: imageResult.rows[0].display_order,
      createdAt: imageResult.rows[0].created_at
    };
    
    console.log('🎬 SLIDESHOW_UPLOAD: Image uploaded successfully to S3:', {
      imageId: image.id,
      s3Url: image.url
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
    } else {
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
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      audioUrl: slideshow.audio_url,
      requiresActivationCode: slideshow.requires_activation_code,
      createdAt: slideshow.created_at,
      images: remainingImagesResult.rows.map(img => ({
        id: img.id,
        slideshowId: img.slideshow_id,
        imageUrl: img.image_url,
        caption: img.caption,
        position: img.display_order,
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

// ---------- SLIDESHOW ACCESS ROUTES ----------

// Stream slideshow audio endpoint
app.get('/api/slideshow-audio/:slideshowId/stream', async (req, res) => {
  try {
    const { slideshowId } = req.params;
    console.log('🎵 SLIDESHOW_AUDIO_STREAM: Streaming audio for slideshow:', slideshowId);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    
    const result = await pool.query('SELECT audio_url FROM slideshows WHERE id = $1', [slideshowId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const audioUrl = result.rows[0].audio_url;
    
    if (!audioUrl) {
      return res.status(404).json({ error: 'No audio found for this slideshow' });
    }
    
    if (audioUrl.includes('amazonaws.com') && s3Service) {
      const key = s3Service.extractKeyFromUrl(audioUrl);
      if (!key) {
        return res.status(500).json({ error: 'Invalid S3 URL format' });
      }
      
      const metadata = await s3Service.getMetadata(key);
      const s3Stream = s3Service.getStream(key);

      res.setHeader('Content-Type', metadata.ContentType || 'audio/mpeg');
      if (metadata.ContentLength) {
        res.setHeader('Content-Length', metadata.ContentLength);
      }
      
      console.log(`🎵 SLIDESHOW_AUDIO_STREAM: Streaming audio directly from S3.`);
      
      // Add robust error handling to the stream to prevent server crashes
      s3Stream.on('error', (err) => {
        console.error('❌ S3 AUDIO STREAM ERROR:', err);
        if (!res.headersSent) {
          res.status(500).send('Error streaming audio file');
        }
      }).pipe(res);
      return;
    }

    console.log('🎵 SLIDESHOW_AUDIO_STREAM: Redirecting to external URL for non-S3 audio.');
    return res.redirect(audioUrl);
    
  } catch (error) {
    console.error('🎵 SLIDESHOW_AUDIO_STREAM: Error streaming audio:', error);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

// Stream slideshow image endpoint
app.get('/api/slideshow-images/:imageId/stream', async (req, res) => {
  try {
    const { imageId } = req.params;
    console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Streaming image with ID: ${imageId}`);

    const result = await pool.query('SELECT image_url FROM slideshow_images WHERE id = $1', [imageId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const imageUrl = result.rows[0].image_url;

    if (imageUrl.includes('amazonaws.com')) {
      const key = new URL(imageUrl).pathname.substring(1);
      const metadata = await s3Service.getMetadata(key);
      const s3Stream = s3Service.getStream(key);

      res.setHeader('Content-Type', metadata.ContentType || 'image/jpeg');
      if (metadata.ContentLength) {
        res.setHeader('Content-Length', metadata.ContentLength);
      }
      
      console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Streaming image directly from S3.`);
      
      // Add robust error handling to the stream to prevent server crashes
      s3Stream.on('error', (err) => {
        console.error('❌ S3 IMAGE STREAM ERROR:', err);
        if (!res.headersSent) {
          res.status(500).send('Error streaming image file');
        }
      }).pipe(res);
      return;
    }
    
    console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Serving local image: ${imageUrl}`);
    const filePath = path.join(__dirname, '../../uploads', path.basename(imageUrl));
    console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Looking for file at: ${filePath}`);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    } else {
      console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: File not found at: ${filePath}`);
      return res.status(404).send('Local file not found');
    }
  } catch (error) {
    console.error('🖼️ SLIDESHOW_IMAGE_STREAM: Error streaming image:', error);
    res.status(500).json({ error: 'Failed to stream image' });
  }
});

// Public slideshow access endpoint
app.get('/api/slideshow-access/:id', async (req, res) => {
  try {
    console.log('🎬 SLIDESHOW_ACCESS: ===== STARTING SECURITY CHECK =====');
    console.log('🎬 SLIDESHOW_ACCESS: Starting endpoint execution');
    const { id } = req.params;
    const { activationCode } = req.query;
    const authHeader = req.headers.authorization;
    
    console.log('🎬 SLIDESHOW_ACCESS: Parameters received:', { id, activationCode, hasAuth: !!authHeader });
    
    // Extract user info if authenticated (optional for public access)
    let authenticatedUser = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        authenticatedUser = decoded;
        console.log('🎬 SLIDESHOW_ACCESS: ✅ Authenticated user found:', { userId: authenticatedUser.userId, email: authenticatedUser.email });
      } catch (error) {
        console.log('🎬 SLIDESHOW_ACCESS: ❌ Invalid token, proceeding as unauthenticated');
      }
    } else {
      console.log('🎬 SLIDESHOW_ACCESS: ❌ No authentication header provided');
    }
    
    // Get slideshow details
    console.log('🎬 SLIDESHOW_ACCESS: 📋 Querying slideshow with ID:', id);
    let slideshowResult;
    try {
      slideshowResult = await pool.query(
        `SELECT s.* FROM slideshows s WHERE s.id = $1`,
        [id]
      );
      console.log('🎬 SLIDESHOW_ACCESS: ✅ Slideshow query successful, rows:', slideshowResult.rows.length);
    } catch (queryError) {
      console.error('🎬 SLIDESHOW_ACCESS: ❌ Error in slideshow query:', queryError);
      throw queryError;
    }
    
    if (slideshowResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_ACCESS: ❌ Slideshow not found:', id);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = slideshowResult.rows[0];
    console.log('🎬 SLIDESHOW_ACCESS: 📋 Slideshow details:', { 
      id: slideshow.id, 
      name: slideshow.name, 
      ownerId: slideshow.user_id,
      requiresActivation: slideshow.requires_activation_code,
      isPublic: slideshow.is_public 
    });
    
    // CRITICAL SECURITY CHECK: Is this slideshow protected?
    console.log('🎬 SLIDESHOW_ACCESS: 🔒 PROTECTION CHECK:', {
      requiresActivationCode: slideshow.requires_activation_code,
      isPublic: slideshow.is_public
    });
    
    // Get images for the slideshow (always return images for preview)
    console.log('🎬 SLIDESHOW_ACCESS: 📸 Querying images for slideshow ID:', id);
    let imagesResult;
    try {
      imagesResult = await pool.query(
        `SELECT si.* FROM slideshow_images si WHERE si.slideshow_id = $1 ORDER BY si.display_order`,
        [id]
      );
      console.log('🎬 SLIDESHOW_ACCESS: ✅ Images query successful, rows:', imagesResult.rows.length);
    } catch (queryError) {
      console.error('🎬 SLIDESHOW_ACCESS: ❌ Error in images query:', queryError);
      throw queryError;
    }
    
    // Get product links for the slideshow
    console.log('🎬 SLIDESHOW_ACCESS: 🛍️ Querying product links for slideshow ID:', id);
    let productLinksResult;
    try {
      productLinksResult = await pool.query(`
        SELECT pl.*, p.name as product_name, p.price, p.images as product_images
        FROM product_links pl
        JOIN products p ON pl.product_id = p.id
        WHERE pl.slideshow_id = $1 AND pl.is_active = true 
          AND p.is_deleted = false AND p.in_stock = true
        ORDER BY pl.display_order, pl.created_at
      `, [id]);
      console.log('🎬 SLIDESHOW_ACCESS: ✅ Product links query successful, rows:', productLinksResult.rows.length);
    } catch (queryError) {
      console.error('🎬 SLIDESHOW_ACCESS: ❌ Error in product links query:', queryError);
      productLinksResult = { rows: [] }; // Default to empty array on error
    }

    // Create slideshow object with images and product links
    console.log('🎬 SLIDESHOW_ACCESS: 📦 Creating slideshow object with images and product links');
    const slideshowWithImages = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      uniqueId: slideshow.unique_id,
      userId: slideshow.user_id, // Add userId field for MediaPlayer owner info
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      audioUrl: slideshow.audio_url,
      isPublic: slideshow.is_public,
      requiresActivationCode: slideshow.requires_activation_code,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      images: imagesResult.rows.map(img => ({
        id: img.id,
        slideshowId: img.slideshow_id,
        imageUrl: img.image_url,
        caption: img.caption,
        position: img.display_order,
        createdAt: img.created_at
      })),
      productLinks: productLinksResult.rows.map(link => ({
        id: link.product_id.toString(),
        linkId: link.id.toString(),
        title: link.title,
        url: link.url,
        description: link.description,
        imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
        images: link.product_images || (link.image_url ? [link.image_url] : []),
        displayOrder: link.display_order,
        isActive: link.is_active,
        price: link.price ? `$${(link.price / 100).toFixed(2)}` : null,
        productName: link.product_name
      }))
    };
    
    // CRITICAL SECURITY DECISION POINT
    console.log('🎬 SLIDESHOW_ACCESS: 🚨 SECURITY DECISION POINT 🚨');
    console.log('🎬 SLIDESHOW_ACCESS: Slideshow requires activation code:', slideshow.requires_activation_code);
    
    // Check if slideshow requires activation code
    if (slideshow.requires_activation_code) {
      console.log('🎬 SLIDESHOW_ACCESS: 🔒 SLIDESHOW IS PROTECTED - ACTIVATION CODE REQUIRED');
      
      // First check if authenticated user has a valid activation code attached to their profile
      if (authenticatedUser) {
        console.log('🎬 SLIDESHOW_ACCESS: 🔍 Checking user profile for valid activation codes');
        console.log('🎬 SLIDESHOW_ACCESS: User ID:', authenticatedUser.userId, 'Slideshow ID:', id);
        
        try {
          const userAccessResult = await pool.query(
            `SELECT ac.* FROM user_activation_codes uac
             JOIN activation_codes ac ON uac.activation_code_id = ac.id
             WHERE uac.user_id = $1 AND ac.slideshow_id = $2 AND ac.is_active = true
             AND (ac.expires_at IS NULL OR ac.expires_at > NOW())
             AND (ac.max_uses IS NULL OR ac.uses_count < ac.max_uses)`,
            [authenticatedUser.userId, id]
          );
          
          console.log('🎬 SLIDESHOW_ACCESS: Profile access query result:', {
            rowCount: userAccessResult.rows.length,
            codes: userAccessResult.rows.map(row => ({ 
              code: row.code, 
              slideshowId: row.slideshow_id,
              isActive: row.is_active,
              expiresAt: row.expires_at,
              maxUses: row.max_uses,
              usesCount: row.uses_count
            }))
          });
          
          if (userAccessResult.rows.length > 0) {
            console.log('🎬 SLIDESHOW_ACCESS: ✅ User has valid activation code attached to profile, granting access');
            return res.json({ 
              slideshow: slideshowWithImages,
              accessRestricted: false,
              message: 'Access granted via profile activation code'
            });
          } else {
            console.log('🎬 SLIDESHOW_ACCESS: ❌ User does not have valid activation code in profile');
          }
        } catch (error) {
          console.error('🎬 SLIDESHOW_ACCESS: ❌ Error checking user activation codes:', error);
        }
      } else {
        console.log('🎬 SLIDESHOW_ACCESS: ❌ No authenticated user to check profile access');
      }
      
      // If no profile access, check for URL-provided activation code
      console.log('🎬 SLIDESHOW_ACCESS: 🔍 Checking URL-provided activation code');
      console.log('🎬 SLIDESHOW_ACCESS: Activation code from URL:', activationCode);
      
      if (!activationCode) {
        console.log('🎬 SLIDESHOW_ACCESS: ❌ Activation code required but not provided - RETURNING DATA FOR PREVIEW');
        console.log('🎬 SLIDESHOW_ACCESS: ✅ Returning slideshow data with accessRestricted=true for 30-second preview');
        
        // PREVIEW FEATURE: Return slideshow data for 30-second preview even when protected
        return res.json({ 
          slideshow: slideshowWithImages,
          accessRestricted: true,
          message: 'Activation code required for full access - preview available'
        });
      }
      
      // Validate URL-provided activation code
      console.log('🎬 SLIDESHOW_ACCESS: 🔍 Validating URL-provided activation code:', activationCode);
      try {
        const codeResult = await pool.query(
          `SELECT ac.* FROM activation_codes ac 
           WHERE ac.code = $1 AND ac.slideshow_id = $2 AND ac.is_active = true
           AND (ac.expires_at IS NULL OR ac.expires_at > NOW())
           AND (ac.max_uses IS NULL OR ac.uses_count < ac.max_uses)`,
          [activationCode, id]
        );
        
        console.log('🎬 SLIDESHOW_ACCESS: URL code validation result:', {
          rowCount: codeResult.rows.length,
          code: codeResult.rows[0] ? {
            code: codeResult.rows[0].code,
            slideshowId: codeResult.rows[0].slideshow_id,
            isActive: codeResult.rows[0].is_active,
            expiresAt: codeResult.rows[0].expires_at,
            maxUses: codeResult.rows[0].max_uses,
            usesCount: codeResult.rows[0].uses_count
          } : null
        });
        
        if (codeResult.rows.length === 0) {
          console.log('🎬 SLIDESHOW_ACCESS: ❌ Invalid activation code provided - ACCESS DENIED');
          return res.status(403).json({ 
            error: 'Invalid activation code',
            message: 'The activation code is invalid or expired',
            requiresActivation: true
          });
        }
        
        console.log('🎬 SLIDESHOW_ACCESS: ✅ Valid activation code provided, granting access');
        
        // Update usage count
        await pool.query(
          `UPDATE activation_codes SET uses_count = uses_count + 1 WHERE id = $1`,
          [codeResult.rows[0].id]
        );
        
        return res.json({ 
          slideshow: slideshowWithImages,
          accessRestricted: false,
          message: 'Access granted via activation code'
        });
        
      } catch (error) {
        console.error('🎬 SLIDESHOW_ACCESS: ❌ Error validating activation code:', error);
        return res.status(500).json({ error: 'Failed to validate activation code' });
      }
    }
    
    // Check if slideshow is public or user has access
    console.log('🎬 SLIDESHOW_ACCESS: 🔓 SLIDESHOW IS NOT PROTECTED');
    
    // If slideshow doesn't require activation code, grant access regardless of public/private status
    // The public flag only affects whether it shows up in public listings, not access control
    console.log('🎬 SLIDESHOW_ACCESS: ✅ Slideshow does not require activation code, granting access');
    
    console.log('🎬 SLIDESHOW_ACCESS: ✅ GRANTING PUBLIC ACCESS');
    console.log('🎬 SLIDESHOW_ACCESS: ===== SECURITY CHECK COMPLETE =====');
    
    res.json({ 
      slideshow: slideshowWithImages,
      accessRestricted: false,
      message: 'Full access granted - public slideshow'
    });
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_ACCESS: ❌ CRITICAL ERROR:', error);
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
              CASE WHEN ac.playlist_id IS NOT NULL THEN 'playlist' ELSE 'slideshow' END as content_type
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.created_by = $1
       ORDER BY ac.created_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'codes');
    res.json({ activationCodes: result.rows });
  } catch (error) {
    console.error('🔴 ACTIVATION_CODES ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
  }
});

app.get('/api/activation-codes/my-access', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching user access codes for user:', req.user.userId);
    
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
    console.error('🔴 ACTIVATION_CODES ERROR:', error);
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

// Helper function to sanitize product image URLs
const sanitizeImageUrls = (urls) => {
  if (!Array.isArray(urls)) return [];

  const sanitizedUrls = urls.map(url => {
    if (typeof url !== 'string') return null;

    // Ensure HTTPS
    let newUrl = url.replace('http://', 'https://');
    
    // Replace local IP with production domain if present
    const localIpRegex = /https:\/\/192\.168\.[0-9]+\.[0-9]+:[0-9]+/;
    // Use the correct Railway deployment URL for production
    const publicBaseUrl = 'https://merchtech5-production.up.railway.app';
    newUrl = newUrl.replace(localIpRegex, publicBaseUrl);
    
    // If it's a relative path, prepend the public base URL
    if (newUrl.startsWith('/api/')) {
      newUrl = `${publicBaseUrl}${newUrl}`;
    }
    
    return newUrl;
  }).filter(Boolean); // Remove any null entries

  return sanitizedUrls;
};

// Create product
app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, description, images, price, metadata, stripe_product_id, inStock, prices, category } = req.body;
    
    console.log('🛍️ PRODUCT_CREATE: Creating product:', { 
      name, 
      description, 
      images: images?.length || 0, 
      price, 
      category,
      inStock 
    });
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_products FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_deleted = false', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxProducts;
    if (user?.max_products !== null && user?.max_products !== undefined) {
      maxProducts = user.max_products;
      console.log(`📋 Using admin-set custom limit: ${maxProducts} products for user ${req.user.userId}`);
    } else {
      const limits = {
        free: { maxProducts: 1 },
        basic: { maxProducts: 3 },
        premium: { maxProducts: 10 }
      };
      maxProducts = (limits[userTier] || limits.free).maxProducts;
      console.log(`📋 Using subscription tier limit: ${maxProducts} products for ${userTier} plan`);
    }
    
    if (currentCount >= maxProducts) {
      console.log(`🚫 Product creation blocked: User ${req.user.userId} has ${currentCount}/${maxProducts} products`);
      return res.status(403).json({ 
        error: `Product limit reached. You have reached your limit of ${maxProducts} products. Please contact support if you need to increase your limit.`,
        limit: maxProducts,
        current: currentCount,
        subscriptionTier: userTier,
        isCustomLimit: user?.max_products !== null && user?.max_products !== undefined
      });
    }

    console.log(`✅ Product creation allowed: User ${req.user.userId} has ${currentCount}/${maxProducts} products`);
    
    // Format metadata and prices for PostgreSQL
    const formattedMetadata = metadata ? JSON.stringify(metadata) : JSON.stringify({});
    const formattedPrices = prices ? JSON.stringify(prices) : null;
    const sanitizedImages = sanitizeImageUrls(images);

    // Convert price to cents for database storage
    const priceInCents = Math.round(parseFloat(price) * 100);
    
    const result = await pool.query(
      `INSERT INTO products (user_id, name, description, images, price, metadata, stripe_product_id, in_stock, prices, category, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [req.user.userId, name, description, sanitizedImages, priceInCents, formattedMetadata, stripe_product_id, inStock !== false, formattedPrices, category]
    );

    const newProduct = result.rows[0];
    console.log('✅ Product created with S3 images:', {
      id: newProduct.id,
      name: newProduct.name,
      imageCount: newProduct.images?.length || 0,
      firstImage: newProduct.images?.[0]
    });
    
    // Convert price back to dollars for frontend
    newProduct.price = newProduct.price / 100;
    
    // Attach formatted prices to response and map database fields
    if (prices) {
      newProduct.prices = prices;
    }
    
    // Map database field to frontend field
    newProduct.inStock = newProduct.in_stock;
    
    res.status(201).json({ product: newProduct });
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
      `SELECT * FROM products WHERE id = $1 AND is_deleted = false`,
      [id]
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
    
    // Convert price back to dollars for frontend
    productWithPrices.price = productWithPrices.price / 100;
    
    // Map database field to frontend field
    productWithPrices.inStock = productWithPrices.in_stock;
    
    console.log('✅ Product fetched:', productWithPrices.name);
    res.json({ product: productWithPrices });
  } catch (error) {
    console.error('🔴 GET PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Update product
app.patch('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, images, price, metadata, stripe_product_id, inStock, prices, category } = req.body;

    console.log('🛍️ PRODUCT_UPDATE: Updating product:', { 
      id, 
      name, 
      description, 
      images: images?.length || 0, 
      price, 
      category,
      inStock 
    });

    // Format metadata and prices for PostgreSQL
    const formattedMetadata = metadata ? JSON.stringify(metadata) : undefined;
    const formattedPrices = prices ? JSON.stringify(prices) : undefined;
    const sanitizedImages = images ? sanitizeImageUrls(images) : undefined;
    
    // Convert price to cents for database storage if provided
    const priceInCents = price !== undefined ? Math.round(parseFloat(price) * 100) : undefined;

    const result = await pool.query(
      `UPDATE products 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           images = COALESCE($3, images),
           price = COALESCE($4, price),
           metadata = COALESCE($5, metadata),
           stripe_product_id = COALESCE($6, stripe_product_id),
           in_stock = COALESCE($7, in_stock),
           prices = COALESCE($8, prices),
           category = COALESCE($9, category),
           updated_at = NOW()
       WHERE id = $10 AND user_id = $11 AND is_deleted = false
       RETURNING *`,
      [name, description, sanitizedImages, priceInCents, formattedMetadata, stripe_product_id, inStock, formattedPrices, category, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedProduct = result.rows[0];
    console.log('✅ Product updated with S3 images:', {
      id: updatedProduct.id,
      name: updatedProduct.name,
      imageCount: updatedProduct.images?.length || 0,
      firstImage: updatedProduct.images?.[0]
    });
    
    // Convert price back to dollars for frontend
    updatedProduct.price = updatedProduct.price / 100;
    
    // Attach formatted prices to response
    if (prices) {
      updatedProduct.prices = prices;
    }
    
    // Map database field to frontend field
    updatedProduct.inStock = updatedProduct.in_stock;
    
    res.json({ product: updatedProduct });
  } catch (error) {
    console.error('🔴 UPDATE PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Start transaction to ensure both product and links are cleaned up together
    await pool.query('BEGIN');

    try {
      // First, check if product exists and user owns it
      const productResult = await pool.query(
        `SELECT id FROM products WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
        [id, req.user.userId]
      );

      if (productResult.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found' });
      }

      // Delete associated product links first
      const linkDeleteResult = await pool.query(
        `DELETE FROM product_links WHERE product_id = $1`,
        [id]
      );

      console.log(`🔗 Cleaned up ${linkDeleteResult.rowCount} product links for product ${id}`);

      // Then mark product as deleted
      const productDeleteResult = await pool.query(
        `UPDATE products SET is_deleted = true, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND is_deleted = false
         RETURNING id`,
        [id, req.user.userId]
      );

      // Commit transaction
      await pool.query('COMMIT');

      console.log('✅ Product deleted:', id);
      console.log(`✅ Automatically cleaned up ${linkDeleteResult.rowCount} associated product links`);
      
      res.json({ 
        message: 'Product deleted successfully',
        cleanedUpLinks: linkDeleteResult.rowCount
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('🔴 DELETE PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Create playlist
app.post('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const { name, description, is_public, requires_activation_code, mediaFileIds } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    console.log('🎵 PLAYLIST_CREATE: Creating playlist:', { 
      name, 
      description, 
      is_public, 
      requires_activation_code,
      mediaFileIds: mediaFileIds?.length || 0
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

    // Add media files to playlist if provided
    if (mediaFileIds && mediaFileIds.length > 0) {
      console.log('🎵 PLAYLIST_CREATE: Adding media files to playlist:', mediaFileIds);
      for (let i = 0; i < mediaFileIds.length; i++) {
        await pool.query(
          `INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3)`,
          [playlist.id, mediaFileIds[i], i + 1]
        );
        console.log(`🎵 PLAYLIST_CREATE: Added media ${mediaFileIds[i]} to playlist at position ${i + 1}`);
      }
    }

    // Fetch complete playlist with media files
    const completePlaylist = await getPlaylistWithMedia(playlist.id);
    res.status(201).json({ playlist: completePlaylist });
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
    console.log('📱 QR_CODES: ============ CREATE QR CODE DEBUG START ============');
    console.log('📱 QR_CODES: Request body size:', JSON.stringify(req.body).length, 'characters');
    console.log('📱 QR_CODES: Request body (truncated):', JSON.stringify(req.body, null, 2).substring(0, 1000) + '...');
    console.log('📱 QR_CODES: Authenticated user:', req.user);
    
    const { name, url, description, contentType, options, playlist_id, slideshow_id, metadata } = req.body;
    
    if (!name || !url) {
      console.log('📱 QR_CODES: Validation failed - missing name or url:', { name, url });
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    console.log('📱 QR_CODES: Creating QR code:', { name, url, contentType });
    
    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_qr_codes FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM qr_codes WHERE user_id = $1', [req.user.userId]);
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

    // Generate QR code data
    const qrCodeData = `qr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Compress logo data if present
    let compressedOptions = options;
    if (options?.logo?.imageData) {
      const imageData = options.logo.imageData;
      console.log('📱 QR_CODES: Original logo size:', imageData.length, 'characters');
      
      // If logo is too large, remove it to prevent payload issues
      if (imageData.length > 100000) { // 100KB limit
        console.log('📱 QR_CODES: Logo too large, removing to prevent payload error');
        compressedOptions = {
          ...options,
          logo: {
            ...options.logo,
            imageData: undefined
          }
        };
      }
    }
    
    // 🎨 GENERATE QR CODE IMAGE
    console.log('📱 QR_CODES: Generating QR code image...');
    const QRCode = require('qrcode');
    
    // Configure QR code options
    const qrOptions = {
      width: compressedOptions?.size || 300,
      margin: 2,
      color: {
        dark: compressedOptions?.foregroundColor || '#000000',
        light: compressedOptions?.backgroundColor || '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    };
    
    // Generate QR code as buffer
    const qrCodeBuffer = await QRCode.toBuffer(url, qrOptions);
    console.log('📱 QR_CODES: QR code image generated, size:', qrCodeBuffer.length, 'bytes');
    
    // 📤 UPLOAD QR CODE IMAGE TO S3
    let qrCodeImageUrl = null;
    
    if (s3Service) {
      try {
        console.log('📱 QR_CODES: Uploading QR code image to S3...');
        const s3Key = `users/${req.user.userId}/qr-codes/${qrCodeData}.png`;
        const uploadResult = await s3Service.uploadFile(qrCodeBuffer, s3Key, 'image/png');
        qrCodeImageUrl = uploadResult.Location || uploadResult.location || `https://merchtechbucket.s3.us-east-2.amazonaws.com/${s3Key}`;
        console.log('📱 QR_CODES: QR code image uploaded to S3:', qrCodeImageUrl);
      } catch (s3Error) {
        console.error('📱 QR_CODES: S3 upload failed, using local storage:', s3Error);
        // Fall back to local storage
        const filename = `qr-${qrCodeData}.png`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, qrCodeBuffer);
        qrCodeImageUrl = `http://localhost:${PORT}/uploads/${filename}`;
        console.log('📱 QR_CODES: QR code image saved locally:', qrCodeImageUrl);
      }
    } else {
      // Local storage only
      const filename = `qr-${qrCodeData}.png`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, qrCodeBuffer);
      qrCodeImageUrl = `http://localhost:${PORT}/uploads/${filename}`;
      console.log('📱 QR_CODES: QR code image saved locally:', qrCodeImageUrl);
    }
    
    // 💾 SAVE QR CODE TO DATABASE
    const result = await pool.query(
      `INSERT INTO qr_codes (user_id, name, url, playlist_id, slideshow_id, metadata, options, description, qr_code_data, qr_code_image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        req.user.userId, 
        name, 
        url, 
        playlist_id, 
        slideshow_id, 
        metadata ? JSON.stringify(metadata) : null,
        compressedOptions ? JSON.stringify(compressedOptions) : null,
        description,
        qrCodeData,
        qrCodeImageUrl
      ]
    );

    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options,
      metadata: typeof result.rows[0].metadata === 'string' ? JSON.parse(result.rows[0].metadata) : result.rows[0].metadata,
      scanCount: 0,
      qrCodeImageUrl: qrCodeImageUrl
    };
    
    console.log('📱 QR_CODES: QR code created successfully:', {
      name: qrCode.name,
      imageUrl: qrCode.qr_code_image_url,
      storageLocation: qrCodeImageUrl?.includes('amazonaws.com') ? 'S3' : 'Local'
    });
    console.log('📱 QR_CODES: ============ CREATE QR CODE DEBUG END ============');
    res.status(201).json({ qrCode });
  } catch (error) {
    console.error('📱 QR_CODES: Error creating QR code:', error);
    console.error('📱 QR_CODES: Error stack:', error.stack);
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

// Update slideshow audio
app.patch('/api/slideshows/:id/audio', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { audioUrl } = req.body;

    console.log('🎵 SLIDESHOW_AUDIO: Updating audio for slideshow:', id);
    console.log('🎵 SLIDESHOW_AUDIO: Has file upload:', !!req.file);
    console.log('🎵 SLIDESHOW_AUDIO: audioUrl from body:', audioUrl);

    let finalAudioUrl = audioUrl;
    
    // If audioUrl is an object with Location property, extract the URL
    if (typeof audioUrl === 'object' && audioUrl && audioUrl.Location) {
      finalAudioUrl = audioUrl.Location;
      console.log('🎵 SLIDESHOW_AUDIO: Extracted URL from S3 response object:', finalAudioUrl);
    }

    // If a file was uploaded, process it
    if (req.file) {
      console.log('🎵 SLIDESHOW_AUDIO: Processing file upload:', req.file.originalname);
      
      // Check if user owns the slideshow
      const slideshowResult = await pool.query(
        'SELECT user_id FROM slideshows WHERE id = $1',
        [id]
      );
      
      if (slideshowResult.rows.length === 0) {
        return res.status(404).json({ error: 'Slideshow not found' });
      }
      
      if (slideshowResult.rows[0].user_id !== req.user.userId) {
        return res.status(403).json({ error: 'Not authorized to upload to this slideshow' });
      }

      // Upload to S3 or save locally
      if (s3Service) {
        try {
          console.log('🎵 SLIDESHOW_AUDIO: Uploading to S3...');
          console.log('🎵 SLIDESHOW_AUDIO: User ID:', req.user.userId);
          const key = `users/${req.user.userId}/media/${Date.now()}-${Math.floor(Math.random() * 1000000000)}.${req.file.originalname.split('.').pop()}`;
          console.log('🎵 SLIDESHOW_AUDIO: S3 key:', key);
          const uploadResult = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);
          console.log('🎵 SLIDESHOW_AUDIO: S3 upload result:', uploadResult);
          finalAudioUrl = uploadResult.Location || uploadResult.location || `https://merchtechbucket.s3.us-east-2.amazonaws.com/${key}`;
          console.log('🎵 SLIDESHOW_AUDIO: S3 upload successful:', finalAudioUrl);
        } catch (s3Error) {
          console.error('🎵 SLIDESHOW_AUDIO: S3 upload failed, using local storage:', s3Error);
          // Fall back to local storage
          const filename = `audio-${Date.now()}-${Math.floor(Math.random() * 1000000000)}.${req.file.originalname.split('.').pop()}`;
          const filePath = path.join(uploadsDir, filename);
          fs.writeFileSync(filePath, req.file.buffer);
          finalAudioUrl = `http://localhost:${PORT}/uploads/${filename}`;
          console.log('🎵 SLIDESHOW_AUDIO: Local storage successful:', finalAudioUrl);
        }
      } else {
        // Local storage only
        const filename = `audio-${Date.now()}-${Math.floor(Math.random() * 1000000000)}.${req.file.originalname.split('.').pop()}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);
        finalAudioUrl = `http://localhost:${PORT}/uploads/${filename}`;
        console.log('🎵 SLIDESHOW_AUDIO: Local storage successful:', finalAudioUrl);
      }
    }

    console.log('🎵 SLIDESHOW_AUDIO: Final audio URL:', finalAudioUrl);

    const result = await pool.query(
      `UPDATE slideshows 
       SET audio_url = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [finalAudioUrl, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    const slideshowRow = result.rows[0];
    console.log('🎵 SLIDESHOW_AUDIO: Audio updated successfully for slideshow:', slideshowRow.name);
    
    // Get images for the slideshow
    const imagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [id]
    );
    
    // Format the response to match frontend expectations
    const slideshow = {
      id: slideshowRow.id,
      name: slideshowRow.name,
      description: slideshowRow.description,
      uniqueId: slideshowRow.unique_id,
      autoplayInterval: slideshowRow.autoplay_interval,
      transition: slideshowRow.transition,
      audioUrl: slideshowRow.audio_url,
      requiresActivationCode: slideshowRow.requires_activation_code,
      createdAt: slideshowRow.created_at,
      images: imagesResult.rows.map(img => ({
        id: img.id,
        slideshowId: img.slideshow_id,
        imageUrl: img.image_url,
        caption: img.caption,
        displayOrder: img.display_order
      }))
    };
    
    console.log('🎵 SLIDESHOW_AUDIO: Returning formatted slideshow with', slideshow.images.length, 'images');
    console.log('🎵 SLIDESHOW_AUDIO: Final slideshow audioUrl field:', slideshow.audioUrl);
    console.log('🎵 SLIDESHOW_AUDIO: Final slideshow object keys:', Object.keys(slideshow));
    res.json(slideshow);
  } catch (error) {
    console.error('🎵 SLIDESHOW_AUDIO: Error updating audio:', error);
    res.status(500).json({ error: 'Failed to update slideshow audio' });
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
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.playlist_id = $1 AND pl.is_active = true 
        AND p.is_deleted = false AND p.in_stock = true
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

// Slideshow product links endpoints
app.get('/api/slideshows/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.slideshow_id = $1 AND pl.is_active = true 
        AND p.is_deleted = false AND p.in_stock = true
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

    console.log('🔗 PRODUCT_LINK: Adding product link to slideshow:', { slideshowId: id, productId, userId: req.user.userId });

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

    console.log('✅ PRODUCT_LINK: Product link created for slideshow:', result.rows[0]);
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
      DELETE FROM product_links 
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
    
    
    // Enhanced authentication check for chat
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Authentication required to post messages' });
    }

    // Check if user is verified (optional - uncomment if you want to require email verification)
    // const userResult = await pool.query('SELECT is_email_verified FROM users WHERE id = $1', [req.user.userId]);
    // if (!userResult.rows[0]?.is_email_verified) {
    //   return res.status(403).json({ error: 'Email verification required to post messages' });
    // }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    console.log('🔴 CHAT: Creating message for playlist:', playlistId, 'by user:', req.user.userId);

    // Check if playlist exists
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1', [playlistId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const result = await pool.query(`
      INSERT INTO chat_messages (playlist_id, user_id, message)
      VALUES ($1, $2, $3) RETURNING *
    `, [playlistId, req.user.userId, message.trim()]);

    const newMessageResult = await pool.query(`
      SELECT cm.*, u.username
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.id = $1
    `, [result.rows[0].id]);

    const newMessage = newMessageResult.rows[0];
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

    console.log('🔴 CHAT: Message created successfully:', formattedMessage.id);
    res.status(201).json({ message: formattedMessage });
  } catch (error) {
    console.error('❌ Send playlist message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.delete('/api/playlists/:playlistId/chat/:messageId', authenticateToken, async (req, res) => {
  try {
    const { id, messageId } = req.params;
    
    // Check if message exists and user owns it
    const messageResult = await pool.query(`
      SELECT user_id FROM chat_messages 
      WHERE id = $1 AND playlist_id = $2
    `, [messageId, playlistId]);

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await pool.query('UPDATE chat_messages SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1', [messageId]);

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

// ---------- UNIVERSAL CHAT ENDPOINTS ----------

// Get universal chat messages with filtering
app.get('/api/chat/universal', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      filterType = 'all', // all, user_store, category
      userId = null, // for user_store filter
      category = null, // for category filter
      messageType = null // general, store_promotion, product_showcase
    } = req.query;

    console.log('🌍 UNIVERSAL_CHAT: Fetching messages with filters:', {
      filterType, userId, category, messageType, limit, offset
    });

    let whereClause = 'WHERE ucm.is_deleted = FALSE';
    let queryParams = [];
    let paramCount = 1;

    // Apply filters based on filterType
    if (filterType === 'user_store' && userId) {
      whereClause += ` AND ucm.related_store_user_id = $${paramCount}`;
      queryParams.push(userId);
      paramCount++;
    } else if (filterType === 'category' && category) {
      whereClause += ` AND ucm.product_category = $${paramCount}`;
      queryParams.push(category);
      paramCount++;
    }

    // Apply message type filter if specified
    if (messageType) {
      whereClause += ` AND ucm.message_type = $${paramCount}`;
      queryParams.push(messageType);
      paramCount++;
    }

    // Add limit and offset
    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(`
      SELECT ucm.*, u.username,
             CASE 
               WHEN ucm.related_product_id IS NOT NULL THEN p.name
               ELSE NULL
             END as related_product_name,
             CASE 
               WHEN ucm.related_store_user_id IS NOT NULL THEN su.username
               ELSE NULL
             END as related_store_username
      FROM universal_chat_messages ucm 
      JOIN users u ON ucm.user_id = u.id 
      LEFT JOIN products p ON ucm.related_product_id = p.id
      LEFT JOIN users su ON ucm.related_store_user_id = su.id
      ${whereClause}
      ORDER BY ucm.is_pinned DESC, ucm.created_at DESC 
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, queryParams);

    const messages = result.rows.map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      messageType: msg.message_type,
      relatedProductId: msg.related_product_id,
      relatedProductName: msg.related_product_name,
      relatedStoreUserId: msg.related_store_user_id,
      relatedStoreUsername: msg.related_store_username,
      productCategory: msg.product_category,
      isPinned: msg.is_pinned,
      replyToId: msg.reply_to_id,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      isDeleted: msg.is_deleted
    }));

    console.log('🌍 UNIVERSAL_CHAT: Found', messages.length, 'messages');
    res.json({ 
      messages: messages.reverse(), // Reverse to show oldest first
      filters: { filterType, userId, category, messageType },
      pagination: { limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    console.error('❌ Universal chat fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

// Post universal chat message
app.post('/api/chat/universal', authenticateToken, async (req, res) => {
  try {
    const { 
      message, 
      messageType = 'general', 
      relatedProductId = null,
      relatedStoreUserId = null,
      productCategory = null 
    } = req.body;
    
    // Enhanced authentication check
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Authentication required to post messages' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    // Validate message type
    const validMessageTypes = ['general', 'store_promotion', 'product_showcase'];
    if (!validMessageTypes.includes(messageType)) {
      return res.status(400).json({ error: 'Invalid message type' });
    }

    console.log('🌍 UNIVERSAL_CHAT: Creating message by user:', req.user.userId, 'type:', messageType);

    // If related product ID is provided, get its category
    let finalProductCategory = productCategory;
    if (relatedProductId && !finalProductCategory) {
      const productResult = await pool.query('SELECT category FROM products WHERE id = $1', [relatedProductId]);
      if (productResult.rows.length > 0) {
        finalProductCategory = productResult.rows[0].category;
      }
    }

    const result = await pool.query(`
      INSERT INTO universal_chat_messages (
        user_id, message, message_type, related_product_id, 
        related_store_user_id, product_category
      )
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [
      req.user.userId, 
      message.trim(), 
      messageType, 
      relatedProductId, 
      relatedStoreUserId || req.user.userId, // Default to current user's store
      finalProductCategory
    ]);

    // Fetch the complete message with joined data
    const newMessageResult = await pool.query(`
      SELECT ucm.*, u.username,
             CASE 
               WHEN ucm.related_product_id IS NOT NULL THEN p.name
               ELSE NULL
             END as related_product_name,
             CASE 
               WHEN ucm.related_store_user_id IS NOT NULL THEN su.username
               ELSE NULL
             END as related_store_username
      FROM universal_chat_messages ucm
      JOIN users u ON ucm.user_id = u.id
      LEFT JOIN products p ON ucm.related_product_id = p.id
      LEFT JOIN users su ON ucm.related_store_user_id = su.id
      WHERE ucm.id = $1
    `, [result.rows[0].id]);

    const newMessage = newMessageResult.rows[0];
    const formattedMessage = {
      id: newMessage.id,
      userId: newMessage.user_id,
      username: newMessage.username,
      message: newMessage.message,
      messageType: newMessage.message_type,
      relatedProductId: newMessage.related_product_id,
      relatedProductName: newMessage.related_product_name,
      relatedStoreUserId: newMessage.related_store_user_id,
      relatedStoreUsername: newMessage.related_store_username,
      productCategory: newMessage.product_category,
      isPinned: newMessage.is_pinned,
      replyToId: newMessage.reply_to_id,
      createdAt: newMessage.created_at,
      updatedAt: newMessage.updated_at,
      isDeleted: newMessage.is_deleted
    };

    console.log('🌍 UNIVERSAL_CHAT: Message created successfully:', formattedMessage.id);
    res.status(201).json({ message: formattedMessage });
  } catch (error) {
    console.error('❌ Universal chat post error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get available product categories for filtering
app.get('/api/chat/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category 
      FROM products 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);

    const categories = result.rows.map(row => row.category);
    console.log('🌍 UNIVERSAL_CHAT: Available categories:', categories);
    
    res.json({ categories });
  } catch (error) {
    console.error('❌ Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Stream slideshow image endpoint
app.get('/api/slideshow-images/:imageId/stream', async (req, res) => {
  try {
    const { imageId } = req.params;
    console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Streaming image with ID: ${imageId}`);

    const result = await pool.query('SELECT image_url FROM slideshow_images WHERE id = $1', [imageId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const imageUrl = result.rows[0].image_url;

    if (imageUrl.includes('amazonaws.com')) {
      const key = new URL(imageUrl).pathname.substring(1);
      const metadata = await s3Service.getMetadata(key);
      const s3Stream = s3Service.getStream(key);

      res.setHeader('Content-Type', metadata.ContentType || 'image/jpeg');
      if (metadata.ContentLength) {
        res.setHeader('Content-Length', metadata.ContentLength);
      }
      
      console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Streaming image directly from S3.`);
      
      // Add robust error handling to the stream to prevent server crashes
      s3Stream.on('error', (err) => {
        console.error('❌ S3 IMAGE STREAM ERROR:', err);
        if (!res.headersSent) {
          res.status(500).send('Error streaming image file');
        }
      }).pipe(res);
      return;
    }
    
    console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Serving local image: ${imageUrl}`);
    const filePath = path.join(__dirname, '../../uploads', path.basename(imageUrl));
    console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: Looking for file at: ${filePath}`);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    } else {
      console.log(`🖼️ SLIDESHOW_IMAGE_STREAM: File not found at: ${filePath}`);
      return res.status(404).send('Local file not found');
    }
  } catch (error) {
    console.error('🖼️ SLIDESHOW_IMAGE_STREAM: Error streaming image:', error);
    res.status(500).json({ error: 'Failed to stream image' });
  }
});

// S3 Image proxy endpoint for serving private S3 images (public endpoint)
app.get('/api/images/s3/:userId/:filename', async (req, res) => {
  try {
    const { userId, filename } = req.params;
    
    if (!s3Service) {
      return res.status(500).json({ error: 'S3 service not configured' });
    }

    // Construct the S3 key
    const key = `users/${userId}/media/${filename}`;
    
    console.log('🖼️ IMAGE PROXY: Serving image:', key);
    
    // Get the image from S3 and stream it directly
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { S3Client } = require('@aws-sdk/client-s3');
    
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME || 'merchtechbucket',
      Key: key,
    });
    
    const response = await s3Client.send(command);
    
    // Determine correct Content-Type based on file extension if S3 metadata is wrong
    let contentType = response.ContentType || 'image/png';
    
    // Fix incorrect Content-Type from S3 metadata - force correction for debugging
    console.log(`🖼️ IMAGE PROXY: Original Content-Type from S3: ${response.ContentType}`);
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      'ico': 'image/x-icon'
    };
    contentType = mimeTypes[ext] || 'image/jpeg';
    console.log(`🖼️ IMAGE PROXY: Corrected Content-Type to ${contentType} based on extension .${ext}`);
    
    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('ETag', response.ETag);
    
    console.log('🖼️ IMAGE PROXY: Streaming image directly from S3 with Content-Type:', contentType);
    
    // Stream the image data to the client
    response.Body.pipe(res);
    
  } catch (error) {
    console.error('❌ S3 image proxy error:', error);
    res.status(404).json({ error: 'Image not found' });
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

// Migration endpoint to fix existing product images (admin only)
app.post('/api/admin/migrate-product-images', isAdmin, async (req, res) => {
  try {
    console.log('🔍 MIGRATION: Starting product image URL migration...');
    
    // Get all products with images
    const result = await pool.query(`
      SELECT id, name, images 
      FROM products 
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 0
      AND is_deleted = false
    `);
    
    console.log(`📦 MIGRATION: Found ${result.rows.length} products with images`);
    
    let updatedCount = 0;
    const updatedProducts = [];
    
    for (const product of result.rows) {
      const originalImages = product.images;
      const sanitizedImages = sanitizeImageUrls(originalImages);
      
      // Check if any URLs were changed
      const hasChanges = JSON.stringify(originalImages) !== JSON.stringify(sanitizedImages);
      
      if (hasChanges) {
        console.log(`🔧 MIGRATION: Updating product "${product.name}" (ID: ${product.id})`);
        
        await pool.query(
          'UPDATE products SET images = $1, updated_at = NOW() WHERE id = $2',
          [sanitizedImages, product.id]
        );
        
        updatedProducts.push({
          id: product.id,
          name: product.name,
          before: originalImages[0],
          after: sanitizedImages[0]
        });
        
        updatedCount++;
      }
    }
    
    console.log(`✅ MIGRATION: Complete! Updated ${updatedCount} products with sanitized image URLs`);
    
    res.json({
      success: true,
      message: `Migration complete! Updated ${updatedCount} products with sanitized image URLs`,
      updatedCount,
      updatedProducts
    });
    
  } catch (error) {
    console.error('❌ MIGRATION: Error fixing product images:', error);
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
});

module.exports = app;