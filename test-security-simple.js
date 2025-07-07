const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const winston = require('winston');

console.log('✅ helmet loaded:', typeof helmet);
console.log('✅ rateLimit loaded:', typeof rateLimit);
console.log('✅ slowDown loaded:', typeof slowDown);
console.log('✅ express-validator loaded:', typeof body, typeof validationResult);
console.log('✅ winston loaded:', typeof winston);

// Test basic functionality
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Test rate limit'
});

console.log('✅ Rate limiter created:', typeof limiter);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ]
});

logger.info('✅ Security packages test successful'); 