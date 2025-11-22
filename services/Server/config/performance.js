const compression = require('compression');
const crypto = require('crypto');

/**
 * Phase 3: Performance Optimization Configuration
 * Provides compression, caching, and performance middleware
 */

// Compression middleware configuration
// Note: Compression middleware preserves all headers including CORS headers
const compressionMiddleware = compression({
  filter: (req, res) => {
    // Don't compress OPTIONS requests (CORS preflight) - let CORS handle these
    if (req.method === 'OPTIONS') {
      return false;
    }
    
    // Don't compress responses if request has no-transform cache-control
    if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
      return false;
    }
    
    // Use default compression filter which checks Accept-Encoding header
    // This ensures we only compress when client supports it
    return compression.filter(req, res);
  },
  level: 6, // Compression level (1-9, 6 is a good balance)
  threshold: 1024, // Only compress responses larger than 1KB
  chunkSize: 16 * 1024 // 16KB chunks
});

// In-memory cache for frequently accessed data
// In production, consider using Redis for distributed caching
const cache = {
  data: new Map(),
  timestamps: new Map(),
  maxSize: 1000, // Maximum number of cached items
  defaultTTL: 300000 // 5 minutes default TTL
};

/**
 * Generate ETag from content
 * @param {string|Buffer|Object} content - Content to generate ETag for
 * @returns {string} ETag value
 */
const generateETag = (content) => {
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  return crypto.createHash('md5').update(str).digest('hex');
};

/**
 * Simple in-memory cache implementation
 */
class SimpleCache {
  constructor() {
    this.data = new Map();
    this.timestamps = new Map();
    this.maxSize = 1000;
    this.defaultTTL = 300000; // 5 minutes
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if expired/not found
   */
  get(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) {
      this.misses++;
      return null;
    }

    const ttl = this.data.get(key)?.ttl || this.defaultTTL;
    if (Date.now() - timestamp > ttl) {
      this.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return this.data.get(key)?.value || null;
  }

  /**
   * Set cached value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl = this.defaultTTL) {
    // Evict oldest entries if cache is full
    if (this.data.size >= this.maxSize) {
      const oldestKey = this.timestamps.entries().next().value?.[0];
      if (oldestKey) {
        this.delete(oldestKey);
      }
    }

    this.data.set(key, { value, ttl });
    this.timestamps.set(key, Date.now());
  }

  /**
   * Delete cached value
   * @param {string} key - Cache key
   */
  delete(key) {
    this.data.delete(key);
    this.timestamps.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.data.clear();
    this.timestamps.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const [key, timestamp] of this.timestamps.entries()) {
      const ttl = this.data.get(key)?.ttl || this.defaultTTL;
      if (now - timestamp > ttl) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.data.size,
      active,
      expired,
      maxSize: this.maxSize,
      hitRate: this.hits / (this.hits + this.misses) || 0
    };
  }
}

const simpleCache = new SimpleCache();

/**
 * Cache middleware for API responses
 * @param {Object} options - Cache options
 * @param {number} options.ttl - Time to live in milliseconds
 * @param {Function} options.keyGenerator - Function to generate cache key from request
 * @param {Function} options.shouldCache - Function to determine if response should be cached
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (options = {}) => {
  const {
    ttl = 300000, // 5 minutes default
    keyGenerator = (req) => `${req.method}:${req.originalUrl}:${req.user?.userId || 'anonymous'}`,
    shouldCache = (req, res) => {
      // Don't cache POST, PUT, DELETE, PATCH requests
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return false;
      }
      // Only cache successful responses
      return res.statusCode >= 200 && res.statusCode < 300;
    }
  } = options;

  return (req, res, next) => {
    // Skip caching for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    // Skip caching for non-GET requests or if shouldCache returns false
    if (!shouldCache(req, res)) {
      return next();
    }

    const cacheKey = keyGenerator(req);
    const cached = simpleCache.get(cacheKey);

    if (cached) {
      // Set ETag header
      const etag = generateETag(cached);
      res.setHeader('ETag', `"${etag}"`);
      res.setHeader('X-Cache', 'HIT');

      // Check if client has cached version
      const clientETag = req.headers['if-none-match'];
      if (clientETag === `"${etag}"`) {
        return res.status(304).end(); // Not Modified
      }

      // Return cached response
      res.setHeader('Content-Type', 'application/json');
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function(body) {
      // Only cache if response is successful
      if (res.statusCode >= 200 && res.statusCode < 300) {
        simpleCache.set(cacheKey, body, ttl);
        const etag = generateETag(body);
        res.setHeader('ETag', `"${etag}"`);
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Static file caching middleware
 * Sets appropriate cache headers for static assets
 */
const staticCacheMiddleware = (req, res, next) => {
  // Skip OPTIONS requests (CORS preflight) - don't modify headers
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  // Set cache headers for static assets
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    res.setHeader('Vary', 'Accept-Encoding');
  } else if (req.path.match(/\.(html|htm)$/)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (req.path.startsWith('/api/')) {
    // API responses - short cache with revalidation
    if (!res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', 'private, max-age=60, must-revalidate');
    }
  }

  next();
};

/**
 * Response time middleware
 * Adds X-Response-Time header
 */
const responseTimeMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Override res.end to capture response time before sending
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    // Only set header if headers haven't been sent yet
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }
    // Call original end method
    return originalEnd.apply(this, args);
  };

  next();
};

/**
 * Cache invalidation helper
 * @param {string|Array} patterns - Cache key patterns to invalidate
 */
const invalidateCache = (patterns) => {
  const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
  
  for (const [key] of simpleCache.data.entries()) {
    if (patternsArray.some(pattern => key.includes(pattern))) {
      simpleCache.delete(key);
    }
  }
};

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
const getCacheStats = () => {
  return simpleCache.getStats();
};

module.exports = {
  compressionMiddleware,
  cacheMiddleware,
  staticCacheMiddleware,
  responseTimeMiddleware,
  invalidateCache,
  getCacheStats,
  generateETag,
  cache: simpleCache
};

