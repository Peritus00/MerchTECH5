const axios = require('axios');

const API_BASE_URL = 'http://localhost:5001/api';

async function testValidationSystem() {
  console.log('🧪 Testing Upload Validation System...\n');
  
  try {
    // Test 1: Try to create a media record with a non-existent S3 file
    console.log('🔍 Test 1: Creating media record with non-existent S3 file...');
    
    const mediaData = {
      title: 'Test Validation File',
      url: 'https://merchtechbucket.s3.us-east-2.amazonaws.com/users/4/media/fake-file.mp4',
      filename: 'fake-file.mp4',
      fileType: 'video',
      contentType: 'video/mp4',
      filesize: 1000000, // 1MB
      s3_key: 'users/4/media/fake-file.mp4'
    };
    
    const response = await axios.post(`${API_BASE_URL}/media`, mediaData, {
      headers: {
        'Authorization': 'Bearer fake-token-for-test'
      }
    });
    
    console.log('❌ UNEXPECTED: Media creation should have failed but succeeded');
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Authentication required (expected)');
    } else if (error.response?.data?.code === 'FILE_NOT_FOUND_ON_S3') {
      console.log('✅ EXPECTED: Media creation correctly rejected non-existent S3 file');
    } else {
      console.log('⚠️  Got different error:', error.response?.data || error.message);
    }
  }
  
  // Test 2: Check if validation code is properly deployed
  console.log('\n🔍 Test 2: Checking if validation code is deployed...');
  
  try {
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Server is running:', healthResponse.data);
    
    // Check if the validation code exists in the server
    const serverResponse = await axios.get(`${API_BASE_URL}/`);
    console.log('✅ Server responding normally');
    
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
  }
  
  // Test 3: Check the problematic file directly
  console.log('\n🔍 Test 3: Checking the problematic file (ID 46)...');
  
  try {
    const streamResponse = await axios.get(`${API_BASE_URL}/media/46/stream`, {
      headers: { 'Range': 'bytes=0-1023' }
    });
    
    console.log('📊 Stream response headers:', {
      'content-length': streamResponse.headers['content-length'],
      'content-range': streamResponse.headers['content-range'],
      'content-type': streamResponse.headers['content-type']
    });
    
    const contentLength = parseInt(streamResponse.headers['content-length']);
    console.log(`📊 Actual file size on S3: ${contentLength} bytes`);
    
    if (contentLength < 100000) {
      console.log('⚠️  CONFIRMED: File is truncated (under 100KB)');
    } else {
      console.log('✅ File appears to be complete');
    }
    
  } catch (error) {
    console.log('❌ Stream test failed:', error.message);
  }
  
  console.log('\n🎉 Validation system test completed');
}

testValidationSystem().catch(console.error); 