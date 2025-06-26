
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const axios = require('axios');

class ServerConfigTester {
  constructor() {
    this.results = [];
    this.serverProcess = null;
  }

  async runTests() {
    console.log('🧪 TESTING SERVER CONFIGURATION');
    console.log('================================');
    
    await this.testPortAvailability();
    await this.testServerFiles();
    await this.testDatabaseConnection();
    await this.testConfigurationFiles();
    await this.testServerStartup();
    await this.testEndpointResponses();
    
    this.printResults();
  }

  async testPortAvailability() {
    console.log('\n🔍 Testing Port Availability...');
    
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      // Check both ports 5000 and 5001
      const ports = [5000, 5001];
      
      for (const port of ports) {
        try {
          const { stdout } = await execAsync(`lsof -ti:${port} || echo "free"`);
          
          if (stdout.trim() === 'free') {
            console.log(`✅ Port ${port} is available`);
            this.results.push({ test: `Port ${port} Availability`, status: 'PASS' });
          } else {
            console.log(`⚠️ Port ${port} is in use by process:`, stdout.trim());
            this.results.push({ test: `Port ${port} Availability`, status: 'WARNING', details: `PID: ${stdout.trim()}` });
          }
        } catch (error) {
          console.log(`❌ Port ${port} check failed:`, error.message);
          this.results.push({ test: `Port ${port} Availability`, status: 'FAIL', error: error.message });
        }
      }
    } catch (error) {
      console.log('❌ Port availability check failed:', error.message);
      this.results.push({ test: 'Port Availability Check', status: 'FAIL', error: error.message });
    }
  }

  async testServerFiles() {
    console.log('\n🔍 Testing Server Files...');
    
    const serverFiles = [
      'server/simple-server.js',
      'server/stable-server.js'
    ];
    
    for (const file of serverFiles) {
      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          
          // Check for port configuration
          const hasPort5001 = content.includes('5001');
          const hasPort5000 = content.includes('5000');
          const hasRoutes = content.includes('/api/') && (content.includes('app.get') || content.includes('app.post'));
          const hasDatabase = content.includes('pool') || content.includes('Pool');
          const hasAuth = content.includes('authenticateToken') || content.includes('auth');
          
          console.log(`✅ ${file} exists`);
          console.log(`   - Uses port 5001: ${hasPort5001 ? '✅' : '❌'}`);
          console.log(`   - Still references port 5000: ${hasPort5000 ? '⚠️' : '✅'}`);
          console.log(`   - API routes: ${hasRoutes ? '✅' : '❌'}`);
          console.log(`   - Database: ${hasDatabase ? '✅' : '❌'}`);
          console.log(`   - Authentication: ${hasAuth ? '✅' : '❌'}`);
          
          const status = hasPort5001 && hasRoutes && hasDatabase && hasAuth ? 'PASS' : 'WARNING';
          this.results.push({
            test: `${file} Configuration`,
            status,
            details: { 
              port5001: hasPort5001, 
              port5000: hasPort5000,
              routes: hasRoutes, 
              database: hasDatabase,
              auth: hasAuth
            }
          });
        } else {
          console.log(`❌ ${file} not found`);
          this.results.push({ test: `${file} Existence`, status: 'FAIL', error: 'File not found' });
        }
      } catch (error) {
        console.log(`❌ Error reading ${file}:`, error.message);
        this.results.push({ test: `${file} Read`, status: 'FAIL', error: error.message });
      }
    }
  }

  async testConfigurationFiles() {
    console.log('\n🔍 Testing Configuration Files...');
    
    const configFiles = [
      { file: '.replit', checkFor: ['5001', 'localPort'] },
      { file: 'services/api.ts', checkFor: ['5001', 'API_BASE_URL'] },
      { file: '.env.example', checkFor: ['5001', 'API_BASE_URL'] }
    ];
    
    for (const { file, checkFor } of configFiles) {
      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          
          const checks = {};
          checkFor.forEach(check => {
            checks[check] = content.includes(check);
          });
          
          console.log(`✅ ${file} exists`);
          Object.entries(checks).forEach(([key, value]) => {
            console.log(`   - Contains ${key}: ${value ? '✅' : '❌'}`);
          });
          
          const allPass = Object.values(checks).every(v => v);
          this.results.push({
            test: `${file} Configuration`,
            status: allPass ? 'PASS' : 'WARNING',
            details: checks
          });
        } else {
          console.log(`❌ ${file} not found`);
          this.results.push({ test: `${file} Existence`, status: 'FAIL', error: 'File not found' });
        }
      } catch (error) {
        console.log(`❌ Error reading ${file}:`, error.message);
        this.results.push({ test: `${file} Read`, status: 'FAIL', error: error.message });
      }
    }
  }

  async testDatabaseConnection() {
    console.log('\n🔍 Testing Database Connection...');
    
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      await pool.query('SELECT 1');
      console.log('✅ Database connection successful');
      this.results.push({ test: 'Database Connection', status: 'PASS' });
      
      await pool.end();
    } catch (error) {
      console.log('❌ Database connection failed:', error.message);
      this.results.push({ test: 'Database Connection', status: 'FAIL', error: error.message });
    }
  }

  async testServerStartup() {
    console.log('\n🔍 Testing Server Startup...');
    
    try {
      console.log('Starting test server...');
      this.serverProcess = spawn('node', ['server/simple-server.js'], {
        env: { ...process.env, PORT: '5001' },
        stdio: 'pipe',
        detached: false
      });
      
      let serverOutput = '';
      this.serverProcess.stdout.on('data', (data) => {
        serverOutput += data.toString();
      });
      
      this.serverProcess.stderr.on('data', (data) => {
        serverOutput += data.toString();
      });
      
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      if (serverOutput.includes('running on port')) {
        console.log('✅ Server started successfully');
        this.results.push({ test: 'Server Startup', status: 'PASS', details: 'Server running' });
      } else {
        console.log('⚠️ Server may not have started properly');
        console.log('Server output:', serverOutput);
        this.results.push({ test: 'Server Startup', status: 'WARNING', details: serverOutput });
      }
      
    } catch (error) {
      console.log('❌ Failed to start test server:', error.message);
      this.results.push({ test: 'Server Startup', status: 'FAIL', error: error.message });
    }
  }

  async testEndpointResponses() {
    console.log('\n🔍 Testing Server Endpoints...');
    
    const endpoints = [
      { path: '/', method: 'GET', description: 'Root endpoint' },
      { path: '/api/health', method: 'GET', description: 'Health check' },
      { path: '/api/auth/login', method: 'POST', description: 'Login endpoint', 
        body: { email: 'test@test.com', password: 'test' } }
    ];
    
    for (const endpoint of endpoints) {
      try {
        const result = await this.makeRequest(endpoint);
        console.log(`✅ ${endpoint.description}: Status ${result.statusCode}`);
        this.results.push({
          test: endpoint.description,
          status: result.statusCode < 500 ? 'PASS' : 'FAIL',
          details: { statusCode: result.statusCode, method: endpoint.method, path: endpoint.path }
        });
      } catch (error) {
        console.log(`❌ ${endpoint.description}: ${error.message}`);
        this.results.push({
          test: endpoint.description,
          status: 'FAIL',
          error: error.message
        });
      }
    }
    
    // Stop test server
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log('🛑 Test server stopped');
    }
  }

  async makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5001,
        path: endpoint.path,
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            data: data
          });
        });
      });
      
      req.on('error', (err) => {
        reject(err);
      });
      
      if (endpoint.body) {
        req.write(JSON.stringify(endpoint.body));
      }
      
      req.end();
      
      // Timeout after 10 seconds
      setTimeout(() => {
        req.destroy();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  printResults() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('========================');
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️ Warnings: ${warnings}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📝 Total: ${this.results.length}\n`);
    
    // Detailed results
    this.results.forEach((result, index) => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`${icon} ${result.test}: ${result.status}`);
      
      if (result.details) {
        console.log(`   Details:`, result.details);
      }
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      console.log('');
    });

    // Recommendations
    console.log('🔧 RECOMMENDATIONS');
    console.log('==================');
    
    if (failed > 0 || warnings > 0) {
      console.log('Issues found that need attention:');
      
      const portIssues = this.results.filter(r => r.test.includes('Port') && r.status !== 'PASS');
      if (portIssues.length > 0) {
        console.log('- Port configuration issues detected');
      }
      
      const configIssues = this.results.filter(r => r.test.includes('Configuration') && r.status !== 'PASS');
      if (configIssues.length > 0) {
        console.log('- Configuration file issues detected');
      }
      
      const serverIssues = this.results.filter(r => r.test.includes('Server') && r.status !== 'PASS');
      if (serverIssues.length > 0) {
        console.log('- Server startup or endpoint issues detected');
      }
    } else {
      console.log('✅ All tests passed! Server configuration looks good.');
    }
    
    console.log('\n🚀 Ready to run production server');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ServerConfigTester();
  tester.runTests().catch(console.error);
}

module.exports = ServerConfigTester;
