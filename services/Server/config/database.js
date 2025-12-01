const { Pool } = require('pg');
const { logger } = require('../middleware/logger');
const errorLogger = require('../middleware/errorHandler').errorLogger;

// Database pool metrics tracking
const poolMetrics = {
  totalQueries: 0,
  slowQueries: 0,
  failedQueries: 0,
  poolWaitTime: 0,
  poolConnections: {
    total: 0,
    idle: 0,
    waiting: 0
  },
  connectionErrors: 0,
  queryTimeouts: 0,
  lastReset: new Date()
};

// Default query timeout: 30 seconds
const DEFAULT_QUERY_TIMEOUT = 30000;

// Determine pool size based on environment
// Production: 20-50, Development: 10-20
const getPoolMax = () => {
  const envMax = process.env.DB_POOL_MAX;
  if (envMax) {
    const parsed = parseInt(envMax, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  // Default based on environment
  return process.env.NODE_ENV === 'production' ? 30 : 15;
};

// Create optimized database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000, // 10 seconds to connect
  idleTimeoutMillis: 30000,       // 30 seconds to release idle clients (increased from 20s)
  max: getPoolMax(),              // Increased from 10 to 20-50 based on environment
  min: 2,                         // Minimum connections to maintain
  allowExitOnIdle: false          // Keep pool alive even when idle
});

// Pool event handlers for monitoring
pool.on('connect', (client) => {
  poolMetrics.poolConnections.total = pool.totalCount;
  poolMetrics.poolConnections.idle = pool.idleCount;
  poolMetrics.poolConnections.waiting = pool.waitingCount;
  
  logger.info({
    type: 'db_pool_connect',
    message: 'New database connection established',
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    timestamp: new Date().toISOString()
  });
});

pool.on('acquire', (client) => {
  poolMetrics.poolConnections.total = pool.totalCount;
  poolMetrics.poolConnections.idle = pool.idleCount;
  poolMetrics.poolConnections.waiting = pool.waitingCount;
});

pool.on('remove', (client) => {
  poolMetrics.poolConnections.total = pool.totalCount;
  poolMetrics.poolConnections.idle = pool.idleCount;
  poolMetrics.poolConnections.waiting = pool.waitingCount;
  
  logger.info({
    type: 'db_pool_remove',
    message: 'Database connection removed',
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    timestamp: new Date().toISOString()
  });
});

