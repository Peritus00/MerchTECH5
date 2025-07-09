const axios = require('axios');

// Test the new POST policy endpoint
async function testPostPolicy() {
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://merchtech5-production.up.railway.app';
  
  console.log('🧪 Testing S3 POST Policy Endpoint');
  console.log('🔗 API Base URL:', API_BASE_URL);
  
  try {
    // First, we need to login to get a token
    console.log('\n1️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'djjetfuel@gmail.com',
      password: 'test123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Test the new POST policy endpoint
    console.log('\n2️⃣ Testing POST policy endpoint...');
    const postPolicyResponse = await axios.post(`${API_BASE_URL}/media/post-policy`, {
      filename: 'test-image.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024 * 1024 // 1MB
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ POST policy endpoint works!');
    console.log('📋 Response keys:', Object.keys(postPolicyResponse.data));
    console.log('🔗 URL:', postPolicyResponse.data.url);
    console.log('📝 Fields:', Object.keys(postPolicyResponse.data.fields));
    
    return postPolicyResponse.data;
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📋 Headers:', error.response.headers);
    }
    throw error;
  }
}

// Run the test
testPostPolicy()
  .then(result => {
    console.log('\n🎉 POST Policy test completed successfully!');
    console.log('📤 Ready to use S3 POST policy uploads');
  })
  .catch(error => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  }); 