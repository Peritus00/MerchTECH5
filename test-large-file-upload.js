const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

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

async function testLargeFileUpload(token) {
  console.log('\n📁 Testing large file upload...');
  
  try {
    // Create a large test file (50MB)
    const fileSize = 50 * 1024 * 1024; // 50MB
    console.log(`📊 Creating test file of ${fileSize} bytes (${fileSize / 1024 / 1024} MB)...`);
    
    const testFilePath = path.join(__dirname, 'test-large-upload.mp4');
    const testData = Buffer.alloc(fileSize);
    
    // Fill with pattern to verify integrity
    for (let i = 0; i < fileSize; i += 4) {
      testData.writeUInt32BE(i, i);
    }
    
    fs.writeFileSync(testFilePath, testData);
    console.log(`✅ Test file created: ${testFilePath}`);
    
    // Verify file on disk
    const stats = fs.statSync(testFilePath);
    console.log(`📊 File on disk: ${stats.size} bytes`);
    
    if (stats.size !== fileSize) {
      console.error('❌ File creation failed - size mismatch');
      return false;
    }
    
    // Upload the file
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testFilePath), {
      filename: 'test-large-upload.mp4',
      contentType: 'video/mp4'
    });
    
    console.log('📤 Starting upload...');
    const startTime = Date.now();
    
    const uploadResponse = await axios.post(`${API_BASE_URL}/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      },
      timeout: 10 * 60 * 1000, // 10 minutes timeout
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    const uploadTime = Date.now() - startTime;
    console.log(`✅ Upload completed in ${uploadTime}ms`);
    
    console.log('📊 Upload response:', {
      message: uploadResponse.data.message,
      validated: uploadResponse.data.validated,
      key: uploadResponse.data.key
    });
    
    // Test creating media record
    const mediaData = {
      title: 'Large File Upload Test',
      url: uploadResponse.data.url,
      filename: 'test-large-upload.mp4',
      fileType: 'video',
      contentType: 'video/mp4',
      filesize: fileSize,
      s3_key: uploadResponse.data.key
    };
    
    const mediaResponse = await axios.post(`${API_BASE_URL}/media`, mediaData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('✅ Media record created successfully:', mediaResponse.data.id);
    
    // Test streaming the file
    console.log('🎬 Testing file streaming...');
    const streamResponse = await axios.get(`${API_BASE_URL}/media/${mediaResponse.data.id}/stream`, {
      headers: { 'Range': 'bytes=0-1023' }
    });
    
    const contentLength = parseInt(streamResponse.headers['content-range'].split('/')[1]);
    console.log(`📊 Streamed file size: ${contentLength} bytes`);
    
    if (contentLength === fileSize) {
      console.log('🎉 SUCCESS: File uploaded and streamed with correct size!');
    } else {
      console.error(`❌ FAILURE: Size mismatch - Expected: ${fileSize}, Got: ${contentLength}`);
    }
    
    // Cleanup
    fs.unlinkSync(testFilePath);
    console.log('🧹 Test file cleaned up');
    
    return {
      success: contentLength === fileSize,
      mediaId: mediaResponse.data.id,
      uploadTime,
      expectedSize: fileSize,
      actualSize: contentLength
    };
    
  } catch (error) {
    console.error('❌ Large file upload test failed:', error.response?.data || error.message);
    
    // Cleanup on error
    const testFilePath = path.join(__dirname, 'test-large-upload.mp4');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log('🧹 Test file cleaned up after error');
    }
    
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

async function runLargeFileTest() {
  console.log('🧪 LARGE FILE UPLOAD TEST STARTING...\n');
  
  let token;
  
  try {
    // Login
    token = await login();
    
    // Test large file upload
    const result = await testLargeFileUpload(token);
    
    // Summary
    console.log('\n📊 TEST RESULTS:');
    console.log('✅ Large file upload test:', result.success ? 'PASSED' : 'FAILED');
    
    if (result.success) {
      console.log(`📊 Upload time: ${result.uploadTime}ms`);
      console.log(`📊 File size: ${result.expectedSize} bytes`);
      console.log('🎉 UPLOAD TRUNCATION ISSUE FIXED!');
    } else {
      console.log('❌ Upload truncation issue still exists');
      if (result.error) {
        console.log('Error details:', result.error);
      }
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
}

// Run the tests
runLargeFileTest().catch(console.error); 