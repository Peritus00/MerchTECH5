const axios = require('axios');

async function compareDevVsProduction() {
  console.log('🔍 Comparing Development vs Production API Responses...\n');

  const devURL = 'http://localhost:5001/api';
  const prodURL = 'https://merchtech5-production.up.railway.app/api';

  const testEndpoints = [
    '/health',
    '/products',
    '/slideshows',
    '/activation-codes',
    '/qr-codes'
  ];

  console.log('📊 Testing endpoints without authentication first...\n');

  for (const endpoint of testEndpoints) {
    console.log(`\n🧪 Testing ${endpoint}:`);
    
    // Test development
    try {
      const devResponse = await axios.get(`${devURL}${endpoint}`);
      console.log(`  ✅ DEV: ${devResponse.status} - ${typeof devResponse.data} - ${JSON.stringify(devResponse.data).substring(0, 100)}...`);
    } catch (devError) {
      console.log(`  ❌ DEV: ${devError.response?.status || 'Network Error'} - ${devError.response?.data || devError.message}`);
    }

    // Test production
    try {
      const prodResponse = await axios.get(`${prodURL}${endpoint}`);
      console.log(`  ✅ PROD: ${prodResponse.status} - ${typeof prodResponse.data} - ${JSON.stringify(prodResponse.data).substring(0, 100)}...`);
    } catch (prodError) {
      console.log(`  ❌ PROD: ${prodError.response?.status || 'Network Error'} - ${prodError.response?.data || prodError.message}`);
    }
  }

  console.log('\n\n🔐 Testing authentication flow...\n');

  // Test login on both environments
  const testCredentials = {
    email: 'djjetfuel@gmail.com',
    password: 'test123'
  };

  let devToken = null;
  let prodToken = null;

  // Dev login
  try {
    const devLoginResponse = await axios.post(`${devURL}/auth/login`, testCredentials);
    devToken = devLoginResponse.data.token;
    console.log(`✅ DEV Login: Success - Token: ${devToken ? 'EXISTS' : 'MISSING'}`);
    console.log(`   User: ${devLoginResponse.data.user?.username || 'UNKNOWN'}`);
  } catch (devLoginError) {
    console.log(`❌ DEV Login: ${devLoginError.response?.status} - ${devLoginError.response?.data?.error || devLoginError.message}`);
  }

  // Prod login
  try {
    const prodLoginResponse = await axios.post(`${prodURL}/auth/login`, testCredentials);
    prodToken = prodLoginResponse.data.token;
    console.log(`✅ PROD Login: Success - Token: ${prodToken ? 'EXISTS' : 'MISSING'}`);
    console.log(`   User: ${prodLoginResponse.data.user?.username || 'UNKNOWN'}`);
  } catch (prodLoginError) {
    console.log(`❌ PROD Login: ${prodLoginError.response?.status} - ${prodLoginError.response?.data?.error || prodLoginError.message}`);
  }

  console.log('\n\n🔒 Testing authenticated endpoints...\n');

  // Test authenticated endpoints
  const authenticatedEndpoints = ['/products', '/slideshows', '/activation-codes'];

  for (const endpoint of authenticatedEndpoints) {
    console.log(`\n🧪 Testing authenticated ${endpoint}:`);
    
    // Test development with auth
    if (devToken) {
      try {
        const devResponse = await axios.get(`${devURL}${endpoint}`, {
          headers: { Authorization: `Bearer ${devToken}` }
        });
        console.log(`  ✅ DEV (auth): ${devResponse.status} - ${Array.isArray(devResponse.data) ? devResponse.data.length : 'Not Array'} items`);
      } catch (devError) {
        console.log(`  ❌ DEV (auth): ${devError.response?.status} - ${devError.response?.data?.error || devError.message}`);
      }
    }

    // Test production with auth
    if (prodToken) {
      try {
        const prodResponse = await axios.get(`${prodURL}${endpoint}`, {
          headers: { Authorization: `Bearer ${prodToken}` }
        });
        console.log(`  ✅ PROD (auth): ${prodResponse.status} - ${Array.isArray(prodResponse.data) ? prodResponse.data.length : 'Not Array'} items`);
      } catch (prodError) {
        console.log(`  ❌ PROD (auth): ${prodError.response?.status} - ${prodError.response?.data?.error || prodError.message}`);
      }
    }
  }

  console.log('\n\n📋 Summary:');
  console.log(`   Dev Token: ${devToken ? 'WORKING' : 'FAILED'}`);
  console.log(`   Prod Token: ${prodToken ? 'WORKING' : 'FAILED'}`);
  console.log('\n   Next steps:');
  console.log('   1. Check if user exists in production database');
  console.log('   2. Verify production environment variables');
  console.log('   3. Check production JWT secret consistency');
  console.log('   4. Verify production database connection');
}

compareDevVsProduction().catch(console.error); 