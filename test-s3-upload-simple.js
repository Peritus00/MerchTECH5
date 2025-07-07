const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Test configuration
const API_BASE_URL = 'http://localhost:5001/api';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword123';

async function testS3UploadFlow() {
  try {
    console.log('🧪 Testing S3 Upload Flow End-to-End');
    console.log('=====================================');

    // Step 1: Register a test user
    console.log('\n1️⃣ Creating test user...');
    try {
      await axios.post(`${API_BASE_URL}/auth/register`, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        username: 'testuser'
      });
      console.log('✅ Test user created');
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.error?.includes('already exists')) {
        console.log('✅ Test user already exists');
      } else if (error.response?.status === 409) {
        console.log('✅ Test user already exists (409)');
      } else {
        throw error;
      }
    }

    // Step 2: Login
    console.log('\n2️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Step 3: Check if S3 is configured
    console.log('\n3️⃣ Checking S3 configuration...');
    const headers = { Authorization: `Bearer ${token}` };
    
    try {
      const presignedResponse = await axios.post(`${API_BASE_URL}/media/presigned-url`, {
        filename: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        fileSize: 1024
      }, { headers });
      
      console.log('✅ S3 is configured and working');
      console.log('🔗 Sample presigned URL generated successfully');
      
      // Test the upload flow
      await testActualUpload(token);
      
    } catch (error) {
      if (error.response?.status === 500 && error.response?.data?.error?.includes('S3 storage not configured')) {
        console.log('❌ S3 not configured - testing fallback to base64 upload');
        await testFallbackUpload(token);
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('❌ Full error:', error);
    if (error.response) {
      console.error('📋 Response data:', error.response.data);
      console.error('📊 Response status:', error.response.status);
      console.error('🔗 Request URL:', error.response.config?.url);
    }
    if (error.code) {
      console.error('💥 Error code:', error.code);
    }
  }
}

async function testActualUpload(token) {
  console.log('\n4️⃣ Testing actual S3 upload...');
  
  // Create a small test file
  const testData = Buffer.from('This is a test audio file content');
  
  const headers = { Authorization: `Bearer ${token}` };
  
  // Get presigned URL
  const presignedResponse = await axios.post(`${API_BASE_URL}/media/presigned-url`, {
    filename: 'test-upload.mp3',
    contentType: 'audio/mpeg',
    fileSize: testData.length
  }, { headers });
  
  const { uploadUrl, fileUrl, key } = presignedResponse.data;
  console.log('✅ Presigned URL received');
  
  // Upload to S3
  const s3Response = await axios.put(uploadUrl, testData, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': testData.length
    }
  });
  
  console.log('✅ S3 upload successful');
  
  // Confirm upload
  const confirmResponse = await axios.post(`${API_BASE_URL}/media/confirm-upload`, {
    title: 'Test S3 Upload',
    fileUrl: fileUrl,
    filename: 'test-upload.mp3',
    fileType: 'audio',
    contentType: 'audio/mpeg',
    filesize: testData.length,
    s3Key: key
  }, { headers });
  
  console.log('✅ Upload confirmed');
  console.log('📋 Media record created:', confirmResponse.data.id);
  
  // Verify in media list
  const mediaResponse = await axios.get(`${API_BASE_URL}/media?mine=true`, { headers });
  const uploadedFile = mediaResponse.data.media.find(m => m.s3_key === key);
  
  if (uploadedFile) {
    console.log('✅ File found in media list');
    console.log('🎉 S3 UPLOAD FLOW WORKING PERFECTLY!');
  } else {
    console.log('❌ File not found in media list');
  }
}

async function testFallbackUpload(token) {
  console.log('\n4️⃣ Testing fallback base64 upload...');
  
  const testData = 'data:audio/mpeg;base64,VGhpcyBpcyBhIHRlc3Q=';
  
  const headers = { Authorization: `Bearer ${token}` };
  
  // Use legacy upload method
  const uploadResponse = await axios.post(`${API_BASE_URL}/media`, {
    title: 'Test Fallback Upload',
    url: testData,
    filename: 'test-fallback.mp3',
    fileType: 'audio',
    contentType: 'audio/mpeg',
    filesize: testData.length,
    uniqueId: `test-${Date.now()}`
  }, { headers });
  
  console.log('✅ Fallback upload successful');
  console.log('📋 Media record:', uploadResponse.data.id);
  
  console.log('🎉 FALLBACK UPLOAD WORKING!');
}

// Run the test
testS3UploadFlow(); 