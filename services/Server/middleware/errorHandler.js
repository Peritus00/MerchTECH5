const winston = require('winston');

// Create logger for errors
const errorLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Centralized error handler middleware
const errorHandler = (err, req, res, next) => {
  // Log error with context
  errorLogger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.userId,
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Handle specific error types
  if (err.code === 'FILE_TYPE_NOT_ALLOWED') {
    return res.status(400).json({ 
      error: 'Invalid file type',
      message: err.message 
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed',
      message: err.message 
    });
  }

  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Authentication required' 
    });
  }

  if (err.status === 403) {
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'You do not have permission to access this resource' 
    });
  }

  if (err.status === 404) {
    return res.status(404).json({ 
      error: 'Not found',
      message: 'The requested resource was not found' 
    });
  }

  // Generic error response
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? err.message : 'An unexpected error occurred. Please try again later.',
    ...(isDevelopment && { stack: err.stack })
  });
};

module.exports = {
  errorHandler,
  errorLogger
};

