#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:5001';

console.log('🔒 MerchTech Security Test Suite');
console.log('================================');

async function testSecurityHeaders() {
  console.log('\n1. Testing Security Headers...');
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    const headers = response.headers;
    
    console.log('✅ Health endpoint accessible');
    console.log('Headers received:', Object.keys(headers));
    
    // Check for security headers
    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options', 
      'x-xss-protection',
      'strict-transport-security'
    ];
    
    securityHeaders.forEach(header => {
      if (headers[header]) {
        console.log(`✅ ${header}: ${headers[header]}`);
      } else {
        console.log(`❌ Missing: ${header}`);
      }
    });
    
  } catch (error) {
    console.log('❌ Security headers test failed:', error.message);
  }
}

async function testRateLimiting() {
  console.log('\n2. Testing Rate Limiting...');
  try {
    const promises = [];
    
    // Test auth rate limiting (max 5 per 15 minutes)
    for (let i = 0; i < 7; i++) {
      promises.push(
        axios.post(`${BASE_URL}/api/auth/login`, {
          email: 'test@test.com',
          password: 'wrongpassword'
        }, {
          validateStatus: () => true // Don't throw on 4xx/5xx
        })
      );
    }
    
    const responses = await Promise.all(promises);
    const statusCodes = responses.map(r => r.status);
    
    console.log('Response codes:', statusCodes);
    
    // Should see 429 (rate limited) after 5 attempts
    const rateLimitedCount = statusCodes.filter(code => code === 429).length;
    if (rateLimitedCount > 0) {
      console.log(`✅ Rate limiting working! ${rateLimitedCount} requests blocked`);
    } else {
      console.log('❌ Rate limiting not working - all requests went through');
    }
    
  } catch (error) {
    console.log('❌ Rate limiting test failed:', error.message);
  }
}

async function testInputValidation() {
  console.log('\n3. Testing Input Validation...');
  try {
    // Test malicious input
    const maliciousInputs = [
      { email: '<script>alert("xss")</script>', password: 'test' },
      { email: 'test@test.com', password: 'DROP TABLE users;' },
      { email: 'test@test.com', password: '"><script>alert(1)</script>' }
    ];
    
    for (const input of maliciousInputs) {
      const response = await axios.post(`${BASE_URL}/api/auth/login`, input, {
        validateStatus: () => true
      });
      
      if (response.status === 400) {
        console.log(`✅ Blocked malicious input: ${input.email}`);
      } else {
        console.log(`❌ Malicious input not blocked: ${input.email}`);
      }
    }
    
  } catch (error) {
    console.log('❌ Input validation test failed:', error.message);
  }
}

async function testFileUploadSecurity() {
  console.log('\n4. Testing File Upload Security...');
  try {
    // Test without authentication
    const response = await axios.post(`${BASE_URL}/api/upload`, {}, {
      validateStatus: () => true
    });
    
    if (response.status === 401) {
      console.log('✅ Upload endpoint requires authentication');
    } else {
      console.log('❌ Upload endpoint not properly protected');
    }
    
  } catch (error) {
    console.log('❌ File upload security test failed:', error.message);
  }
}

async function testSecurityLogging() {
  console.log('\n5. Testing Security Logging...');
  try {
    // Make a request that should be logged
    await axios.get(`${BASE_URL}/nonexistent-route`, {
      validateStatus: () => true
    });
    
    // Check if security log exists
    const logPath = '../../logs/security.log';
    if (fs.existsSync(logPath)) {
      console.log('✅ Security logging is active');
      const logContent = fs.readFileSync(logPath, 'utf8');
      const lines = logContent.split('\\n').filter(line => line.trim());
      console.log(`📝 Security log has ${lines.length} entries`);
      
      // Show last few entries
      if (lines.length > 0) {
        console.log('Recent log entries:');
        lines.slice(-3).forEach(line => {
          try {
            const logEntry = JSON.parse(line);
            console.log(`  - ${logEntry.timestamp}: ${logEntry.type} from ${logEntry.ip}`);
          } catch (e) {
            console.log(`  - ${line.substring(0, 100)}...`);
          }
        });
      }
    } else {
      console.log('❌ Security log file not found');
    }
    
  } catch (error) {
    console.log('❌ Security logging test failed:', error.message);
  }
}

async function runAllTests() {
  console.log('Starting security tests...');
  
  await testSecurityHeaders();
  await testRateLimiting();
  await testInputValidation();
  await testFileUploadSecurity();
  await testSecurityLogging();
  
  console.log('\\n🔒 Security Test Suite Complete!');
  console.log('================================');
  console.log('Review the results above to ensure all security measures are working.');
}

// Run tests
runAllTests().catch(console.error); 