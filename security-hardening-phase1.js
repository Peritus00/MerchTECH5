// MerchTech Security Hardening - Phase 1: Critical Security Implementation
// Add this to your services/Server/main.js file

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const winston = require('winston');
const multer = require('multer');
const path = require('path');

// Security Logger Setup
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/security.log' }),
    new winston.transports.Console({ level: 'error' })
  ]
});

// Rate Limiting Configuration
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
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
      res.status(429).json({ error: message });
    }
  });
};

// Different rate limiters for different endpoints
const generalApiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests from this IP, please try again later.'
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 login attempts per window
  'Too many login attempts, please try again later.'
);

const uploadLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // 10 uploads per hour
  'Too many file uploads, please try again later.'
);

// Slow down middleware for repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 10, // allow 10 requests per window without delay
  delayMs: () => 500, // add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // maximum delay of 20 seconds
});

// Security Headers Configuration
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
};

// Secure File Upload Configuration
const createSecureUpload = (uploadDir) => {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  });

  const fileFilter = (req, file, cb) => {
    const allowedTypes = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/mp4': '.m4a',
      'video/mp4': '.mp4',
      'video/webm': '.webm'
    };

    if (allowedTypes[file.mimetype]) {
      cb(null, true);
    } else {
      securityLogger.warn({
        type: 'invalid_file_upload',
        ip: req.ip,
        filename: file.originalname,
        mimetype: file.mimetype,
        timestamp: new Date().toISOString()
      });
      cb(new Error('Invalid file type. Only images, audio, and video files are allowed.'), false);
    }
  };

  return multer({
    storage: storage,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
      files: 1, // Maximum 1 file per request
    },
    fileFilter: fileFilter,
  });
};

// Input Validation Middleware
const validateInput = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    securityLogger.warn({
      type: 'validation_error',
      ip: req.ip,
      url: req.url,
      errors: errors.array(),
      timestamp: new Date().toISOString()
    });
    return res.status(400).json({
      error: 'Invalid input data',
      details: errors.array()
    });
  }
  next();
};

// Common validation rules
const validationRules = {
  email: body('email').isEmail().normalizeEmail().trim(),
  password: body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least 8 characters including uppercase, lowercase, number, and special character'),
  username: body('username').isLength({ min: 3, max: 20 }).isAlphanumeric().trim(),
  name: body('name').isLength({ min: 1, max: 100 }).trim().escape(),
  description: body('description').optional().isLength({ max: 1000 }).trim().escape(),
};

// Security Event Logging Middleware
const securityEventLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      type: 'api_request',
      ip: req.ip,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: duration,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    // Log suspicious activity
    if (res.statusCode >= 400 || duration > 5000) {
      securityLogger.warn(logData);
    } else {
      securityLogger.info(logData);
    }
  });

  next();
};

// Enhanced Error Handler
const securityErrorHandler = (err, req, res, next) => {
  securityLogger.error({
    type: 'application_error',
    ip: req.ip,
    url: req.url,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};

// Suspicious Activity Detection
const suspiciousActivityDetector = (req, res, next) => {
  const suspiciousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT|JAVASCRIPT|VBSCRIPT|ONLOAD|ONERROR)\b)/i,
    /<script[^>]*>.*?<\/script>/gi,
    /(\b(eval|setTimeout|setInterval|Function|XMLHttpRequest)\s*\()/i,
  ];

  const checkForSuspiciousContent = (obj) => {
    if (typeof obj === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(obj));
    }
    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(value => checkForSuspiciousContent(value));
    }
    return false;
  };

  if (checkForSuspiciousContent(req.body) || checkForSuspiciousContent(req.query)) {
    securityLogger.error({
      type: 'suspicious_activity',
      ip: req.ip,
      url: req.url,
      method: req.method,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });
    return res.status(400).json({ error: 'Suspicious activity detected' });
  }

  next();
};

// Export all security middleware
module.exports = {
  // Rate limiting
  generalApiLimiter,
  authLimiter,
  uploadLimiter,
  speedLimiter,
  
  // Security headers
  helmet: helmet(helmetConfig),
  
  // File upload
  createSecureUpload,
  
  // Input validation
  validateInput,
  validationRules,
  
  // Logging and monitoring
  securityEventLogger,
  securityErrorHandler,
  suspiciousActivityDetector,
  securityLogger,
  
  // CORS configuration
  corsConfig: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://app.merchtech.net', 'https://merchtech.net']
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }
};

// Usage example for your main.js:
/*
const security = require('./security-hardening-phase1');

// Apply security middleware in order
app.use(security.helmet);
app.use(cors(security.corsConfig));
app.use(security.speedLimiter);
app.use(security.securityEventLogger);
app.use(security.suspiciousActivityDetector);
app.use(express.json({ limit: '10mb' }));

// Apply rate limiting to different routes
app.use('/api/', security.generalApiLimiter);
app.use('/api/auth/', security.authLimiter);
app.use('/api/upload/', security.uploadLimiter);

// Apply validation to specific routes
app.post('/api/auth/login', 
  security.validationRules.email,
  security.validationRules.password,
  security.validateInput,
  loginHandler
);

// Error handling (add at the end)
app.use(security.securityErrorHandler);
*/ 