
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

class FullSystemTester {
  constructor() {
    this.baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}:5001`;
    this.apiUrl = `${this.baseUrl}/api`;
    this.testResults = [];
    this.authToken = null;
  }

  async runAllTests() {
    console.log('🧪 FULL SYSTEM INTEGRATION TEST');
    console.log('===============================');
    console.log(`🌐 Testing against: ${this.baseUrl}`);
    console.log('');

    try {
      // Core infrastructure tests
      await this.testServerHealth();
      await this.testDatabaseConnection();
      await this.testStripeConfiguration();
      
      // Authentication tests
      await this.testUserRegistration();
      await this.testUserLogin();
      
      // Core functionality tests
      await this.testMediaUpload();
      await this.testPlaylistCreation();
      await this.testQRCodeGeneration();
      
      // Payment system tests
      await this.testPaymentIntentCreation();
      await this.testCheckoutSession();
      
      // Frontend API connectivity
      await this.testFrontendAPIConnection();
      
      this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ CRITICAL TEST FAILURE:', error.message);
      this.testResults.push({
        test: 'System Test Suite',
        status: 'CRITICAL_FAILURE',
        error: error.message
      });
    }
  }

  async testServerHealth() {
    console.log('🔍 Testing Server Health...');
    try {
      const response = await axios.get(`${this.apiUrl}/health`, { timeout: 10000 });
      
      if (response.status === 200 && response.data.status === 'healthy') {
        console.log('✅ Server Health: PASSED');
        console.log(`   - Port: ${response.data.port}`);
        console.log(`   - Database: ${response.data.database}`);
        console.log(`   - Uptime: ${Math.round(response.data.uptime)}s`);
        
        this.testResults.push({
          test: 'Server Health Check',
          status: 'PASSED',
          details: response.data
        });
      } else {
        throw new Error(`Unexpected response: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ Server Health: FAILED');
      console.log(`   Error: ${error.message}`);
      this.testResults.push({
        test: 'Server Health Check',
        status: 'FAILED',
        error: error.message
      });
      throw error; // Stop tests if server is down
    }
    console.log('');
  }

  async testDatabaseConnection() {
    console.log('🔍 Testing Database Connection...');
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      const result = await pool.query('SELECT COUNT(*) as user_count FROM users');
      await pool.end();
      
      console.log('✅ Database Connection: PASSED');
      console.log(`   - Users in database: ${result.rows[0].user_count}`);
      
      this.testResults.push({
        test: 'Database Connection',
        status: 'PASSED',
        details: { userCount: result.rows[0].user_count }
      });
    } catch (error) {
      console.log('❌ Database Connection: FAILED');
      console.log(`   Error: ${error.message}`);
      this.testResults.push({
        test: 'Database Connection',
        status: 'FAILED',
        error: error.message
      });
    }
    console.log('');
  }

  async testStripeConfiguration() {
    console.log('🔍 Testing Stripe Configuration...');
    try {
      const response = await axios.get(`${this.apiUrl}/stripe/health`);
      
      if (response.data.stripeConfigured) {
        console.log('✅ Stripe Configuration: PASSED');
        console.log(`   - Key Type: ${response.data.secretKeyType}`);
        console.log(`   - Valid Key: ${response.data.secretKeyValid}`);
        
        this.testResults.push({
          test: 'Stripe Configuration',
          status: 'PASSED',
          details: response.data
        });
      } else {
        throw new Error('Stripe not configured');
      }
    } catch (error) {
      console.log('❌ Stripe Configuration: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'Stripe Configuration',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testUserLogin() {
    console.log('🔍 Testing User Login...');
    try {
      const response = await axios.post(`${this.apiUrl}/auth/login`, {
        email: 'djjetfuel@gmail.com',
        password: 'Kerrie321'
      });
      
      if (response.data.token && response.data.user) {
        this.authToken = response.data.token;
        console.log('✅ User Login: PASSED');
        console.log(`   - User: ${response.data.user.email}`);
        console.log(`   - Admin: ${response.data.user.isAdmin}`);
        console.log(`   - Token: ${response.data.token.substring(0, 20)}...`);
        
        this.testResults.push({
          test: 'User Login',
          status: 'PASSED',
          details: {
            email: response.data.user.email,
            isAdmin: response.data.user.isAdmin
          }
        });
      } else {
        throw new Error('Invalid login response');
      }
    } catch (error) {
      console.log('❌ User Login: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'User Login',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testUserRegistration() {
    console.log('🔍 Testing User Registration...');
    try {
      const testEmail = `test${Date.now()}@example.com`;
      const response = await axios.post(`${this.apiUrl}/auth/register`, {
        email: testEmail,
        username: `testuser${Date.now()}`,
        password: 'TestPassword123!'
      });
      
      if (response.data.user && response.data.token) {
        console.log('✅ User Registration: PASSED');
        console.log(`   - Created user: ${response.data.user.email}`);
        
        this.testResults.push({
          test: 'User Registration',
          status: 'PASSED',
          details: { email: response.data.user.email }
        });
      } else {
        throw new Error('Invalid registration response');
      }
    } catch (error) {
      console.log('❌ User Registration: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'User Registration',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testMediaUpload() {
    console.log('🔍 Testing Media Upload...');
    if (!this.authToken) {
      console.log('⏭️ Media Upload: SKIPPED (No auth token)');
      return;
    }

    try {
      const response = await axios.post(`${this.apiUrl}/media`, {
        title: 'Test Media File',
        filePath: '/test/path/test.mp3',
        fileType: 'audio',
        contentType: 'audio/mpeg',
        filesize: 1024000,
        filename: 'test.mp3'
      }, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (response.data.id) {
        console.log('✅ Media Upload: PASSED');
        console.log(`   - Media ID: ${response.data.id}`);
        
        this.testResults.push({
          test: 'Media Upload',
          status: 'PASSED',
          details: { mediaId: response.data.id }
        });
      } else {
        throw new Error('Invalid media upload response');
      }
    } catch (error) {
      console.log('❌ Media Upload: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'Media Upload',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testPlaylistCreation() {
    console.log('🔍 Testing Playlist Creation...');
    if (!this.authToken) {
      console.log('⏭️ Playlist Creation: SKIPPED (No auth token)');
      return;
    }

    try {
      const response = await axios.post(`${this.apiUrl}/playlists`, {
        name: 'Test Playlist',
        description: 'A test playlist for system verification',
        isPublic: false
      }, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (response.data.id) {
        console.log('✅ Playlist Creation: PASSED');
        console.log(`   - Playlist ID: ${response.data.id}`);
        
        this.testResults.push({
          test: 'Playlist Creation',
          status: 'PASSED',
          details: { playlistId: response.data.id }
        });
      } else {
        throw new Error('Invalid playlist creation response');
      }
    } catch (error) {
      console.log('❌ Playlist Creation: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'Playlist Creation',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testQRCodeGeneration() {
    console.log('🔍 Testing QR Code Generation...');
    if (!this.authToken) {
      console.log('⏭️ QR Code Generation: SKIPPED (No auth token)');
      return;
    }

    try {
      const response = await axios.post(`${this.apiUrl}/qr-codes`, {
        name: 'Test QR Code',
        url: 'https://example.com/test',
        options: { size: 256, format: 'png' }
      }, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (response.data.id) {
        console.log('✅ QR Code Generation: PASSED');
        console.log(`   - QR Code ID: ${response.data.id}`);
        
        this.testResults.push({
          test: 'QR Code Generation',
          status: 'PASSED',
          details: { qrCodeId: response.data.id }
        });
      } else {
        throw new Error('Invalid QR code generation response');
      }
    } catch (error) {
      console.log('❌ QR Code Generation: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'QR Code Generation',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testPaymentIntentCreation() {
    console.log('🔍 Testing Payment Intent Creation...');
    if (!this.authToken) {
      console.log('⏭️ Payment Intent: SKIPPED (No auth token)');
      return;
    }

    try {
      const response = await axios.post(`${this.apiUrl}/stripe/create-payment-intent`, {
        subscriptionTier: 'basic',
        amount: 1500
      }, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (response.data.clientSecret) {
        console.log('✅ Payment Intent Creation: PASSED');
        console.log(`   - Client Secret: ${response.data.clientSecret.substring(0, 20)}...`);
        
        this.testResults.push({
          test: 'Payment Intent Creation',
          status: 'PASSED',
          details: { hasClientSecret: true }
        });
      } else {
        throw new Error('Invalid payment intent response');
      }
    } catch (error) {
      console.log('❌ Payment Intent Creation: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'Payment Intent Creation',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testCheckoutSession() {
    console.log('🔍 Testing Checkout Session...');
    if (!this.authToken) {
      console.log('⏭️ Checkout Session: SKIPPED (No auth token)');
      return;
    }

    try {
      const response = await axios.post(`${this.apiUrl}/stripe/create-checkout-session`, {
        subscriptionTier: 'basic',
        amount: 1500,
        successUrl: `${this.baseUrl}/success`,
        cancelUrl: `${this.baseUrl}/cancel`
      }, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (response.data.url && response.data.sessionId) {
        console.log('✅ Checkout Session: PASSED');
        console.log(`   - Session ID: ${response.data.sessionId}`);
        console.log(`   - Checkout URL: ${response.data.url.substring(0, 50)}...`);
        
        this.testResults.push({
          test: 'Checkout Session Creation',
          status: 'PASSED',
          details: { sessionId: response.data.sessionId }
        });
      } else {
        throw new Error('Invalid checkout session response');
      }
    } catch (error) {
      console.log('❌ Checkout Session: FAILED');
      console.log(`   Error: ${error.response?.data || error.message}`);
      this.testResults.push({
        test: 'Checkout Session Creation',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }
    console.log('');
  }

  async testFrontendAPIConnection() {
    console.log('🔍 Testing Frontend API Connection...');
    try {
      // Test the exact URL the frontend would use
      const frontendApiUrl = `https://${process.env.REPLIT_DEV_DOMAIN}:5001/api`;
      const response = await axios.get(`${frontendApiUrl}/health`);
      
      if (response.status === 200) {
        console.log('✅ Frontend API Connection: PASSED');
        console.log(`   - Frontend API URL: ${frontendApiUrl}`);
        
        this.testResults.push({
          test: 'Frontend API Connection',
          status: 'PASSED',
          details: { apiUrl: frontendApiUrl }
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ Frontend API Connection: FAILED');
      console.log(`   Error: ${error.message}`);
      this.testResults.push({
        test: 'Frontend API Connection',
        status: 'FAILED',
        error: error.message
      });
    }
    console.log('');
  }

  generateFinalReport() {
    console.log('📊 FINAL SYSTEM TEST REPORT');
    console.log('============================');

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIPPED').length;
    const critical = this.testResults.filter(r => r.status === 'CRITICAL_FAILURE').length;

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏭️ Skipped: ${skipped}`);
    console.log(`   🚨 Critical: ${critical}`);
    console.log(`   📊 Total: ${this.testResults.length}`);

    console.log(`\n🎯 System Status:`);
    if (critical > 0) {
      console.log('   🚨 CRITICAL ISSUES - System not functional');
    } else if (failed === 0) {
      console.log('   ✅ ALL SYSTEMS GO - Ready for production!');
    } else if (failed <= 2) {
      console.log('   ⚠️ MINOR ISSUES - Core functionality working');
    } else {
      console.log('   ❌ MAJOR ISSUES - Significant problems detected');
    }

    console.log(`\n📱 Ready for Testing:`);
    console.log(`   - Frontend: https://${process.env.REPLIT_DEV_DOMAIN}`);
    console.log(`   - API: https://${process.env.REPLIT_DEV_DOMAIN}:5001/api`);
    console.log(`   - Login: djjetfuel@gmail.com / Kerrie321`);
    
    console.log('\n============================');
    console.log('🧪 SYSTEM TEST COMPLETE');
  }
}

// Run the tests
if (require.main === module) {
  const tester = new FullSystemTester();
  tester.runAllTests().catch(console.error);
}

module.exports = FullSystemTester;
