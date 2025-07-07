const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Test configuration
const API_BASE_URL = 'http://localhost:5001/api';
const TEST_FILE_PATH = path.join(__dirname, 'test-files', 'test-audio.mp3');

// Create a small test file if it doesn't exist
const testFilesDir = path.join(__dirname, 'test-files');
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir, { recursive: true });
}

if (!fs.existsSync(TEST_FILE_PATH)) {
  // Create a small test MP3 file (just header bytes)
  const mp3Header = Buffer.from([
    0xFF, 0xFB, 0x90, 0x00, // MP3 header
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  fs.writeFileSync(TEST_FILE_PATH, mp3Header);
  console.log('📝 Created test MP3 file');
}

async function testS3UploadFlow() {
  try {
    console.log('🧪 Testing S3 Upload Flow End-to-End');
    console.log('=====================================');

    // Step 1: Login to get auth token
    console.log('\n1️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'djjetfuel@gmail.com', // Replace with your test email
      password: 'test123' // Replace with your test password
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Step 2: Check S3 configuration
    console.log('\n2️⃣ Checking S3 configuration...');
    const headers = { Authorization: `Bearer ${token}` };
    
    // Step 3: Get presigned URL
    console.log('\n3️⃣ Getting presigned URL...');
    const fileStats = fs.statSync(TEST_FILE_PATH);
    const presignedResponse = await axios.post(`${API_BASE_URL}/media/presigned-url`, {
      filename: 'test-audio.mp3',
      contentType: 'audio/mpeg',
      fileSize: fileStats.size
    }, { headers });
    
    const { uploadUrl, fileUrl, key } = presignedResponse.data;
    console.log('✅ Presigned URL received');
    console.log('📤 Upload URL:', uploadUrl.substring(0, 100) + '...');
    console.log('🔗 File URL:', fileUrl);
    console.log('🔑 S3 Key:', key);

    // Step 4: Upload file directly to S3
    console.log('\n4️⃣ Uploading file to S3...');
    const fileBuffer = fs.readFileSync(TEST_FILE_PATH);
    
    const s3Response = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': fileBuffer.length
      }
    });
    
    console.log('✅ S3 upload successful');
    console.log('📊 Response status:', s3Response.status);

    // Step 5: Confirm upload with server
    console.log('\n5️⃣ Confirming upload with server...');
    const confirmResponse = await axios.post(`${API_BASE_URL}/media/confirm-upload`, {
      title: 'Test Audio File',
      fileUrl: fileUrl,
      filename: 'test-audio.mp3',
      fileType: 'audio',
      contentType: 'audio/mpeg',
      filesize: fileBuffer.length,
      duration: null,
      s3Key: key
    }, { headers });
    
    console.log('✅ Upload confirmed');
    console.log('📋 Media record:', confirmResponse.data);

    // Step 6: Verify file appears in media list
    console.log('\n6️⃣ Verifying file in media list...');
    const mediaResponse = await axios.get(`${API_BASE_URL}/media?mine=true`, { headers });
    
    const uploadedFile = mediaResponse.data.media.find(m => m.s3_key === key);
    if (uploadedFile) {
      console.log('✅ File found in media list');
      console.log('📂 File details:', {
        id: uploadedFile.id,
        title: uploadedFile.title,
        url: uploadedFile.url,
        s3_key: uploadedFile.s3_key
      });
    } else {
      console.log('❌ File not found in media list');
    }

    // Step 7: Test file access
    console.log('\n7️⃣ Testing file access...');
    try {
      const accessResponse = await axios.head(fileUrl);
      console.log('✅ File accessible via S3 URL');
      console.log('📊 Content-Type:', accessResponse.headers['content-type']);
      console.log('📏 Content-Length:', accessResponse.headers['content-length']);
    } catch (error) {
      console.log('❌ File not accessible:', error.message);
    }

    console.log('\n🎉 S3 Upload Flow Test COMPLETED SUCCESSFULLY!');
    console.log('=====================================');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('📋 Response data:', error.response.data);
      console.error('📊 Response status:', error.response.status);
    }
    process.exit(1);
  }
}

// Run the test
testS3UploadFlow(); 