
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class HealthMonitor {
  constructor() {
    this.healthCheckInterval = 10000; // 10 seconds
    this.failureThreshold = 3; // Consecutive failures before action
    this.currentFailures = 0;
    this.isMonitoring = false;
    this.monitorTimer = null;
    this.healthHistory = [];
    this.maxHistorySize = 100;
    
    console.log('💚 Health Monitor initialized');
  }

  async start() {
    if (this.isMonitoring) {
      console.log('⚠️ Health monitoring already running');
      return;
    }

    console.log('💚 Starting health monitoring...');
    this.isMonitoring = true;
    this.monitorTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);

    // Perform initial health check
    await this.performHealthCheck();
  }

  async stop() {
    if (!this.isMonitoring) {
      return;
    }

    console.log('🛑 Stopping health monitoring...');
    this.isMonitoring = false;
    
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  async performHealthCheck() {
    try {
      const startTime = Date.now();
      const response = await axios.get('http://localhost:5000/api/health', {
        timeout: 5000,
        validateStatus: (status) => status < 500 // Accept 4xx as "healthy" but not 5xx
      });

      const responseTime = Date.now() - startTime;
      const healthData = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        responseTime,
        statusCode: response.status,
        serverData: response.data
      };

      this.recordHealthCheck(healthData);
      this.currentFailures = 0; // Reset failure count on success
      
      console.log(`💚 Health check passed (${responseTime}ms) - Status: ${response.status}`);
      
      // Log server metrics if available
      if (response.data && response.data.memoryUsage) {
        const memory = response.data.memoryUsage;
        const memoryMB = Math.round(memory.heapUsed / 1024 / 1024);
        console.log(`📊 Server memory usage: ${memoryMB}MB`);
      }

      return true;
    } catch (error) {
      await this.handleHealthCheckFailure(error);
      return false;
    }
  }

  async handleHealthCheckFailure(error) {
    this.currentFailures++;
    
    const healthData = {
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: error.message,
      failureCount: this.currentFailures
    };

    this.recordHealthCheck(healthData);
    
    console.error(`❌ Health check failed (${this.currentFailures}/${this.failureThreshold}):`, error.message);

    if (this.currentFailures >= this.failureThreshold) {
      console.error('🚨 Health check failure threshold exceeded!');
      await this.triggerRecoveryAction();
    }
  }

  async triggerRecoveryAction() {
    console.log('🔄 Triggering server recovery...');
    
    try {
      // Try to get server status first
      const status = await this.getServerStatus();
      console.log('📊 Server status before recovery:', status);
      
      // Attempt graceful restart signal
      await this.requestServerRestart();
      
      // Wait for restart
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Reset failure count
      this.currentFailures = 0;
      
      console.log('✅ Server recovery initiated');
    } catch (error) {
      console.error('❌ Server recovery failed:', error.message);
    }
  }

  async getServerStatus() {
    try {
      const response = await axios.get('http://localhost:5001/api/health', {
        timeout: 3000
      });
      return response.data;
    } catch (error) {
      return { status: 'unreachable', error: error.message };
    }
  }

  async requestServerRestart() {
    try {
      // Send restart signal to server
      const response = await axios.post('http://localhost:5001/api/admin/restart', {}, {
        timeout: 5000,
        headers: {
          'Authorization': 'Bearer dev_jwt_token_djjetfuel_12345' // Admin token
        }
      });
      
      console.log('🔄 Restart request sent to server');
      return response.data;
    } catch (error) {
      console.log('⚠️ Could not send restart request:', error.message);
      throw error;
    }
  }

  recordHealthCheck(healthData) {
    this.healthHistory.push(healthData);
    
    // Keep history within size limit
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(-this.maxHistorySize);
    }
  }

  getHealthSummary() {
    const recent = this.healthHistory.slice(-10);
    const healthy = recent.filter(h => h.status === 'healthy').length;
    const unhealthy = recent.length - healthy;
    
    return {
      totalChecks: this.healthHistory.length,
      recentHealthy: healthy,
      recentUnhealthy: unhealthy,
      currentFailures: this.currentFailures,
      isMonitoring: this.isMonitoring,
      lastCheck: this.healthHistory[this.healthHistory.length - 1]
    };
  }

  async saveHealthReport() {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        summary: this.getHealthSummary(),
        recentHistory: this.healthHistory.slice(-20)
      };

      const reportPath = path.join(__dirname, 'health-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      console.log('📊 Health report saved to:', reportPath);
    } catch (error) {
      console.error('❌ Failed to save health report:', error.message);
    }
  }
}

// Export the health monitor
module.exports = HealthMonitor;

// If run directly, start the health monitor
if (require.main === module) {
  const monitor = new HealthMonitor();
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down health monitor...');
    await monitor.stop();
    await monitor.saveHealthReport();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Start monitoring
  monitor.start().catch(console.error);
}
