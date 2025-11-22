/**
 * Phase 6: Advanced Error Handling & Recovery
 * Comprehensive resilience patterns: circuit breakers, retries, graceful degradation
 */

const { logger } = require('../middleware/logger');
const errorLogger = require('../middleware/errorHandler').errorLogger;

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by stopping requests to failing services
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5; // Open after 5 failures
    this.resetTimeout = options.resetTimeout || 60000; // 60 seconds
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 60 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    // Check if circuit should be reset
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.info({
          type: 'circuit_breaker_half_open',
          circuit: this.name,
          timestamp: new Date().toISOString()
        });
      } else {
        // Circuit is open, return fallback or throw error
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      
      // Success - reset failure count
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 2) {
          this.state = 'CLOSED';
          this.failureCount = 0;
          logger.info({
            type: 'circuit_breaker_closed',
            circuit: this.name,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        this.failureCount = 0;
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      // Check if threshold exceeded
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = Date.now() + this.resetTimeout;
        
        errorLogger.error({
          type: 'circuit_breaker_opened',
          circuit: this.name,
          failureCount: this.failureCount,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // If in half-open state and failed, go back to open
      if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        this.nextAttemptTime = Date.now() + this.resetTimeout;
      }
      
      // Try fallback if available
      if (fallback) {
        try {
          return await fallback();
        } catch (fallbackError) {
          // Fallback also failed
          throw error; // Throw original error
        }
      }
      
      throw error;
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableErrors = [],
    onRetry = null
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (retryableErrors.length > 0) {
        const isRetryable = retryableErrors.some(retryableError => {
          if (typeof retryableError === 'string') {
            return error.message.includes(retryableError);
          }
          if (retryableError instanceof RegExp) {
            return retryableError.test(error.message);
          }
          return error instanceof retryableError;
        });

        if (!isRetryable) {
          throw error;
        }
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Timeout wrapper
 */
function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

/**
 * Graceful degradation helper
 * Tries primary function, falls back to secondary if it fails
 */
async function gracefulDegradation(primaryFn, fallbackFn, options = {}) {
  const {
    logErrors = true,
    fallbackOnError = true
  } = options;

  try {
    return await primaryFn();
  } catch (error) {
    if (logErrors) {
      logger.warn({
        type: 'graceful_degradation',
        message: 'Primary function failed, using fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    if (fallbackOnError && fallbackFn) {
      try {
        return await fallbackFn(error);
      } catch (fallbackError) {
        errorLogger.error({
          type: 'graceful_degradation_fallback_failed',
          message: 'Both primary and fallback functions failed',
          primaryError: error.message,
          fallbackError: fallbackError.message,
          timestamp: new Date().toISOString()
        });
        throw error; // Throw original error
      }
    }

    throw error;
  }
}

/**
 * Bulkhead pattern
 * Limits concurrent operations to prevent resource exhaustion
 */
class Bulkhead {
  constructor(maxConcurrent = 10, name = 'default') {
    this.maxConcurrent = maxConcurrent;
    this.name = name;
    this.active = 0;
    this.queue = [];
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.active--;
          // Process next task in queue
          if (this.queue.length > 0) {
            const nextTask = this.queue.shift();
            setImmediate(() => nextTask());
          }
        }
      };

      if (this.active < this.maxConcurrent) {
        task();
      } else {
        this.queue.push(task);
      }
    });
  }

  getStatus() {
    return {
      name: this.name,
      maxConcurrent: this.maxConcurrent,
      active: this.active,
      queued: this.queue.length
    };
  }
}

/**
 * Health check with retry
 */
async function healthCheckWithRetry(checkFn, options = {}) {
  const {
    maxRetries = 2,
    retryDelay = 1000
  } = options;

  try {
    return await retryWithBackoff(checkFn, {
      maxRetries,
      initialDelay: retryDelay,
      retryableErrors: ['timeout', 'ECONNREFUSED', 'ETIMEDOUT']
    });
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Error recovery strategies
 */
const recoveryStrategies = {
  /**
   * Retry strategy for transient errors
   */
  retry: async (fn, options = {}) => {
    return retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 1000,
      retryableErrors: ['timeout', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
      ...options
    });
  },

  /**
   * Fallback strategy
   */
  fallback: async (primaryFn, fallbackFn) => {
    return gracefulDegradation(primaryFn, fallbackFn);
  },

  /**
   * Timeout strategy
   */
  timeout: async (fn, timeoutMs = 5000) => {
    return withTimeout(fn, timeoutMs);
  },

  /**
   * Combined strategy: retry with timeout and fallback
   */
  combined: async (primaryFn, fallbackFn, options = {}) => {
    const {
      timeoutMs = 5000,
      maxRetries = 2
    } = options;

    try {
      const result = await retryWithBackoff(
        () => withTimeout(primaryFn(), timeoutMs),
        {
          maxRetries,
          retryableErrors: ['timeout', 'ECONNREFUSED']
        }
      );
      return result;
    } catch (error) {
      if (fallbackFn) {
        return await fallbackFn(error);
      }
      throw error;
    }
  }
};

// Create circuit breakers for common services
const circuitBreakers = {
  database: new CircuitBreaker({
    name: 'database',
    failureThreshold: 5,
    resetTimeout: 30000
  }),
  s3: new CircuitBreaker({
    name: 's3',
    failureThreshold: 3,
    resetTimeout: 60000
  }),
  externalApi: new CircuitBreaker({
    name: 'externalApi',
    failureThreshold: 5,
    resetTimeout: 60000
  })
};

// Create bulkheads for resource-intensive operations
const bulkheads = {
  database: new Bulkhead(20, 'database'),
  fileProcessing: new Bulkhead(5, 'fileProcessing'),
  externalApi: new Bulkhead(10, 'externalApi')
};

module.exports = {
  CircuitBreaker,
  retryWithBackoff,
  withTimeout,
  gracefulDegradation,
  Bulkhead,
  healthCheckWithRetry,
  recoveryStrategies,
  circuitBreakers,
  bulkheads
};

