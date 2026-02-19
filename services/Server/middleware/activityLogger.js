const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Initialize pool if not already available
let pool;
if (typeof require !== 'undefined') {
  // Pool will be passed in from main.js
}

// Helper function to get client IP address
function getClientIp(req) {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-vercel-ip-country'] ? req.ip :
         req.headers['x-real-ip'] ||
         req.headers['true-client-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

// Helper function to extract resource type and ID from endpoint
function extractResourceInfo(endpoint, method, body, params) {
  const resourceMap = {
    '/api/products': { type: 'product', id: params?.id || body?.id },
    '/api/qrcodes': { type: 'qr_code', id: params?.id || body?.id },
    '/api/qr-codes': { type: 'qr_code', id: params?.id || body?.id },
    '/api/playlists': { type: 'playlist', id: params?.id || body?.id },
    '/api/media': { type: 'media', id: params?.id || body?.id },
    '/api/slideshows': { type: 'slideshow', id: params?.id || body?.id },
    '/api/activation-codes': { type: 'activation_code', id: params?.codeId || body?.id },
    '/api/users': { type: 'user', id: params?.id || body?.id },
    '/api/auth/login': { type: 'auth', id: null },
    '/api/auth/register': { type: 'auth', id: null },
  };

  // Try to match endpoint patterns
  for (const [pattern, resource] of Object.entries(resourceMap)) {
    if (endpoint.startsWith(pattern)) {
      return resource;
    }
  }

  // Extract from URL path if possible
  const pathParts = endpoint.split('/').filter(Boolean);
  if (pathParts.length >= 3) {
    const resourceType = pathParts[1]; // e.g., 'products', 'qrcodes'
    const resourceId = pathParts[2]; // e.g., '123'
    return {
      type: resourceType.replace(/-/g, '_').replace(/s$/, ''), // plural to singular
      id: isNaN(resourceId) ? null : parseInt(resourceId)
    };
  }

  return { type: null, id: null };
}

// Helper function to determine action type from method and endpoint
function getActionType(method, endpoint) {
  const endpointLower = endpoint.toLowerCase();
  
  // Authentication actions
  if (endpointLower.includes('/auth/login')) return 'LOGIN';
  if (endpointLower.includes('/auth/register')) return 'REGISTER';
  if (endpointLower.includes('/auth/verify')) return 'VERIFY_EMAIL';
  if (endpointLower.includes('/auth/reset-password')) return 'RESET_PASSWORD';
  if (endpointLower.includes('/auth/forgot-password')) return 'FORGOT_PASSWORD';

  // CRUD operations
  if (method === 'POST') {
    if (endpointLower.includes('/products')) return 'CREATE_PRODUCT';
    if (endpointLower.includes('/qrcode') || endpointLower.includes('/qr-code')) return 'CREATE_QR_CODE';
    if (endpointLower.includes('/playlist')) return 'CREATE_PLAYLIST';
    if (endpointLower.includes('/media')) return 'UPLOAD_MEDIA';
    if (endpointLower.includes('/slideshow')) return 'CREATE_SLIDESHOW';
    if (endpointLower.includes('/activation-code')) return 'CREATE_ACTIVATION_CODE';
    if (endpointLower.includes('/upload')) return 'UPLOAD_FILE';
    return 'CREATE';
  }
  
  if (method === 'PUT' || method === 'PATCH') {
    if (endpointLower.includes('/products')) return 'UPDATE_PRODUCT';
    if (endpointLower.includes('/qrcode') || endpointLower.includes('/qr-code')) return 'UPDATE_QR_CODE';
    if (endpointLower.includes('/playlist')) return 'UPDATE_PLAYLIST';
    if (endpointLower.includes('/media')) return 'UPDATE_MEDIA';
    if (endpointLower.includes('/slideshow')) return 'UPDATE_SLIDESHOW';
    if (endpointLower.includes('/activation-code')) return 'UPDATE_ACTIVATION_CODE';
    if (endpointLower.includes('/admin/users') && endpointLower.includes('/log-access')) return 'UPDATE_LOG_ACCESS';
    if (endpointLower.includes('/admin/users')) return 'UPDATE_USER';
    return 'UPDATE';
  }
  
  if (method === 'DELETE') {
    if (endpointLower.includes('/products')) return 'DELETE_PRODUCT';
    if (endpointLower.includes('/qrcode') || endpointLower.includes('/qr-code')) return 'DELETE_QR_CODE';
    if (endpointLower.includes('/playlist')) return 'DELETE_PLAYLIST';
    if (endpointLower.includes('/media')) return 'DELETE_MEDIA';
    if (endpointLower.includes('/slideshow')) return 'DELETE_SLIDESHOW';
    if (endpointLower.includes('/activation-code')) return 'DELETE_ACTIVATION_CODE';
    if (endpointLower.includes('/admin/users')) return 'DELETE_USER';
    return 'DELETE';
  }

  // Analytics and tracking
  if (endpointLower.includes('/analytics/track')) return 'TRACK_EVENT';
  
  return 'UNKNOWN';
}

// Fields to exclude from logging (sensitive data)
const SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'passwordHash',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apiKey',
  'secret',
  'stripe_secret_key',
  'jwt_secret',
  'card_number',
  'cvv',
  'cvc',
  'cardNumber',
  'security_code',
  'data', // Base64 encoded file data can be huge
];

// Sanitize sensitive data from objects
function sanitizeLogData(data) {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field => keyLower.includes(field.toLowerCase()));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// Core logging function
async function logActivity(db, userId, actionType, resourceType, resourceId, metadata, req, statusCode, errorMessage) {
  try {
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;
    const endpoint = req.originalUrl || req.url || 'unknown';
    const method = req.method || 'UNKNOWN';

    // Sanitize metadata
    const sanitizedMetadata = sanitizeLogData(metadata);

    await db.query(
      `INSERT INTO activity_logs (
        user_id, action_type, resource_type, resource_id,
        ip_address, user_agent, request_method, endpoint,
        status_code, metadata, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        userId,
        actionType,
        resourceType,
        resourceId,
        ipAddress !== 'unknown' ? ipAddress : null,
        userAgent,
        method,
        endpoint,
        statusCode,
        JSON.stringify(sanitizedMetadata),
        errorMessage || null
      ],
      {
        queryName: 'activity_log_insert',
        requestId: req.requestId,
        timeout: 5000 // Shorter timeout for logging
      }
    );
  } catch (error) {
    // Don't let logging errors break the application
    // Silently handle missing table errors (table may not exist in all environments)
    if (error.code === '42P01') {
      // Table doesn't exist - this is okay, just skip logging
      // Don't log this error to avoid spam in logs
      return;
    }
    // For other errors, log them but don't throw
    console.error('Error logging activity:', error.message || error);
  }
}

// Middleware factory function
function createActivityLogger(dbInstance) {
  const db = dbInstance;

  return async (req, res, next) => {
    // Store original end function
    const originalEnd = res.end;
    const originalJson = res.json;
    const originalSend = res.send;

    // Capture response data
    let responseData = null;
    let statusCode = res.statusCode || 200;

    // Override res.json to capture response
    res.json = function(body) {
      responseData = body;
      return originalJson.call(this, body);
    };

    // Override res.send to capture response
    res.send = function(body) {
      responseData = body;
      return originalSend.call(this, body);
    };

    // Override res.end to log after response
    res.end = function(chunk, encoding) {
      // Get final status code
      statusCode = res.statusCode || statusCode;

      // Extract user ID
      const userId = req.user?.userId || null;

      // Extract resource info
      const resourceInfo = extractResourceInfo(
        req.originalUrl || req.url,
        req.method,
        req.body,
        req.params
      );

      // Determine action type
      const actionType = getActionType(req.method, req.originalUrl || req.url);

      // Prepare metadata
      const metadata = {
        body: req.body ? sanitizeLogData(req.body) : null,
        query: req.query || null,
        params: req.params || null,
        responseStatus: statusCode,
        // Only include response data for errors or admin endpoints
        response: (statusCode >= 400 || req.originalUrl?.includes('/admin/')) ? responseData : null
      };

      // Extract error message if present
      let errorMessage = null;
      if (statusCode >= 400 && responseData) {
        if (typeof responseData === 'object' && responseData.error) {
          errorMessage = responseData.error;
        } else if (typeof responseData === 'string') {
          errorMessage = responseData;
        }
      }

      // Log asynchronously (don't block response). Fire-and-forget: never let logging failures bubble.
      setImmediate(() => {
        logActivity(
          db,
          userId,
          actionType,
          resourceInfo.type,
          resourceInfo.id,
          metadata,
          req,
          statusCode,
          errorMessage
        ).catch((err) => {
          // Logging failures must never crash the process. Suppress noisy connection errors.
          const msg = err?.message || String(err);
          const code = err?.code;
          if (code !== 'ECONNREFUSED' && code !== 'ETIMEDOUT' && !msg.includes('Connection terminated')) {
            console.error('Activity logging failed (non-critical):', msg);
          }
        });
      });

      // Call original end
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

module.exports = { createActivityLogger, logActivity, sanitizeLogData };

