/**
 * Phase 5: Advanced Security Features
 * Comprehensive API security, input sanitization, and security audit logging
 */

const { logger } = require('../middleware/logger');
const errorLogger = require('../middleware/errorHandler').errorLogger;

/**
 * Security audit logger
 * Logs all security-relevant events for compliance and forensics
 */
class SecurityAuditLogger {
  constructor() {
    this.auditLogs = [];
    this.maxLogs = 1000; // Keep last 1000 audit logs in memory
  }

  /**
   * Log a security event
   */
  log(event) {
    const auditEvent = {
      type: event.type,
      severity: event.severity || 'info',
      userId: event.userId || null,
      ip: event.ip || null,
      userAgent: event.userAgent || null,
      action: event.action,
      resource: event.resource || null,
      details: event.details || {},
      success: event.success !== undefined ? event.success : true,
      timestamp: new Date().toISOString(),
      requestId: event.requestId || null
    };

    // Add to in-memory log
    this.auditLogs.push(auditEvent);
    if (this.auditLogs.length > this.maxLogs) {
      this.auditLogs.shift();
    }

    // Log to Winston based on severity
    const logData = {
      type: 'security_audit',
      ...auditEvent
    };

    switch (auditEvent.severity) {
      case 'critical':
        errorLogger.error(logData);
        break;
      case 'high':
        errorLogger.warn(logData);
        break;
      case 'medium':
        logger.warn(logData);
        break;
      default:
        logger.info(logData);
    }

    return auditEvent;
  }

  /**
   * Get audit logs
   */
  getLogs(filters = {}) {
    let logs = [...this.auditLogs];

    if (filters.type) {
      logs = logs.filter(log => log.type === filters.type);
    }
    if (filters.severity) {
      logs = logs.filter(log => log.severity === filters.severity);
    }
    if (filters.userId) {
      logs = logs.filter(log => log.userId === filters.userId);
    }
    if (filters.success !== undefined) {
      logs = logs.filter(log => log.success === filters.success);
    }
    if (filters.startDate) {
      logs = logs.filter(log => new Date(log.timestamp) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      logs = logs.filter(log => new Date(log.timestamp) <= new Date(filters.endDate));
    }

    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Clear audit logs
   */
  clear() {
    this.auditLogs = [];
  }
}

const securityAuditLogger = new SecurityAuditLogger();

/**
 * Input sanitization middleware
 * Sanitizes user input to prevent XSS, SQL injection, and other attacks
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize body parameters
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize params
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Sanitize an object recursively
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
  }
  return sanitized;
}

/**
 * Sanitize a string value
 */
function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  // Remove null bytes
  let sanitized = value.replace(/\0/g, '');

  // Remove potential SQL injection patterns (basic)
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|#|\/\*|\*\/|;)/g,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(\bUNION\b.*\bSELECT\b)/gi
  ];

  // Log potential SQL injection attempts
  for (const pattern of sqlPatterns) {
    if (pattern.test(sanitized)) {
      errorLogger.warn({
        type: 'security_potential_sql_injection',
        message: 'Potential SQL injection attempt detected',
        value: sanitized.substring(0, 200),
        timestamp: new Date().toISOString()
      });
      // Don't block, but log for monitoring
    }
  }

  // Remove potential XSS patterns
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // onclick=, onerror=, etc.
    /<iframe/gi,
    /<object/gi,
    /<embed/gi
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(sanitized)) {
      errorLogger.warn({
        type: 'security_potential_xss',
        message: 'Potential XSS attempt detected',
        value: sanitized.substring(0, 200),
        timestamp: new Date().toISOString()
      });
      // Remove XSS patterns
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length to prevent DoS
  const maxLength = 10000; // 10KB max per field
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    errorLogger.warn({
      type: 'security_input_too_long',
      message: 'Input field exceeded maximum length',
      length: value.length,
      maxLength,
      timestamp: new Date().toISOString()
    });
  }

  return sanitized;
}

/**
 * Security headers middleware
 * Adds additional security headers beyond Helmet
 */
const securityHeadersMiddleware = (req, res, next) => {
  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Add API version header
  res.setHeader('X-API-Version', '1.0.0');
  
  // Add request ID header for tracing
  if (req.id) {
    res.setHeader('X-Request-ID', req.id);
  }

  next();
};

