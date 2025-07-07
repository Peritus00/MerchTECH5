const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Configuration
const API_URL = process.env.API_URL || 'https://your-api-url.com';
const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  username: 'testuser'
};

// Test image file (ensure this exists in the test-files directory)
const TEST_IMAGE_PATH = path.join(__dirname, 'test-files', 'test-image.png');

// Utility functions
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Store tokens and IDs for use across tests
let authToken = '';
let resetToken = '';
let uploadedMediaId = '';

// Test Suite
async function runTests() {
  console.log('🧪 Starting System Functionality Tests...\n');
  
  try {
    // 1. Authentication Tests
    console.log('📋 Running Authentication Tests...');
    await testRegistration();
    await testLogin();
    await testPasswordResetRequest();
    await testPasswordReset();
    console.log('✅ Authentication Tests Passed\n');

    // 2. Media Upload Tests
    console.log('📋 Running Media Upload Tests...');
    await testMediaUpload();
    await testMediaRetrieval();
    console.log('✅ Media Upload Tests Passed\n');

    // 3. API Endpoint Tests
    console.log('📋 Running API Endpoint Tests...');
    await testEndpoints();
    console.log('✅ API Endpoint Tests Passed\n');

    console.log('🎉 All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
      console.error('Status Code:', error.response.status);
    }
    process.exit(1);
  }
}

// Authentication Tests
async function testRegistration() {
  console.log('  → Testing user registration...');
  try {
    const response = await axios.post(`${API_URL}/api/auth/register`, {
      email: TEST_USER.email,
      password: TEST_USER.password,
      username: TEST_USER.username
    });
    assert(response.status === 201, 'Registration should return 201');
    console.log('    ✓ Registration successful');
  } catch (error) {
    if (error.response && error.response.status === 409) {
      console.log('    ℹ User already exists (expected for repeat runs)');
    } else {
      throw error;
    }
  }
}

async function testLogin() {
  console.log('  → Testing user login...');
  const response = await axios.post(`${API_URL}/api/auth/login`, {
    email: TEST_USER.email,
    password: TEST_USER.password
  });
  
  assert(response.status === 200, 'Login should return 200');
  assert(response.data.token, 'Login should return a token');
  authToken = response.data.token;
  console.log('    ✓ Login successful');
}

async function testPasswordResetRequest() {
  console.log('  → Testing password reset request...');
  const response = await axios.post(`${API_URL}/api/auth/forgot-password`, {
    email: TEST_USER.email
  });
  
  assert(response.status === 200, 'Password reset request should return 200');
  // In a real environment, we'd get the token from the email
  // For testing, we'll get it from the response if available
  resetToken = response.data.token || 'test-reset-token';
  console.log('    ✓ Password reset request successful');
}

async function testPasswordReset() {
  console.log('  → Testing password reset...');
  const newPassword = 'NewTestPassword123!';
  
  const response = await axios.post(`${API_URL}/api/auth/reset-password`, {
    token: resetToken,
    newPassword: newPassword
  });
  
  assert(response.status === 200, 'Password reset should return 200');
  console.log('    ✓ Password reset successful');

  // Verify new password works
  const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
    email: TEST_USER.email,
    password: newPassword
  });
  
  assert(loginResponse.status === 200, 'Login with new password should work');
  console.log('    ✓ Login with new password successful');
}

// Media Upload Tests
async function testMediaUpload() {
  console.log('  → Testing media upload...');
  
  // Create form data with file
  const formData = new FormData();
  formData.append('file', fs.createReadStream(TEST_IMAGE_PATH));
  
  const response = await axios.post(`${API_URL}/api/media`, formData, {
    headers: {
      ...formData.getHeaders(),
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  assert(response.status === 201, 'Upload should return 201');
  assert(response.data.id, 'Upload should return media ID');
  uploadedMediaId = response.data.id;
  console.log('    ✓ Media upload successful');
}

async function testMediaRetrieval() {
  console.log('  → Testing media retrieval...');
  const response = await axios.get(`${API_URL}/api/media/${uploadedMediaId}`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  assert(response.status === 200, 'Media retrieval should return 200');
  assert(response.data.url, 'Media retrieval should return URL');
  console.log('    ✓ Media retrieval successful');
}

// API Endpoint Tests
async function testEndpoints() {
  console.log('  → Testing critical endpoints...');
  
  // Test health endpoint
  const healthResponse = await axios.get(`${API_URL}/api/health`);
  assert(healthResponse.status === 200, 'Health check should return 200');
  console.log('    ✓ Health endpoint working');

  // Test protected endpoint
  const protectedResponse = await axios.get(`${API_URL}/api/media?mine=true`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  assert(protectedResponse.status === 200, 'Protected endpoint should return 200');
  console.log('    ✓ Protected endpoints working');
}

// Run the tests
if (require.main === module) {
  // Create test image if it doesn't exist
  const testFilesDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testFilesDir)) {
    fs.mkdirSync(testFilesDir);
  }
  
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    // Create a simple test image
    const testImageData = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(TEST_IMAGE_PATH, testImageData);
  }

  runTests().catch(console.error);
} 