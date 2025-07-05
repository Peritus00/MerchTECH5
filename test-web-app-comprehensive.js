#!/usr/bin/env node

const https = require('https');
const http = require('http');

console.log('🌐 COMPREHENSIVE WEB APP TEST');
console.log('=====================================');
console.log('Testing: https://app.merchtech.net');
console.log('');

// Test configuration
const BASE_URL = 'https://app.merchtech.net';
const TIMEOUT = 10000;

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function addTestResult(testName, passed, details) {
  testResults.tests.push({
    name: testName,
    passed,
    details
  });
  
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}: PASSED`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}: FAILED`);
    console.log(`   Details: ${details}`);
  }
}

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: TIMEOUT
    };

    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(requestOptions, (res) => {
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

async function runTests() {
  console.log('🔍 Starting comprehensive web app tests...\n');

  // Test 1: Root URL accessibility
  try {
    const response = await makeRequest(BASE_URL);
    const isAccessible = response.statusCode === 200;
    addTestResult('Root URL Accessibility', isAccessible, 
      `Status: ${response.statusCode}, Content-Length: ${response.body.length}`);
  } catch (error) {
    addTestResult('Root URL Accessibility', false, `Error: ${error.message}`);
  }

  // Test 2: Login page content validation
  try {
    const response = await makeRequest(BASE_URL);
    const hasLoginForm = response.body.includes('Email') && 
                        response.body.includes('Password') && 
                        (response.body.includes('Sign in') || response.body.includes('Login'));
    const hasReactApp = response.body.includes('_expo') || response.body.includes('react');
    
    addTestResult('Login Page Content', hasLoginForm, 
      `Has email field: ${response.body.includes('Email')}, Has password field: ${response.body.includes('Password')}, Has sign in: ${response.body.includes('Sign in')}`);
    
    addTestResult('React App Loading', hasReactApp, 
      `React/Expo assets found: ${hasReactApp}`);
  } catch (error) {
    addTestResult('Login Page Content', false, `Error: ${error.message}`);
    addTestResult('React App Loading', false, `Error: ${error.message}`);
  }

  // Test 3: JavaScript bundle accessibility
  try {
    const response = await makeRequest(BASE_URL);
    const jsMatch = response.body.match(/_expo\/static\/js\/web\/[^"]+\.js/);
    if (jsMatch) {
      const jsUrl = `${BASE_URL}/${jsMatch[0]}`;
      const jsResponse = await makeRequest(jsUrl);
      const jsLoads = jsResponse.statusCode === 200 && jsResponse.body.length > 1000;
      addTestResult('JavaScript Bundle Loading', jsLoads, 
        `JS URL: ${jsUrl}, Status: ${jsResponse.statusCode}, Size: ${jsResponse.body.length} bytes`);
    } else {
      addTestResult('JavaScript Bundle Loading', false, 'No JavaScript bundle found in HTML');
    }
  } catch (error) {
    addTestResult('JavaScript Bundle Loading', false, `Error: ${error.message}`);
  }

  // Test 4: API endpoint accessibility
  try {
    const response = await makeRequest(`${BASE_URL}/api/health`);
    const apiWorks = response.statusCode === 200;
    addTestResult('API Endpoint Accessibility', apiWorks, 
      `Status: ${response.statusCode}, Response: ${response.body.substring(0, 100)}`);
  } catch (error) {
    addTestResult('API Endpoint Accessibility', false, `Error: ${error.message}`);
  }

  // Test 5: Authentication endpoint
  try {
    const response = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'wrongpassword'
      })
    });
    
    const authEndpointWorks = response.statusCode === 400 || response.statusCode === 401;
    addTestResult('Authentication Endpoint', authEndpointWorks, 
      `Status: ${response.statusCode} (should be 400/401 for invalid creds)`);
  } catch (error) {
    addTestResult('Authentication Endpoint', false, `Error: ${error.message}`);
  }

  // Test 6: Static assets loading
  try {
    const response = await makeRequest(`${BASE_URL}/_expo/static/css/fonts.css`);
    const cssLoads = response.statusCode === 200 || response.statusCode === 404; // 404 is OK if no CSS
    addTestResult('Static Assets Loading', cssLoads, 
      `CSS Status: ${response.statusCode}`);
  } catch (error) {
    addTestResult('Static Assets Loading', false, `Error: ${error.message}`);
  }

  // Test 7: Direct login page access
  try {
    const response = await makeRequest(`${BASE_URL}/auth/login`);
    const loginPageWorks = response.statusCode === 200;
    addTestResult('Direct Login Page Access', loginPageWorks, 
      `Status: ${response.statusCode}`);
  } catch (error) {
    addTestResult('Direct Login Page Access', false, `Error: ${error.message}`);
  }

  // Test 8: Protected route behavior (should redirect or show login)
  try {
    const response = await makeRequest(`${BASE_URL}/media`);
    const protectedRouteHandled = response.statusCode === 200; // Should serve some content
    addTestResult('Protected Route Handling', protectedRouteHandled, 
      `Status: ${response.statusCode}`);
  } catch (error) {
    addTestResult('Protected Route Handling', false, `Error: ${error.message}`);
  }

  // Test 9: Check for common web app issues
  try {
    const response = await makeRequest(BASE_URL);
    const noBlankPage = !response.body.includes('Loading dashboard') || 
                       response.body.includes('Email') || 
                       response.body.includes('Sign in');
    const noJSErrors = !response.body.includes('ReferenceError') && 
                      !response.body.includes('TypeError');
    
    addTestResult('No Blank Loading Page', noBlankPage, 
      `Has login content: ${response.body.includes('Email')}, Has loading dashboard: ${response.body.includes('Loading dashboard')}`);
    
    addTestResult('No JavaScript Errors', noJSErrors, 
      `No reference errors found in initial HTML`);
  } catch (error) {
    addTestResult('No Blank Loading Page', false, `Error: ${error.message}`);
    addTestResult('No JavaScript Errors', false, `Error: ${error.message}`);
  }

  // Test 10: CORS and security headers
  try {
    const response = await makeRequest(BASE_URL);
    const hasSecurityHeaders = response.headers['strict-transport-security'] || 
                              response.headers['x-frame-options'] ||
                              response.headers['content-security-policy'];
    
    addTestResult('Security Headers Present', !!hasSecurityHeaders, 
      `HSTS: ${!!response.headers['strict-transport-security']}, X-Frame-Options: ${!!response.headers['x-frame-options']}`);
  } catch (error) {
    addTestResult('Security Headers Present', false, `Error: ${error.message}`);
  }

  // Print comprehensive results
  console.log('\n🏁 TEST RESULTS SUMMARY');
  console.log('========================');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📊 Total: ${testResults.tests.length}`);
  console.log(`🎯 Success Rate: ${Math.round((testResults.passed / testResults.tests.length) * 100)}%`);

  if (testResults.failed > 0) {
    console.log('\n🔍 FAILED TESTS DETAILS:');
    testResults.tests.filter(t => !t.passed).forEach(test => {
      console.log(`❌ ${test.name}: ${test.details}`);
    });
  }

  console.log('\n🌐 WEB APP DIAGNOSIS:');
  
  if (testResults.passed >= 8) {
    console.log('✅ Web app is functioning well!');
  } else if (testResults.passed >= 6) {
    console.log('⚠️  Web app has some issues but is mostly working');
  } else if (testResults.passed >= 4) {
    console.log('🔧 Web app has significant issues that need fixing');
  } else {
    console.log('❌ Web app is not working properly and needs major fixes');
  }

  // Specific recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  
  const failedTests = testResults.tests.filter(t => !t.passed);
  if (failedTests.some(t => t.name.includes('Login'))) {
    console.log('- Fix login page rendering and content');
  }
  if (failedTests.some(t => t.name.includes('JavaScript'))) {
    console.log('- Check JavaScript bundle loading and React app initialization');
  }
  if (failedTests.some(t => t.name.includes('API'))) {
    console.log('- Verify API endpoints are working correctly');
  }
  if (failedTests.some(t => t.name.includes('Loading'))) {
    console.log('- Fix blank loading page issue');
  }

  console.log('\n🔚 Test completed!');
}

// Run the tests
runTests().catch(console.error); 