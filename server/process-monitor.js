
const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ProcessMonitor {
  constructor() {
    this.serverProcess = null;
    this.restartCount = 0;
    this.maxRestarts = 5;
    this.restartDelay = 5000; // 5 seconds
    this.healthCheckInterval = 15000; // 15 seconds
    this.healthCheckTimer = null;
    this.isShuttingDown = false;
    this.lastHealthCheck = null;
    
    console.log('🔄 Process Monitor initialized');
    
    // Bind methods to preserve context
    this.startServer = this.startServer.bind(this);
    this.stopServer = this.stopServer.bind(this);
    this.restartServer = this.restartServer.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
    this.cleanup = this.cleanup.bind(this);
  }

  async startServer() {
    if (this.serverProcess) {
      console.log('⚠️ Server already running, stopping first...');
      await this.stopServer();
    }

    console.log(`🚀 Starting server (attempt ${this.restartCount + 1}/${this.maxRestarts + 1})`);
    
    try {
      // Clean up any orphaned processes first
      await this.cleanupOrphanedProcesses();
      
      // Start the server process
      this.serverProcess = spawn('node', ['simple-server.js'], {
        cwd: path.join(__dirname),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      // Handle server output
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`📡 SERVER: ${output}`);
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          console.error(`❌ SERVER ERROR: ${error}`);
        }
      });

      // Handle server exit
      this.serverProcess.on('exit', async (code, signal) => {
        console.log(`🔴 Server process exited with code ${code}, signal ${signal}`);
        this.serverProcess = null;
        
        if (!this.isShuttingDown) {
          if (this.restartCount < this.maxRestarts) {
            console.log(`🔄 Scheduling restart in ${this.restartDelay / 1000} seconds...`);
            setTimeout(() => this.restartServer(), this.restartDelay);
          } else {
            console.error(`❌ Max restart attempts (${this.maxRestarts}) reached. Manual intervention required.`);
          }
        }
      });

      // Handle server errors
      this.serverProcess.on('error', (error) => {
        console.error('❌ Server process error:', error);
        if (!this.isShuttingDown) {
          this.restartServer();
        }
      });

      // Wait for server to be ready
      await this.waitForServerReady();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      console.log('✅ Server started successfully');
      this.restartCount = 0; // Reset on successful start
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }

  async stopServer() {
    if (!this.serverProcess) {
      return;
    }

    console.log('🛑 Stopping server...');
    this.isShuttingDown = true;
    
    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Gracefully terminate the server
    this.serverProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('⚠️ Forcing server shutdown...');
        if (this.serverProcess) {
          this.serverProcess.kill('SIGKILL');
        }
        resolve();
      }, 10000); // 10 second timeout

      this.serverProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.serverProcess = null;
    console.log('✅ Server stopped');
  }

  async restartServer() {
    if (this.restartCount >= this.maxRestarts) {
      console.error(`❌ Max restart attempts reached. Stopping restart attempts.`);
      return;
    }

    this.restartCount++;
    console.log(`🔄 Restarting server (${this.restartCount}/${this.maxRestarts})`);
    
    await this.stopServer();
    await new Promise(resolve => setTimeout(resolve, this.restartDelay));
    await this.startServer();
  }

  async waitForServerReady() {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    let waited = 0;

    while (waited < maxWaitTime) {
      try {
        const response = await this.makeHealthRequest();
        if (response.ok) {
          console.log('✅ Server is ready');
          return;
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    throw new Error('Server failed to become ready within timeout period');
  }

  async makeHealthRequest() {
    const fetch = (await import('node-fetch')).default;
    return fetch('http://0.0.0.0:5001/api/health', {
      method: 'GET',
      timeout: 5000
    });
  }

  startHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.healthCheck();
    }, this.healthCheckInterval);

    console.log('💚 Health monitoring started');
  }

  async healthCheck() {
    try {
      const response = await this.makeHealthRequest();
      
      if (response.ok) {
        const data = await response.json();
        this.lastHealthCheck = new Date().toISOString();
        console.log('💚 Health check passed:', data.status);
        return true;
      } else {
        console.log('⚠️ Health check failed with status:', response.status);
        await this.handleHealthCheckFailure();
        return false;
      }
    } catch (error) {
      console.error('❌ Health check error:', error.message);
      await this.handleHealthCheckFailure();
      return false;
    }
  }

  async handleHealthCheckFailure() {
    console.log('🔄 Health check failed, attempting server restart...');
    
    if (!this.isShuttingDown) {
      await this.restartServer();
    }
  }

  async cleanupOrphanedProcesses() {
    try {
      console.log('🧹 Cleaning up orphaned processes...');
      
      const commands = [
        'pkill -f "node.*simple-server" || true',
        'pkill -f "node.*5001" || true',
        'lsof -ti:5001 | xargs kill -9 2>/dev/null || true',
        'fuser -k 5001/tcp 2>/dev/null || true'
      ];

      for (const command of commands) {
        try {
          await this.execCommand(command);
        } catch (error) {
          // Ignore errors in cleanup
        }
      }

      // Wait for cleanup to take effect
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ Process cleanup completed');
    } catch (error) {
      console.log('🧹 Process cleanup completed with warnings:', error.message);
    }
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  async cleanup() {
    console.log('🧹 Process monitor cleanup...');
    this.isShuttingDown = true;
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    await this.stopServer();
    console.log('✅ Process monitor cleanup complete');
  }

  getStatus() {
    return {
      isRunning: !!this.serverProcess,
      restartCount: this.restartCount,
      maxRestarts: this.maxRestarts,
      lastHealthCheck: this.lastHealthCheck,
      pid: this.serverProcess ? this.serverProcess.pid : null
    };
  }
}

// Create and export the monitor
const monitor = new ProcessMonitor();

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`🛑 ${signal} received, shutting down process monitor...`);
  await monitor.cleanup();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit immediately, let the monitor handle it
});

// Start the monitor
monitor.startServer().catch((error) => {
  console.error('❌ Failed to start process monitor:', error);
  process.exit(1);
});

module.exports = monitor;
