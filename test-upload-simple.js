const axios = require('axios');

// Test configuration
const API_BASE_URL = 'http://localhost:5001/api';

async function testBasicUpload() {
  try {
    console.log('🧪 Testing Basic Upload Functionality');
    console.log('=====================================');

    // Step 1: Test server health
    console.log('\n1️⃣ Testing server health...');
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Server is healthy:', healthResponse.data);

    // Step 2: Create test user
    console.log('\n2️⃣ Creating/using test user...');
    const testEmail = 'test@example.com';
    const testPassword = 'testpassword123';
    
    try {
      await axios.post(`${API_BASE_URL}/auth/register`, {
        email: testEmail,
        password: testPassword,
        username: 'testuser'
      });
      console.log('✅ Test user created');
    } catch (error) {
      if (error.response?.status === 409 || error.response?.status === 400) {
        console.log('✅ Test user already exists');
      } else {
        throw error;
      }
    }

    // Step 3: Login
    console.log('\n3️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: testEmail,
      password: testPassword
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    const headers = { Authorization: `Bearer ${token}` };

    // Step 4: Test S3 presigned URL endpoint
    console.log('\n4️⃣ Testing S3 presigned URL endpoint...');
    try {
      const presignedResponse = await axios.post(`${API_BASE_URL}/media/presigned-url`, {
        filename: 'test-file.mp3',
        contentType: 'audio/mpeg',
        fileSize: 1024
      }, { headers });
      
      console.log('✅ S3 presigned URL endpoint works');
      console.log('🔗 Response keys:', Object.keys(presignedResponse.data));
      
      if (presignedResponse.data.uploadUrl && presignedResponse.data.fileUrl) {
        console.log('✅ S3 is properly configured');
        return await testS3Upload(headers, presignedResponse.data);
      } else {
        console.log('❌ S3 response missing required fields');
      }
      
    } catch (error) {
      if (error.response?.status === 500 && error.response?.data?.error?.includes('S3 storage not configured')) {
        console.log('⚠️  S3 not configured - testing fallback upload');
        return await testFallbackUpload(headers);
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
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

async function testS3Upload(headers, presignedData) {
  console.log('\n5️⃣ Testing S3 upload flow...');
  
  // Create test data
  const testData = Buffer.from('Test audio file content for S3 upload');
  
  try {
    // Upload to S3
    const s3Response = await axios.put(presignedData.uploadUrl, testData, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': testData.length
      }
    });
    
    console.log('✅ S3 upload successful');
    
    // Confirm upload with server
    const confirmResponse = await axios.post('http://localhost:5001/api/media/confirm-upload', {
      title: 'Test S3 Upload',
      fileUrl: presignedData.fileUrl,
      filename: 'test-file.mp3',
      fileType: 'audio',
      contentType: 'audio/mpeg',
      filesize: testData.length,
      s3Key: presignedData.key
    }, { headers });
    
    console.log('✅ Upload confirmed with server');
    console.log('📋 Media record ID:', confirmResponse.data.id);
    
    // Verify in media list
    const mediaResponse = await axios.get('http://localhost:5001/api/media?mine=true', { headers });
    const uploadedFile = mediaResponse.data.media.find(m => m.s3_key === presignedData.key);
    
    if (uploadedFile) {
      console.log('✅ File found in media list');
      console.log('🎉 S3 UPLOAD FLOW WORKING PERFECTLY!');
      return true;
    } else {
      console.log('❌ File not found in media list');
      return false;
    }
    
  } catch (error) {
    console.error('❌ S3 upload failed:', error.message);
    if (error.response) {
      console.error('📋 S3 Response:', error.response.status, error.response.statusText);
    }
    return false;
  }
}

async function testFallbackUpload(headers) {
  console.log('\n5️⃣ Testing fallback base64 upload...');
  
  const testData = 'data:audio/mpeg;base64,VGVzdCBhdWRpbyBmaWxlIGNvbnRlbnQ=';
  
  try {
    const uploadResponse = await axios.post('http://localhost:5001/api/media', {
      title: 'Test Fallback Upload',
      url: testData,
      filename: 'test-fallback.mp3',
      fileType: 'audio',
      contentType: 'audio/mpeg',
      filesize: testData.length,
      uniqueId: `test-${Date.now()}`
    }, { headers });
    
    console.log('✅ Fallback upload successful');
    console.log('📋 Media record ID:', uploadResponse.data.id);
    console.log('🎉 FALLBACK UPLOAD WORKING!');
    return true;
    
  } catch (error) {
    console.error('❌ Fallback upload failed:', error.message);
    return false;
  }
}

// Run the test
testBasicUpload(); 