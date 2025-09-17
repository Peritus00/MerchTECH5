const axios = require('axios');

const API_BASE = 'https://merchtech5-production.up.railway.app';
const FRONTEND_BASE = 'https://app.merchtech.net';

// Test credentials
const TEST_EMAIL = 'djjetfuel@gmail.com';
const TEST_PASSWORD = 'Gizmo321$';

let authToken = null;

async function runComprehensiveTest() {
  console.log('🔍 COMPREHENSIVE SYSTEM TEST - MerchTech Application');
  console.log('=' .repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Test 1: Frontend Loading
  await testEndpoint('Frontend Loading', 'GET', FRONTEND_BASE, null, null, results);
  
  // Test 2: Backend Health
  await testEndpoint('Backend Health', 'GET', `${API_BASE}/api/health`, null, null, results);
  
  // Test 3: User Authentication
  const authResult = await testAuth(results);
  if (authResult) authToken = authResult;
  
  // Test 4: Product Management
  await testEndpoint('Product Listing', 'GET', `${API_BASE}/api/products/all`, null, null, results);
  await testEndpoint('Individual Product', 'GET', `${API_BASE}/api/products/19`, null, null, results);
  
  // Test 5: User Management (Admin)
  if (authToken) {
    await testEndpoint('Admin User List', 'GET', `${API_BASE}/api/admin/all-users`, 
      { 'Authorization': `Bearer ${authToken}` }, null, results);
    await testEndpoint('User Profile', 'GET', `${API_BASE}/api/users/1`, null, null, results);
  }
  
  // Test 6: Stripe Checkout Systems
  if (authToken) {
    await testEndpoint('Product Checkout', 'POST', `${API_BASE}/api/checkout/session`,
      { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      { items: [{ productId: 19, quantity: 1 }] }, results);
      
    await testEndpoint('Subscription Checkout', 'POST', `${API_BASE}/api/stripe/create-checkout-session`,
      { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      { subscriptionTier: 'premium', amount: 4999 }, results);
  }
  
  // Test 7: Email System
  await testEndpoint('Email Verification', 'POST', `${API_BASE}/api/auth/send-verification`,
    { 'Content-Type': 'application/json' },
    { email: TEST_EMAIL }, results);

  // Final Report
  console.log('\n' + '=' .repeat(60));
  console.log('📊 FINAL TEST RESULTS');
  console.log('=' .repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  
  console.log('\n🔍 DETAILED RESULTS:');
  results.tests.forEach(test => {
    const status = test.passed ? '✅' : '❌';
    console.log(`${status} ${test.name}: ${test.result}`);
  });

  if (results.failed > 0) {
    console.log('\n🚨 CRITICAL ISSUES DETECTED');
    console.log('The following systems are not functioning correctly:');
    results.tests.filter(t => !t.passed).forEach(test => {
      console.log(`   - ${test.name}: ${test.result}`);
    });
  }
}

async function testAuth(results) {
  try {
    const response = await axios.post(`${API_BASE}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    if (response.data.token) {
      results.passed++;
      results.tests.push({
        name: 'User Authentication',
        passed: true,
        result: `Login successful, token received`
      });
      return response.data.token;
    } else {
      throw new Error('No token in response');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({
      name: 'User Authentication',
      passed: false,
      result: `Login failed: ${error.response?.data?.error || error.message}`
    });
    return null;
  }
}

async function testEndpoint(name, method, url, headers, data, results) {
  try {
    const config = { method, url, headers: headers || {} };
    if (data) config.data = data;
    
    const response = await axios(config);
    
    // Check for successful response
    if (response.status >= 200 && response.status < 300) {
      results.passed++;
      results.tests.push({
        name,
        passed: true,
        result: `HTTP ${response.status} - Success`
      });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    results.failed++;
    const statusCode = error.response?.status || 'Network Error';
    const errorMsg = error.response?.data?.error || error.message;
    results.tests.push({
      name,
      passed: false,
      result: `HTTP ${statusCode} - ${errorMsg}`
    });
  }
}

// Run the test
runComprehensiveTest().catch(console.error); 