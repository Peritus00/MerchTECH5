const axios = require('axios');

async function debugActivationEndpoint() {
  console.log('🔍 Debugging Activation Code Endpoint...\n');

  const baseURL = 'https://merchtech5-production.up.railway.app/api';
  const adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGpqZXRmdWVsQGdtYWlsLmNvbSIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc1MTk0MzcwOSwiZXhwIjoxNzUyMDMwMTA5fQ.OKOjRWeemoMxfgYbFmW8bgOKC3MhPjAhNgONVPa4cf0';

  try {
    // Test 1: Try with playlistId only
    console.log('1️⃣ Testing with playlistId only...');
    try {
      const response1 = await axios.post(`${baseURL}/activation-codes`, {
        playlistId: 999, // Use a non-existent ID to test validation
        maxUses: 3,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Response 1:', response1.data);
    } catch (error1) {
      console.log('❌ Error 1:', error1.response?.status, error1.response?.data);
    }

    // Test 2: Try with slideshowId only
    console.log('\n2️⃣ Testing with slideshowId only...');
    try {
      const response2 = await axios.post(`${baseURL}/activation-codes`, {
        slideshowId: 999, // Use a non-existent ID to test validation
        maxUses: 3,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Response 2:', response2.data);
    } catch (error2) {
      console.log('❌ Error 2:', error2.response?.status, error2.response?.data);
    }

    // Test 3: Try with both playlistId and slideshowId
    console.log('\n3️⃣ Testing with both playlistId and slideshowId...');
    try {
      const response3 = await axios.post(`${baseURL}/activation-codes`, {
        playlistId: 999,
        slideshowId: 999,
        maxUses: 3,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Response 3:', response3.data);
    } catch (error3) {
      console.log('❌ Error 3:', error3.response?.status, error3.response?.data);
    }

    // Test 4: Try with neither playlistId nor slideshowId
    console.log('\n4️⃣ Testing with neither playlistId nor slideshowId...');
    try {
      const response4 = await axios.post(`${baseURL}/activation-codes`, {
        maxUses: 3,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Response 4:', response4.data);
    } catch (error4) {
      console.log('❌ Error 4:', error4.response?.status, error4.response?.data);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugActivationEndpoint(); 