pool.on('error', (err, client) => {
  poolMetrics.connectionErrors++;
  
  errorLogger.error({
    type: 'db_pool_error',
    message: 'Unexpected error on idle database client',
    error: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // Don't exit on pool errors - let the pool handle reconnection
  // Only exit if it's a critical error
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    logger.warn({
      type: 'db_pool_connection_failure',
      message: 'Database connection failure - pool will retry',
      error: err.message,
      code: err.code,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Execute a database query with timeout and monitoring
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @param {Object} options - Query options (timeout, queryName)
 * @returns {Promise} Query result
 */
const query = async (text, params = [], options = {}) => {
  const startTime = Date.now();
  const queryTimeout = options.timeout || DEFAULT_QUERY_TIMEOUT;
  const queryName = options.queryName || 'unnamed';
  const requestId = options.requestId;
  
  poolMetrics.totalQueries++;
  
  let client;
  let connectionWaitStart = Date.now();
  
  try {
    // Track connection wait time
    client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      )
    ]);
    
    const connectionWaitTime = Date.now() - connectionWaitStart;
    poolMetrics.poolWaitTime += connectionWaitTime;
    
    if (connectionWaitTime > 1000) {
      logger.warn({
        type: 'db_pool_wait',
        message: 'Long wait time for database connection',
        waitTime: connectionWaitTime,
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingClients: pool.waitingCount,
        queryName,
        requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Execute query with timeout
    const queryPromise = client.query({
      text,
      values: params
      // Use default rowMode to maintain compatibility with existing code
    });
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timeout after ${queryTimeout}ms`));
      }, queryTimeout);
    });
    
    const result = await Promise.race([queryPromise, timeoutPromise]);
    
    const queryTime = Date.now() - startTime;
    
    // Log slow queries (> 1 second)
    if (queryTime > 1000) {
      poolMetrics.slowQueries++;
      logger.warn({
        type: 'db_slow_query',
        message: 'Slow database query detected',
        queryName,
        queryTime,
        connectionWaitTime,
        query: text.substring(0, 200), // Log first 200 chars of query
        requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Log very slow queries (> 5 seconds) as errors
    if (queryTime > 5000) {
      errorLogger.error({
        type: 'db_very_slow_query',
        message: 'Very slow database query detected',
        queryName,
        queryTime,
        connectionWaitTime,
        query: text.substring(0, 500),
        requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Record metrics to monitoring system if available
    try {
      const { metricsCollector } = require('./monitoring');
      const isSlow = queryTime > 1000;
      metricsCollector.recordDatabaseQuery(queryTime, isSlow, false);
    } catch (err) {
      // Monitoring not available, continue without it
    }
    
    return result;
    
  } catch (error) {
    poolMetrics.failedQueries++;
    const queryTime = Date.now() - startTime;
    
    // Record failed query to monitoring system if available
    try {
      const { metricsCollector } = require('./monitoring');
      metricsCollector.recordDatabaseQuery(queryTime, false, true);
    } catch (err) {
      // Monitoring not available, continue without it
    }
    
    // Handle timeout errors
    if (error.message.includes('timeout')) {
      poolMetrics.queryTimeouts++;
      errorLogger.error({
        type: 'db_query_timeout',
        message: 'Database query timed out',
        queryName,
        queryTime,
        timeout: queryTimeout,
        query: text.substring(0, 200),
        requestId,
        timestamp: new Date().toISOString()
      });
      
      throw new Error(`Query timeout: ${queryName} exceeded ${queryTimeout}ms`);
    }
    
    // Handle connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      poolMetrics.connectionErrors++;
      errorLogger.error({
        type: 'db_connection_error',
        message: 'Database connection error',
        queryName,
        error: error.message,
        code: error.code,
        requestId,
        timestamp: new Date().toISOString()
      });
    } else {
      // Suppress logging for missing activity_logs table (42P01) - this is expected if table doesn't exist
      // The activityLogger middleware handles this gracefully
      if (error.code === '42P01' && queryName === 'activity_log_insert') {
        // Silently skip - table doesn't exist, which is okay
        // Don't log to avoid spam in logs
      } else {
        errorLogger.error({
          type: 'db_query_error',
          message: 'Database query error',
          queryName,
          error: error.message,
          code: error.code,
          query: text.substring(0, 200),
          requestId,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    throw error;
    
  } finally {
    if (client) {
      client.release();
    }
    
    // Update pool metrics
    poolMetrics.poolConnections.total = pool.totalCount;
    poolMetrics.poolConnections.idle = pool.idleCount;
    poolMetrics.poolConnections.waiting = pool.waitingCount;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<PoolClient>} Database client
 */
const getClient = async () => {
  const connectionWaitStart = Date.now();
  
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      )
    ]);
    
    const connectionWaitTime = Date.now() - connectionWaitStart;
    poolMetrics.poolWaitTime += connectionWaitTime;
    
    return client;
  } catch (error) {
    poolMetrics.connectionErrors++;
    throw error;
  }
};

/**
 * Get current pool metrics
 * @returns {Object} Pool metrics
 */
const getMetrics = () => {
  const avgWaitTime = poolMetrics.totalQueries > 0 
    ? poolMetrics.poolWaitTime / poolMetrics.totalQueries 
    : 0;
  
  return {
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: pool.options.max,
      min: pool.options.min
    },
    queries: {
      total: poolMetrics.totalQueries,
      slow: poolMetrics.slowQueries,
      failed: poolMetrics.failedQueries,
      timeouts: poolMetrics.queryTimeouts,
      averageWaitTime: Math.round(avgWaitTime)
    },
    errors: {
      connection: poolMetrics.connectionErrors
    },
    lastReset: poolMetrics.lastReset,
    uptime: Date.now() - poolMetrics.lastReset.getTime()
  };
};

/**
 * Reset pool metrics
 */
const resetMetrics = () => {
  poolMetrics.totalQueries = 0;
  poolMetrics.slowQueries = 0;
  poolMetrics.failedQueries = 0;
  poolMetrics.poolWaitTime = 0;
  poolMetrics.connectionErrors = 0;
  poolMetrics.queryTimeouts = 0;
  poolMetrics.lastReset = new Date();
  
  logger.info({
    type: 'db_metrics_reset',
    message: 'Database pool metrics reset',
    timestamp: new Date().toISOString()
  });
};

/**
 * Health check for database pool
 * @returns {Promise<Object>} Health status
 */
const healthCheck = async () => {
  const startTime = Date.now();
  
  try {
    const result = await query('SELECT NOW()', [], { 
      timeout: 5000,
      queryName: 'health_check' 
    });
    
    const responseTime = Date.now() - startTime;
    const metrics = getMetrics();
    
    // Check if pool is healthy
    const isHealthy = 
      metrics.pool.total <= metrics.pool.max &&
      metrics.pool.waiting < 10 &&
      responseTime < 1000;
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      responseTime,
      pool: metrics.pool,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Gracefully close the pool
 */
const close = async () => {
  try {
    await pool.end();
    logger.info({
      type: 'db_pool_closed',
      message: 'Database pool closed gracefully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    errorLogger.error({
      type: 'db_pool_close_error',
      message: 'Error closing database pool',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  pool,
  query,
  getClient,
  getMetrics,
  resetMetrics,
  healthCheck,
  close,
  DEFAULT_QUERY_TIMEOUT
};

