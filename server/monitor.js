
const { spawn } = require('child_process');
const http = require('http');

let serverProcess = null;
let restartCount = 0;
const MAX_RESTARTS = 5;

function startServer() {
  console.log(`[${new Date().toISOString()}] Starting server (attempt ${restartCount + 1})`);
  
  serverProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  serverProcess.on('close', (code) => {
    console.log(`[${new Date().toISOString()}] Server process exited with code ${code}`);
    
    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[${new Date().toISOString()}] Restarting server in 5 seconds...`);
      setTimeout(startServer, 5000);
    } else if (restartCount >= MAX_RESTARTS) {
      console.error(`[${new Date().toISOString()}] Max restart attempts reached. Server stopped.`);
    }
  });

  serverProcess.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Server process error:`, err);
  });
}

// Health check function
function healthCheck() {
  const options = {
    hostname: '0.0.0.0',
    port: process.env.PORT || 5001,
    path: '/api/health',
    method: 'GET',
    timeout: 10000
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log(`[${new Date().toISOString()}] Health check passed`);
      restartCount = 0; // Reset restart count on successful health check
    } else {
      console.warn(`[${new Date().toISOString()}] Health check failed with status ${res.statusCode}`);
      // Don't restart on 404 or other HTTP errors, only on connection failures
    }
  });

  req.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Health check error:`, err.message);
    // Only restart on connection errors, not HTTP errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.log(`[${new Date().toISOString()}] Server appears to be down, will monitor for restart`);
    }
  });

  req.on('timeout', () => {
    console.error(`[${new Date().toISOString()}] Health check timeout`);
    req.destroy();
  });

  req.end();
}

// Start the server
startServer();

// Run health checks every 10 minutes to reduce connection spam and prevent multiple restarts
setInterval(healthCheck, 600000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});
