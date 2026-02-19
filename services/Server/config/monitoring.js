/**
 * Phase 4: Advanced Monitoring & Alerting
 * Comprehensive system monitoring, metrics collection, and alerting
 */

const os = require('os');
const { logger } = require('../middleware/logger');
const db = require('./database');

/**
 * System metrics collector
 * Tracks various system metrics over time
 */
class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byStatus: {},
        byRoute: {}
      },
      responseTimes: {
        min: Infinity,
        max: 0,
        sum: 0,
        count: 0,
        p50: [],
        p95: [],
        p99: []
      },
      errors: {
        total: 0,
        byType: {},
        byRoute: {}
      },
      database: {
        queries: 0,
        slowQueries: 0,
        failedQueries: 0,
        avgQueryTime: 0,
        queryTimeSum: 0
      },
      system: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0
        },
        cpu: {
          usage: 0
        },
        uptime: 0
      },
      alerts: []
    };
    
    this.startTime = Date.now();
    this.lastDbConnectionErrors = 0;
    this.lastDbFailedQueries = 0;
    this.alertThresholds = {
      errorRate: 0.05, // 5% error rate triggers alert
      slowResponseTime: 5000, // 5 seconds
      memoryUsage: 0.90, // 90% memory usage
      databaseSlowQueries: 10, // 10 slow queries per minute
      highErrorCount: 10, // 10 errors per minute
      dbConnectionErrorsPerMinute: 3, // warning threshold
      dbConnectionErrorsPerMinuteCritical: 10, // critical threshold
      dbFailedQueriesPerMinute: 5, // warning
      dbFailedQueriesPerMinuteCritical: 20 // critical
    };
    
    // Reset metrics every hour
    setInterval(() => this.resetHourlyMetrics(), 3600000);
    
    // Check for alerts every minute
    setInterval(() => this.checkAlerts(), 60000);
    
    // Update system metrics every 30 seconds
    setInterval(() => this.updateSystemMetrics(), 30000);
  }

  /**
   * Record a request
   */
  recordRequest(method, route, statusCode, responseTime) {
    this.metrics.requests.total++;
    
    // Track by method
    this.metrics.requests.byMethod[method] = 
      (this.metrics.requests.byMethod[method] || 0) + 1;
    
    // Track by status code
    const statusGroup = Math.floor(statusCode / 100) * 100;
    this.metrics.requests.byStatus[statusGroup] = 
      (this.metrics.requests.byStatus[statusGroup] || 0) + 1;
    
    // Track by route (simplified)
    const routeKey = route.split('?')[0].split('/').slice(0, 3).join('/');
    this.metrics.requests.byRoute[routeKey] = 
      (this.metrics.requests.byRoute[routeKey] || 0) + 1;
    
    // Track response times
    if (responseTime !== undefined) {
      this.metrics.responseTimes.count++;
      this.metrics.responseTimes.sum += responseTime;
      this.metrics.responseTimes.min = Math.min(this.metrics.responseTimes.min, responseTime);
      this.metrics.responseTimes.max = Math.max(this.metrics.responseTimes.max, responseTime);
      
      // Track percentiles (keep last 1000 samples)
      this.metrics.responseTimes.p50.push(responseTime);
      this.metrics.responseTimes.p95.push(responseTime);
      this.metrics.responseTimes.p99.push(responseTime);
      
      if (this.metrics.responseTimes.p50.length > 1000) {
        this.metrics.responseTimes.p50.shift();
        this.metrics.responseTimes.p95.shift();
        this.metrics.responseTimes.p99.shift();
      }
    }
    
    // Track errors
    if (statusCode >= 400) {
      this.metrics.errors.total++;
      const errorType = statusCode >= 500 ? 'server' : 'client';
      this.metrics.errors.byType[errorType] = 
        (this.metrics.errors.byType[errorType] || 0) + 1;
      this.metrics.errors.byRoute[routeKey] = 
        (this.metrics.errors.byRoute[routeKey] || 0) + 1;
    }
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(duration, isSlow, failed) {
    this.metrics.database.queries++;
    this.metrics.database.queryTimeSum += duration;
    this.metrics.database.avgQueryTime = 
      this.metrics.database.queryTimeSum / this.metrics.database.queries;
    
    if (isSlow) {
      this.metrics.database.slowQueries++;
    }
    
    if (failed) {
      this.metrics.database.failedQueries++;
    }
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    this.metrics.system.memory = {
      used: usedMem,
      total: totalMem,
      percentage: usedMem / totalMem
    };
    
    this.metrics.system.uptime = process.uptime();
    
    // CPU usage calculation (simplified)
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    this.metrics.system.cpu.usage = usage;
  }

  /**
   * Check for alert conditions
   */
  async checkAlerts() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Calculate error rate
    const recentRequests = this.metrics.requests.total;
    const recentErrors = this.metrics.errors.total;
    const errorRate = recentRequests > 0 ? recentErrors / recentRequests : 0;
    
    // Check error rate threshold
    if (errorRate > this.alertThresholds.errorRate && recentRequests > 10) {
      this.addAlert('high_error_rate', {
        errorRate: (errorRate * 100).toFixed(2) + '%',
        threshold: (this.alertThresholds.errorRate * 100) + '%',
        recentErrors,
        recentRequests
      });
    }
    
    // Check slow response times
    const avgResponseTime = this.metrics.responseTimes.count > 0
      ? this.metrics.responseTimes.sum / this.metrics.responseTimes.count
      : 0;
    
    if (avgResponseTime > this.alertThresholds.slowResponseTime) {
      this.addAlert('slow_response_time', {
        avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
        threshold: this.alertThresholds.slowResponseTime + 'ms'
      });
    }
    
    // Check memory usage
    if (this.metrics.system.memory.percentage > this.alertThresholds.memoryUsage) {
      this.addAlert('high_memory_usage', {
        memoryUsage: (this.metrics.system.memory.percentage * 100).toFixed(2) + '%',
        threshold: (this.alertThresholds.memoryUsage * 100) + '%',
        used: (this.metrics.system.memory.used / 1024 / 1024 / 1024).toFixed(2) + 'GB',
        total: (this.metrics.system.memory.total / 1024 / 1024 / 1024).toFixed(2) + 'GB'
      });
    }
    
    // Check database slow queries
    if (this.metrics.database.slowQueries > this.alertThresholds.databaseSlowQueries) {
      this.addAlert('database_slow_queries', {
        slowQueries: this.metrics.database.slowQueries,
        threshold: this.alertThresholds.databaseSlowQueries,
        avgQueryTime: this.metrics.database.avgQueryTime.toFixed(2) + 'ms'
      });
    }
    
    // Check database connection pool health
    try {
      const poolStats = db.getPoolStats();
      if (poolStats && poolStats.maxConnections > 0) {
        const poolUtilization = poolStats.totalConnections / poolStats.maxConnections;
        if (poolUtilization > 0.8) {
          this.addAlert('database_pool_high_utilization', {
            utilization: (poolUtilization * 100).toFixed(2) + '%',
            totalConnections: poolStats.totalConnections,
            maxConnections: poolStats.maxConnections,
            waitingClients: poolStats.waitingClients
          });
        }
      }
    } catch (err) {
      // Ignore errors in alert checking
    }

    // Check DB connection errors (disconnects) - delta per minute
    try {
      const dbMetrics = db.getMetrics();
      const connErrors = dbMetrics.errors?.connection ?? 0;
      const failedQueries = dbMetrics.queries?.failed ?? 0;
      const connDelta = connErrors - this.lastDbConnectionErrors;
      const failedDelta = failedQueries - this.lastDbFailedQueries;
      this.lastDbConnectionErrors = connErrors;
      this.lastDbFailedQueries = failedQueries;

      if (connDelta >= this.alertThresholds.dbConnectionErrorsPerMinuteCritical) {
        this.addAlert('database_connection_errors_critical', {
          count: connDelta,
          threshold: this.alertThresholds.dbConnectionErrorsPerMinuteCritical,
          total: connErrors
        });
      } else if (connDelta >= this.alertThresholds.dbConnectionErrorsPerMinute) {
        this.addAlert('database_connection_errors_warning', {
          count: connDelta,
          threshold: this.alertThresholds.dbConnectionErrorsPerMinute,
          total: connErrors
        });
      }

      if (failedDelta >= this.alertThresholds.dbFailedQueriesPerMinuteCritical) {
        this.addAlert('database_failed_queries_critical', {
          count: failedDelta,
          threshold: this.alertThresholds.dbFailedQueriesPerMinuteCritical,
          total: failedQueries
        });
      } else if (failedDelta >= this.alertThresholds.dbFailedQueriesPerMinute) {
        this.addAlert('database_failed_queries_warning', {
          count: failedDelta,
          threshold: this.alertThresholds.dbFailedQueriesPerMinute,
          total: failedQueries
        });
      }
    } catch (err) {
      // Ignore errors in alert checking
    }
  }

  /**
   * Add an alert
   */
  addAlert(type, data) {
    const alert = {
      type,
      severity: this.getAlertSeverity(type),
      message: this.getAlertMessage(type, data),
      data,
      timestamp: new Date().toISOString()
    };
    
    // Only add if we don't already have a recent alert of this type
    const recentAlert = this.metrics.alerts.find(
      a => a.type === type && 
      (Date.now() - new Date(a.timestamp).getTime()) < 300000 // 5 minutes
    );
    
    if (!recentAlert) {
      this.metrics.alerts.push(alert);
      
      // Keep only last 100 alerts
      if (this.metrics.alerts.length > 100) {
        this.metrics.alerts.shift();
      }
      
      // Log alert
      logger.warn({
        type: 'monitoring_alert',
        alert: alert,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get alert severity
   */
  getAlertSeverity(type) {
    const severityMap = {
      high_error_rate: 'high',
      slow_response_time: 'medium',
      high_memory_usage: 'high',
      database_slow_queries: 'medium',
      database_pool_high_utilization: 'high',
      high_error_count: 'high',
      database_connection_errors_critical: 'high',
      database_connection_errors_warning: 'medium',
      database_failed_queries_critical: 'high',
      database_failed_queries_warning: 'medium'
    };
    return severityMap[type] || 'low';
  }

  /**
   * Get alert message
   */
  getAlertMessage(type, data) {
    const messages = {
      high_error_rate: `High error rate detected: ${data.errorRate} (threshold: ${data.threshold})`,
      slow_response_time: `Slow response times detected: ${data.avgResponseTime} (threshold: ${data.threshold})`,
      high_memory_usage: `High memory usage: ${data.memoryUsage} (${data.used}/${data.total})`,
      database_slow_queries: `Database slow queries detected: ${data.slowQueries} (avg: ${data.avgQueryTime})`,
      database_pool_high_utilization: `Database pool high utilization: ${data.utilization} (${data.totalConnections}/${data.maxConnections} connections)`,
      high_error_count: `High error count: ${data.count} errors in the last minute`,
      database_connection_errors_critical: `Database connection errors (critical): ${data.count} disconnects in last minute (threshold: ${data.threshold})`,
      database_connection_errors_warning: `Database connection errors (warning): ${data.count} disconnects in last minute (threshold: ${data.threshold})`,
      database_failed_queries_critical: `Database failed queries (critical): ${data.count} in last minute (threshold: ${data.threshold})`,
      database_failed_queries_warning: `Database failed queries (warning): ${data.count} in last minute (threshold: ${data.threshold})`
    };
    return messages[type] || `Alert: ${type}`;
  }

  /**
   * Calculate percentiles
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const p50 = this.calculatePercentile(this.metrics.responseTimes.p50, 50);
    const p95 = this.calculatePercentile(this.metrics.responseTimes.p95, 95);
    const p99 = this.calculatePercentile(this.metrics.responseTimes.p99, 99);
    
    return {
      ...this.metrics,
      responseTimes: {
        ...this.metrics.responseTimes,
        avg: this.metrics.responseTimes.count > 0
          ? this.metrics.responseTimes.sum / this.metrics.responseTimes.count
          : 0,
        p50,
        p95,
        p99
      },
      uptime: Date.now() - this.startTime,
      errorRate: this.metrics.requests.total > 0
        ? this.metrics.errors.total / this.metrics.requests.total
        : 0
    };
  }

  /**
   * Reset hourly metrics (keeps totals but resets counters)
   */
  resetHourlyMetrics() {
    // Keep totals but reset some counters for hourly tracking
    this.metrics.responseTimes.p50 = [];
    this.metrics.responseTimes.p95 = [];
    this.metrics.responseTimes.p99 = [];
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byStatus: {},
        byRoute: {}
      },
      responseTimes: {
        min: Infinity,
        max: 0,
        sum: 0,
        count: 0,
        p50: [],
        p95: [],
        p99: []
      },
      errors: {
        total: 0,
        byType: {},
        byRoute: {}
      },
      database: {
        queries: 0,
        slowQueries: 0,
        failedQueries: 0,
        avgQueryTime: 0,
        queryTimeSum: 0
      },
      system: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0
        },
        cpu: {
          usage: 0
        },
        uptime: 0
      },
      alerts: []
    };
    this.startTime = Date.now();
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

/**
 * Monitoring middleware
 * Tracks request metrics
 */
const monitoringMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end.bind(res);
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    const route = req.route ? req.route.path : req.path;
    
    metricsCollector.recordRequest(
      req.method,
      route,
      res.statusCode,
      responseTime
    );
    
    return originalEnd(...args);
  };
  
  next();
};

/**
 * Get metrics endpoint handler
 */
const getMetrics = () => {
  return metricsCollector.getMetrics();
};

/**
 * Reset metrics endpoint handler
 */
const resetMetrics = () => {
  metricsCollector.reset();
  return { message: 'Metrics reset successfully' };
};

/**
 * Get alerts endpoint handler
 */
const getAlerts = (severity = null) => {
  const alerts = metricsCollector.metrics.alerts;
  if (severity) {
    return alerts.filter(alert => alert.severity === severity);
  }
  return alerts;
};

module.exports = {
  monitoringMiddleware,
  getMetrics,
  resetMetrics,
  getAlerts,
  metricsCollector
};

