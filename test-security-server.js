const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

const app = express();
const PORT = 5002;

// Security logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/security-test.log' })
  ]
});

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3, // Lower limit for testing
  message: { error: 'Rate limit exceeded' },
  handler: (req, res) => {
    securityLogger.warn({
      type: 'rate_limit_exceeded',
      ip: req.ip,
      url: req.url,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({ error: 'Rate limit exceeded' });
  }
});

// Apply security middleware
app.use(helmet());
app.use(express.json());
app.use('/test-auth', authLimiter);

// Logging middleware
app.use((req, res, next) => {
  securityLogger.info({
    type: 'request',
    ip: req.ip,
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
  next();
});

// Test routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', security: 'enabled' });
});

app.post('/test-auth', (req, res) => {
  res.json({ message: 'Auth endpoint reached' });
});

app.listen(PORT, () => {
  console.log(`🔒 Security test server running on port ${PORT}`);
  console.log('Test with:');
  console.log(`  curl -I http://localhost:${PORT}/health`);
  console.log(`  curl -X POST http://localhost:${PORT}/test-auth`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n🔒 Security test server shutting down...');
  process.exit(0);
}); 