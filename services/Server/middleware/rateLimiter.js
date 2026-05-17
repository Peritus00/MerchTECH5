const rateLimit = require('express-rate-limit');
const { rateLimitViolationHandler } = require('../config/security');

// Rate limiter for authentication endpoints (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 failed attempts per windowMs (increased from 5)
  message: { error: 'Too many login attempts, please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins - only failed attempts count
  validate: { trustProxy: false }, // Suppress warning - Railway proxy is trusted and correctly configured
});

// Rate limiter for presigned URL generation (upload initiation)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 presigned URL requests per hour
  message: { error: 'Too many upload requests, please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // Suppress warning - Railway proxy is trusted and correctly configured
});

// Rate limiter for general API endpoints
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  validate: { trustProxy: false }, // Suppress warning - Railway proxy is trusted and correctly configured
});

// Rate limiter for media creation/confirmation endpoints (POST/PUT/PATCH/DELETE only)
const mediaCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 media creation requests per 15 minutes
  message: { error: 'Too many media creation requests, please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // Suppress warning - Railway proxy is trusted and correctly configured
  skip: (req) => {
    // Only apply to write operations (POST, PUT, PATCH, DELETE)
    return !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  },
});

// Rate limiter for media GET requests (more lenient for reading media)
const mediaReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 media read requests per 15 minutes (much higher for normal usage)
  message: { error: 'Too many media read requests, please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  validate: { trustProxy: false }, // Suppress warning - Railway proxy is trusted and correctly configured
});

// Rate limiter for media stream endpoints (very lenient - streaming is expected to be frequent)
const mediaStreamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 stream requests per 15 minutes
  message: { error: 'Too many media stream requests, please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  validate: { trustProxy: false }, // Suppress warning - Railway proxy is trusted and correctly configured
});

// Rate limiter for coupon SMS send (abuse protection)
const smsSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 SMS sends per IP per hour
  message: { error: 'Too many SMS requests. Please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// Preview phone verification start (abuse protection)
const previewLeadStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  message: { error: 'Too many preview verification requests. Please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// Bulk SMS campaign from preview leads (one POST can send many texts — keep requests rare)
const previewLeadCampaignSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many campaign send requests. Please try again later.' },
  handler: rateLimitViolationHandler,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

module.exports = {
  authLimiter,
  uploadLimiter,
  generalApiLimiter,
  mediaCreationLimiter,
  mediaReadLimiter,
  mediaStreamLimiter,
  smsSendLimiter,
  previewLeadStartLimiter,
  previewLeadCampaignSendLimiter,
};

