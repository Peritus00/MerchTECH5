const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Reduce log noise from extremely high-frequency endpoints (streaming, preflight, static assets).
// This prevents stdout/backpressure issues that can stall the Node event loop under load.
const shouldSkipRequestResponseLog = (req) => {
  const url = req.originalUrl || '';

  // Preflight requests can be extremely frequent and low-signal.
  if (req.method === 'OPTIONS') return true;

  // Media streaming endpoints generate many range requests and can spam logs.
  if (/^\/api\/media\/\d+\/stream\b/.test(url)) return true;
  if (/^\/api\/slideshow-(audio|images)\/.+\/stream\b/.test(url)) return true;

  // Common static assets (especially on web) that don't need per-request logging.
  if (/^\/(favicon\.ico|robots\.txt|manifest\.json|apple-touch-icon.*\.png)$/.test(url)) return true;

  return false;
};

// Ensure logs directory exists (gracefully handle if it doesn't)
let logsDirExists = false;
try {
  const logsDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  logsDirExists = true;
} catch (err) {
  // Log directory creation failed - continue with console-only logging
  console.warn('⚠️  Could not create logs directory, using console-only logging:', err.message);
}

// Create structured logger
const loggerTransports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
];

// Only add file transport if logs directory exists and is writable
if (logsDirExists) {
  try {
    loggerTransports.push(
      new winston.transports.File({ 
        filename: path.join(__dirname, '../../logs/combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
  } catch (err) {
    console.warn('⚠️  Could not add file transport, using console-only logging:', err.message);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: loggerTransports
});

// Request ID middleware - adds unique ID to each request
const requestIdMiddleware = (req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const skip = shouldSkipRequestResponseLog(req);
  
  // Log request
  // Use debug to avoid production log floods; raise LOG_LEVEL to 'debug' when needed.
  if (!skip) {
    logger.debug({
      type: 'request',
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.userId,
      timestamp: new Date().toISOString()
    });
  }

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    if (!skip) {
      logger.debug({
        type: 'response',
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Sanitize logs to remove sensitive data
const sanitizeLogData = (data) => {
  const sensitiveKeys = ['password', 'password_hash', 'token', 'authorization', 'cookie', 'aws_access_key_id', 'aws_secret_access_key', 'jwt_secret', 'stripe_secret_key'];
  const sanitized = { ...data };
  
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  // Recursively sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }
  
  return sanitized;
};

module.exports = {
  logger,
  requestIdMiddleware,
  requestLogger,
  sanitizeLogData
};

