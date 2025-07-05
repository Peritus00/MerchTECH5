#!/usr/bin/env node

const https = require('https');

console.log('🔐 TESTING WEB APP LOGIN FUNCTIONALITY');
console.log('=====================================');
console.log('Testing: https://app.merchtech.net');
console.log('');

const BASE_URL = 'https://app.merchtech.net';
const ADMIN_EMAIL = 'DJJETFUEL@GMAIL.COM';
const ADMIN_PASSWORD = 'GIZMO321$';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MerchTech-Test/1.0',
        ...options.headers
      },
      timeout: 10000
    };

    const req = https.request(requestOptions, (res) => {
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testWebApp() {
  console.log('🔍 Testing web app functionality...\n');

  // Test 1: Check if login page loads
  try {
    console.log('1. Testing login page load...');
    const response = await makeRequest(BASE_URL);
    
    if (response.statusCode === 200) {
      const hasLoginElements = response.body.includes('Email') && 
                              response.body.includes('Password') && 
                              response.body.includes('Sign in');
      
      if (hasLoginElements) {
        console.log('✅ Login page loads correctly with all elements');
      } else {
        console.log('❌ Login page missing required elements');
        console.log('   Has Email:', response.body.includes('Email'));
        console.log('   Has Password:', response.body.includes('Password'));
        console.log('   Has Sign in:', response.body.includes('Sign in'));
      }
    } else {
      console.log(`❌ Login page failed to load (Status: ${response.statusCode})`);
    }
  } catch (error) {
    console.log(`❌ Error loading login page: ${error.message}`);
  }

  // Test 2: Test login API endpoint
  try {
    console.log('\n2. Testing login API endpoint...');
    const loginResponse = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      })
    });

    if (loginResponse.statusCode === 200) {
      console.log('✅ Login API endpoint working');
      
      try {
        const loginData = JSON.parse(loginResponse.body);
        if (loginData.user && loginData.user.email) {
          console.log(`✅ Login successful for: ${loginData.user.email}`);
          console.log(`✅ User role: ${loginData.user.role || 'user'}`);
        } else {
          console.log('⚠️  Login response missing user data');
        }
      } catch (parseError) {
        console.log('⚠️  Could not parse login response');
      }
    } else if (loginResponse.statusCode === 400 || loginResponse.statusCode === 401) {
      console.log(`⚠️  Login failed (Status: ${loginResponse.statusCode}) - Check credentials`);
      console.log(`   Response: ${loginResponse.body.substring(0, 200)}`);
    } else {
      console.log(`❌ Unexpected login response (Status: ${loginResponse.statusCode})`);
    }
  } catch (error) {
    console.log(`❌ Error testing login: ${error.message}`);
  }

  // Test 3: Test protected route
  try {
    console.log('\n3. Testing protected route access...');
    const mediaResponse = await makeRequest(`${BASE_URL}/media`);
    
    if (mediaResponse.statusCode === 200) {
      console.log('✅ Protected routes accessible (serves app content)');
    } else {
      console.log(`❌ Protected route failed (Status: ${mediaResponse.statusCode})`);
    }
  } catch (error) {
    console.log(`❌ Error testing protected route: ${error.message}`);
  }

  // Test 4: Test API health
  try {
    console.log('\n4. Testing API health...');
    const healthResponse = await makeRequest(`${BASE_URL}/api/health`);
    
    if (healthResponse.statusCode === 200) {
      console.log('✅ API backend is healthy');
      console.log(`   Response: ${healthResponse.body.substring(0, 100)}`);
    } else {
      console.log(`❌ API health check failed (Status: ${healthResponse.statusCode})`);
    }
  } catch (error) {
    console.log(`❌ Error testing API health: ${error.message}`);
  }

  // Test 5: Check for JavaScript errors in HTML
  try {
    console.log('\n5. Checking for JavaScript errors...');
    const response = await makeRequest(BASE_URL);
    
    const hasJSErrors = response.body.includes('Error:') || 
                       response.body.includes('ReferenceError') ||
                       response.body.includes('TypeError') ||
                       response.body.includes('SyntaxError');
    
    if (!hasJSErrors) {
      console.log('✅ No JavaScript errors detected in HTML');
    } else {
      console.log('❌ JavaScript errors detected in HTML');
    }
  } catch (error) {
    console.log(`❌ Error checking for JS errors: ${error.message}`);
  }

  console.log('\n🏁 WEB APP TEST COMPLETE');
  console.log('========================');
  console.log('');
  console.log('📋 SUMMARY:');
  console.log('- Login page should load with Email/Password fields');
  console.log('- Login API should accept admin credentials');
  console.log('- Protected routes should serve app content');
  console.log('- API backend should be healthy');
  console.log('- No JavaScript errors should be present');
  console.log('');
  console.log('🌐 Visit https://app.merchtech.net to test manually');
  console.log(`🔐 Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

testWebApp().catch(console.error); 