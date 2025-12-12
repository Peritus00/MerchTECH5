const axios = require('axios');

/**
 * Test script to verify Vercel frontend can connect to Railway backend
 * This simulates what the frontend does when logging in
 */

const RAILWAY_API_URL = 'https://merchtech5-production.up.railway.app/api';
const email = 'perrie.benton@gmail.com';
const password = 'Kerrie321$';

async function testConnection() {
  console.log('🧪 Testing Vercel → Railway Connection');
  console.log('========================================\n');
  console.log(`📡 Railway API URL: ${RAILWAY_API_URL}`);
  console.log(`📧 Email: ${email}`);
  console.log(`🔐 Password: ${password} (${password.length} chars)\n`);
  
  try {
    // Test health endpoint first
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await axios.get(`${RAILWAY_API_URL.replace('/api', '')}/health`, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (healthResponse.status === 200) {
      console.log('✅ Health check passed');
    } else {
      console.log(`⚠️  Health check returned status ${healthResponse.status}`);
    }
    console.log('');
    
    // Test login endpoint
    console.log('2️⃣ Testing login endpoint...');
    const loginResponse = await axios.post(
      `${RAILWAY_API_URL}/auth/login`,
      { email, password },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true // Don't throw on any status
      }
    );
    
    console.log(`📊 Response Status: ${loginResponse.status}`);
    
    if (loginResponse.status === 200) {
      console.log('✅ Login successful!');
      console.log(`👤 User: ${loginResponse.data.user?.email}`);
      console.log(`🎫 Token received: ${loginResponse.data.token ? 'Yes' : 'No'}`);
      console.log('\n🎉 Everything is working correctly!');
    } else {
      console.log('❌ Login failed');
      console.log(`Error: ${loginResponse.data?.error || 'Unknown error'}`);
      console.log('\n📝 Troubleshooting:');
      console.log('   1. Check Railway logs for detailed error messages');
      console.log('   2. Verify DATABASE_URL in Railway matches the database we tested');
      console.log('   3. Check if the enhanced logging shows what password was received');
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('\n⚠️  Cannot connect to Railway backend');
      console.error('   Check that Railway service is running');
    } else if (error.response) {
      console.error(`\nStatus: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    }
  }
}

testConnection();

