const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_BASE_URL = 'http://localhost:5001/api';

// Test credentials
const testCredentials = {
  email: 'djjetfuel@gmail.com',
  password: 'password123'
};

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, testCredentials);
    console.log('✅ Login successful');
    return response.data.token;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testValidUpload(token) {
  console.log('\n📤 Testing valid upload...');
  
  try {
    // Create a test file
    const testContent = Buffer.from('This is a test audio file for validation testing');
    const testFilePath = path.join(__dirname, 'test-validation-file.mp3');
    fs.writeFileSync(testFilePath, testContent);
    
    // Upload the file
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testFilePath), {
      filename: 'test-validation-file.mp3',
      contentType: 'audio/mpeg'
    });
    
    const uploadResponse = await axios.post(`${API_BASE_URL}/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Upload successful:', {
      url: uploadResponse.data.url,
      key: uploadResponse.data.key,
      validated: uploadResponse.data.validated
    });
    
    // Test creating media record
    const mediaData = {
      title: 'Test Validation File',
      url: uploadResponse.data.url,
      filename: 'test-validation-file.mp3',
      fileType: 'audio',
      contentType: 'audio/mpeg',
      filesize: testContent.length,
      s3_key: uploadResponse.data.key
    };
    
    const mediaResponse = await axios.post(`${API_BASE_URL}/media`, mediaData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('✅ Media record created successfully:', mediaResponse.data.id);
    
    // Cleanup
    fs.unlinkSync(testFilePath);
    
    return {
      mediaId: mediaResponse.data.id,
      s3Key: uploadResponse.data.key
    };
    
  } catch (error) {
    console.error('❌ Valid upload test failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testInvalidMediaCreation(token) {
  console.log('\n🚫 Testing invalid media creation (non-existent S3 file)...');
  
  try {
    const invalidMediaData = {
      title: 'Invalid Test File',
      url: 'https://merchtechbucket.s3.us-east-2.amazonaws.com/users/4/media/non-existent-file.mp3',
      filename: 'non-existent-file.mp3',
      fileType: 'audio',
      contentType: 'audio/mpeg',
      filesize: 1024,
      s3_key: 'users/4/media/non-existent-file.mp3'
    };
    
    const response = await axios.post(`${API_BASE_URL}/media`, invalidMediaData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('❌ UNEXPECTED: Media creation should have failed but succeeded');
    return false;
    
  } catch (error) {
    if (error.response?.data?.code === 'FILE_NOT_FOUND_ON_S3') {
      console.log('✅ EXPECTED: Media creation correctly rejected non-existent S3 file');
      return true;
    } else {
      console.error('❌ UNEXPECTED ERROR:', error.response?.data || error.message);
      return false;
    }
  }
}

async function testLargeFileUpload(token) {
  console.log('\n📁 Testing large file upload validation...');
  
  try {
    // Create a larger test file (1MB)
    const largeContent = Buffer.alloc(1024 * 1024, 'A'); // 1MB of 'A' characters
    const testFilePath = path.join(__dirname, 'test-large-file.mp4');
    fs.writeFileSync(testFilePath, largeContent);
    
    // Upload the file
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testFilePath), {
      filename: 'test-large-file.mp4',
      contentType: 'video/mp4'
    });
    
    const uploadResponse = await axios.post(`${API_BASE_URL}/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Large file upload successful:', {
      url: uploadResponse.data.url,
      key: uploadResponse.data.key,
      validated: uploadResponse.data.validated
    });
    
    // Cleanup
    fs.unlinkSync(testFilePath);
    
    return uploadResponse.data.key;
    
  } catch (error) {
    console.error('❌ Large file upload test failed:', error.response?.data || error.message);
    throw error;
  }
}

async function cleanupTestFiles(token, testResults) {
  console.log('\n🧹 Cleaning up test files...');
  
  try {
    // Delete test media records
    if (testResults.validUpload?.mediaId) {
      await axios.delete(`${API_BASE_URL}/media/${testResults.validUpload.mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('✅ Deleted test media record');
    }
    
    console.log('✅ Cleanup completed');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.response?.data || error.message);
  }
}

async function runValidationTests() {
  console.log('🧪 UPLOAD VALIDATION TESTS STARTING...\n');
  
  let token;
  const testResults = {};
  
  try {
    // Login
    token = await login();
    
    // Test 1: Valid upload with validation
    testResults.validUpload = await testValidUpload(token);
    
    // Test 2: Invalid media creation (non-existent S3 file)
    testResults.invalidMedia = await testInvalidMediaCreation(token);
    
    // Test 3: Large file upload validation
    testResults.largeFile = await testLargeFileUpload(token);
    
    // Summary
    console.log('\n📊 TEST RESULTS SUMMARY:');
    console.log('✅ Valid upload with validation:', testResults.validUpload ? 'PASSED' : 'FAILED');
    console.log('✅ Invalid media creation rejection:', testResults.invalidMedia ? 'PASSED' : 'FAILED');
    console.log('✅ Large file upload validation:', testResults.largeFile ? 'PASSED' : 'FAILED');
    
    const allPassed = testResults.validUpload && testResults.invalidMedia && testResults.largeFile;
    console.log('\n🎉 OVERALL RESULT:', allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
    
    // Cleanup
    await cleanupTestFiles(token, testResults);
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    
    // Attempt cleanup even if tests failed
    if (token) {
      await cleanupTestFiles(token, testResults);
    }
  }
}

// Run the tests
runValidationTests().catch(console.error); 