/**
 * API security middleware
 * Validates API requests for common security issues
 */
const apiSecurityMiddleware = (req, res, next) => {
  // Check for suspicious user agents
  const userAgent = req.get('User-Agent') || '';
  const suspiciousPatterns = [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /masscan/i,
    /zap/i,
    /burp/i,
    /w3af/i,
    /acunetix/i
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userAgent)) {
      securityAuditLogger.log({
        type: 'security_suspicious_user_agent',
        severity: 'high',
        ip: req.ip,
        userAgent,
        action: 'Request blocked',
        resource: req.path,
        success: false,
        details: { pattern: pattern.toString() }
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Request blocked by security policy'
      });
    }
  }

  // Check for excessive request size
  // Exclude upload endpoints - they handle their own size validation via multer (1GB limit)
  const isUploadEndpoint = req.path === '/api/upload' || req.path.startsWith('/api/upload/');
  if (!isUploadEndpoint) {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    const maxRequestSize = 10 * 1024 * 1024; // 10MB for non-upload endpoints
    if (contentLength > maxRequestSize) {
      securityAuditLogger.log({
        type: 'security_request_too_large',
        severity: 'medium',
        ip: req.ip,
        action: 'Request blocked',
        resource: req.path,
        success: false,
        details: { contentLength, maxRequestSize }
      });

      return res.status(413).json({
        error: 'Payload Too Large',
        message: 'Request size exceeds maximum allowed'
      });
    }
  }

  // Check for suspicious query parameters
  if (req.query) {
    const suspiciousKeys = Object.keys(req.query).filter(key => {
      const lowerKey = key.toLowerCase();
      return lowerKey.includes('union') || 
             lowerKey.includes('select') || 
             lowerKey.includes('drop') ||
             lowerKey.includes('exec') ||
             lowerKey.includes('script');
    });

    if (suspiciousKeys.length > 0) {
      securityAuditLogger.log({
        type: 'security_suspicious_query_params',
        severity: 'medium',
        ip: req.ip,
        action: 'Suspicious query parameters detected',
        resource: req.path,
        success: true,
        details: { suspiciousKeys }
      });
    }
  }

  next();
};

/**
 * Rate limiting violation handler
 * Logs rate limit violations for security monitoring
 */
const rateLimitViolationHandler = (req, res) => {
  securityAuditLogger.log({
    type: 'security_rate_limit_exceeded',
    severity: 'medium',
    userId: req.user?.userId || null,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    action: 'Rate limit exceeded',
    resource: req.path,
    success: false,
    details: {
      method: req.method,
      path: req.path
    }
  });

  res.status(429).json({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.'
  });
};

/**
 * Authentication failure handler
 * Logs authentication failures for security monitoring
 */
const authenticationFailureHandler = (req, reason) => {
  securityAuditLogger.log({
    type: 'security_auth_failure',
    severity: 'high',
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    action: 'Authentication failed',
    resource: req.path,
    success: false,
    details: {
      reason,
      method: req.method,
      path: req.path
    }
  });
};

/**
 * Authorization failure handler
 * Logs authorization failures for security monitoring
 */
const authorizationFailureHandler = (req, userId, resource, action) => {
  securityAuditLogger.log({
    type: 'security_authz_failure',
    severity: 'high',
    userId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    action: `Authorization failed: ${action}`,
    resource,
    success: false,
    details: {
      attemptedAction: action,
      resource
    }
  });
};

/**
 * Sensitive operation logger
 * Logs sensitive operations (admin actions, data modifications, etc.)
 */
const logSensitiveOperation = (req, operation, details = {}) => {
  securityAuditLogger.log({
    type: 'security_sensitive_operation',
    severity: 'medium',
    userId: req.user?.userId || null,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    action: operation,
    resource: req.path,
    success: true,
    details,
    requestId: req.id
  });
};

module.exports = {
  securityAuditLogger,
  sanitizeInput,
  securityHeadersMiddleware,
  apiSecurityMiddleware,
  rateLimitViolationHandler,
  authenticationFailureHandler,
  authorizationFailureHandler,
  logSensitiveOperation
};

