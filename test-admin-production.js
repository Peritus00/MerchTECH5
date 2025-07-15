const axios = require('axios');

async function testWithAdminUser() {
  console.log('🔍 Testing with admin user djjetfuel@gmail.com...\n');
  
  const prodURL = 'https://merchtech5-production.up.railway.app/api';
  
  const adminCredentials = {
    email: 'djjetfuel@gmail.com',
    password: 'Gizmo321$'
  };
  
  try {
    console.log('🧪 Testing admin login...');
    const loginResponse = await axios.post(`${prodURL}/auth/login`, adminCredentials);
    console.log('✅ Admin login successful!');
    console.log('   User:', loginResponse.data.user?.username);
    console.log('   Is Admin:', loginResponse.data.user?.is_admin);
    console.log('   Token exists:', !!loginResponse.data.token);
    
    const token = loginResponse.data.token;
    
    // Test products endpoint
    console.log('\n🧪 Testing products endpoint...');
    const productsResponse = await axios.get(`${prodURL}/products`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Products endpoint working!');
    console.log('   Response type:', typeof productsResponse.data);
    console.log('   Has products array:', !!productsResponse.data.products);
    console.log('   Products found:', productsResponse.data.products?.length || 0);
    
    // Test slideshows endpoint
    console.log('\n🧪 Testing slideshows endpoint...');
    const slideshowsResponse = await axios.get(`${prodURL}/slideshows`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Slideshows endpoint working!');
    console.log('   Response type:', typeof slideshowsResponse.data);
    console.log('   Has slideshows array:', !!slideshowsResponse.data.slideshows);
    console.log('   Slideshows found:', slideshowsResponse.data.slideshows?.length || 0);
    
    // Test activation codes endpoint
    console.log('\n🧪 Testing activation codes endpoint...');
    const activationResponse = await axios.get(`${prodURL}/activation-codes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Activation codes endpoint working!');
    console.log('   Response type:', typeof activationResponse.data);
    console.log('   Has activationCodes array:', !!activationResponse.data.activationCodes);
    console.log('   Activation codes found:', activationResponse.data.activationCodes?.length || 0);
    
    // Test QR codes endpoint
    console.log('\n🧪 Testing QR codes endpoint...');
    const qrResponse = await axios.get(`${prodURL}/qr-codes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ QR codes endpoint working!');
    console.log('   Response type:', typeof qrResponse.data);
    console.log('   QR codes found:', qrResponse.data.qrCodes?.length || qrResponse.data.length || 0);
    
    console.log('\n🎉 ALL PRODUCTION APIs ARE WORKING WITH AUTHENTICATION!');
    console.log('\nThis means the issue is likely:');
    console.log('1. Users are not properly authenticated in the frontend');
    console.log('2. Authentication tokens are not being stored/retrieved correctly');
    console.log('3. Environment detection is not working correctly');
    console.log('4. Frontend is not using the correct production API URL');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.status, error.response?.data);
    console.error('Full error:', error.message);
  }
}

testWithAdminUser().catch(console.error); 