
#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

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
    await this.testEndpointResponses();
    
    this.printResults();
  }

  async testPortAvailability() {
    console.log('\n🔍 Testing Port Availability...');
    
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      // Check if port 5001 is available (since we changed from 5000)
      const { stdout } = await execAsync('lsof -ti:5001 || echo "free"');
      
      if (stdout.trim() === 'free') {
        console.log('✅ Port 5001 is available');
        this.results.push({ test: 'Port 5001 Availability', status: 'PASS' });
      } else {
        console.log('⚠️ Port 5001 is in use by process:', stdout.trim());
        this.results.push({ test: 'Port 5001 Availability', status: 'WARNING', details: `PID: ${stdout.trim()}` });
      }
    } catch (error) {
      console.log('❌ Port check failed:', error.message);
      this.results.push({ test: 'Port 5001 Availability', status: 'FAIL', error: error.message });
    }
  }

  async testServerFiles() {
    console.log('\n🔍 Testing Server Files...');
    
    const fs = require('fs');
    const serverFiles = [
      'server/simple-server.js',
      'server/stable-server.js',
      'server/working-server.js'
    ];
    
    for (const file of serverFiles) {
      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          
          // Check for port configuration
          const hasPort = content.includes('PORT') || content.includes('5001');
          const hasRoutes = content.includes('/api/') && content.includes('app.get') || content.includes('app.post');
          const hasDatabase = content.includes('pool') || content.includes('Pool');
          
          console.log(`✅ ${file} exists`);
          console.log(`   - Port config: ${hasPort ? '✅' : '❌'}`);
          console.log(`   - API routes: ${hasRoutes ? '✅' : '❌'}`);
          console.log(`   - Database: ${hasDatabase ? '✅' : '❌'}`);
          
          this.results.push({
            test: `${file} Configuration`,
            status: hasPort && hasRoutes && hasDatabase ? 'PASS' : 'WARNING',
            details: { port: hasPort, routes: hasRoutes, database: hasDatabase }
          });
        } else {
          console.log(`❌ ${file} not found`);
          this.results.push({ test: `${file} Existence`, status: 'FAIL', error: 'File not found' });
        }
      } catch (error) {
        console.log(`❌ Error checking ${file}:`, error.message);
        this.results.push({ test: `${file} Check`, status: 'FAIL', error: error.message });
      }
    }
  }

  async testDatabaseConnection() {
    console.log('\n🔍 Testing Database Connection...');
    
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
      
      const result = await pool.query('SELECT NOW() as timestamp');
      console.log('✅ Database connection successful');
      console.log('   - Timestamp:', result.rows[0].timestamp);
      
      await pool.end();
      this.results.push({ test: 'Database Connection', status: 'PASS', details: result.rows[0] });
    } catch (error) {
      console.log('❌ Database connection failed:', error.message);
      this.results.push({ test: 'Database Connection', status: 'FAIL', error: error.message });
    }
  }

  async testEndpointResponses() {
    console.log('\n🔍 Testing Server Endpoints...');
    
    // Start server for testing
    console.log('Starting test server...');
    try {
      this.serverProcess = spawn('node', ['server/simple-server.js'], {
        env: { ...process.env, PORT: '5001' },
        stdio: 'pipe'
      });
      
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const endpoints = [
        { path: '/', method: 'GET', description: 'Root endpoint' },
        { path: '/api/health', method: 'GET', description: 'Health check' },
        { path: '/api/auth/login', method: 'POST', description: 'Login endpoint', 
          body: { email: 'test@test.com', password: 'test' } }
      ];
      
      for (const endpoint of endpoints) {
        try {
          const result = await this.makeRequest(endpoint);
          console.log(`✅ ${endpoint.description}: ${result.statusCode}`);
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
      }
      
    } catch (error) {
      console.log('❌ Failed to start test server:', error.message);
      this.results.push({ test: 'Server Startup', status: 'FAIL', error: error.message });
    }
  }

  makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
      const postData = endpoint.body ? JSON.stringify(endpoint.body) : null;
      
      const options = {
        hostname: 'localhost',
        port: 5001,
        path: endpoint.path,
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => reject(new Error('Request timeout')));
      
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  printResults() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('=======================');
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️ Warnings: ${warnings}`);
    console.log(`❌ Failed: ${failed}`);
    
    console.log('\nDetailed Results:');
    this.results.forEach((result, index) => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`${index + 1}. ${icon} ${result.test}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.details) {
        console.log(`   Details:`, result.details);
      }
    });
    
    console.log('\n🔧 RECOMMENDATIONS:');
    
    if (failed > 0) {
      console.log('❌ Critical issues found - server may not work properly');
      console.log('   - Check server file syntax and dependencies');
      console.log('   - Verify database connection string');
      console.log('   - Ensure port 5001 is available');
    } else if (warnings > 0) {
      console.log('⚠️ Some warnings detected - server should work but may have issues');
      console.log('   - Review configuration warnings above');
    } else {
      console.log('✅ Server configuration looks good!');
      console.log('   - All tests passed');
      console.log('   - Ready to run production server');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ServerConfigTester();
  tester.runTests().catch(console.error);
}

module.exports = ServerConfigTester;
