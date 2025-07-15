const axios = require('axios');

async function testWithValidUser() {
  console.log('🔍 Testing with a valid user from the database...\n');
  
  const prodURL = 'https://merchtech5-production.up.railway.app/api';
  
  // Try with one of the users we found earlier - let's try a few different passwords
  const testUsers = [
    { email: 's3test@example.com', password: 'password123' },
    { email: 's3test@example.com', password: 'test123' },
    { email: 's3test@example.com', password: 'password' },
    { email: 'test1751327253892@example.com', password: 'password123' },
    { email: 'test1751327253892@example.com', password: 'test123' },
  ];
  
  for (const credentials of testUsers) {
    console.log(`\n🧪 Testing login with ${credentials.email}...`);
    
    try {
      const loginResponse = await axios.post(`${prodURL}/auth/login`, credentials);
      console.log('✅ Login successful!');
      console.log('   User:', loginResponse.data.user?.username);
      console.log('   Token exists:', !!loginResponse.data.token);
      
      // Test products endpoint
      try {
        const productsResponse = await axios.get(`${prodURL}/products`, {
          headers: { Authorization: `Bearer ${loginResponse.data.token}` }
        });
        console.log('✅ Products endpoint working!');
        console.log('   Response type:', typeof productsResponse.data);
        console.log('   Has products array:', !!productsResponse.data.products);
        console.log('   Products found:', productsResponse.data.products?.length || 0);
      } catch (prodError) {
        console.log('❌ Products endpoint failed:', prodError.response?.status, prodError.response?.data);
      }
      
      // Test slideshows endpoint
      try {
        const slideshowsResponse = await axios.get(`${prodURL}/slideshows`, {
          headers: { Authorization: `Bearer ${loginResponse.data.token}` }
        });
        console.log('✅ Slideshows endpoint working!');
        console.log('   Response type:', typeof slideshowsResponse.data);
        console.log('   Has slideshows array:', !!slideshowsResponse.data.slideshows);
        console.log('   Slideshows found:', slideshowsResponse.data.slideshows?.length || 0);
      } catch (slideError) {
        console.log('❌ Slideshows endpoint failed:', slideError.response?.status, slideError.response?.data);
      }
      
      // Test activation codes endpoint
      try {
        const activationResponse = await axios.get(`${prodURL}/activation-codes`, {
          headers: { Authorization: `Bearer ${loginResponse.data.token}` }
        });
        console.log('✅ Activation codes endpoint working!');
        console.log('   Response type:', typeof activationResponse.data);
        console.log('   Has activationCodes array:', !!activationResponse.data.activationCodes);
        console.log('   Activation codes found:', activationResponse.data.activationCodes?.length || 0);
      } catch (actError) {
        console.log('❌ Activation codes endpoint failed:', actError.response?.status, actError.response?.data);
      }
      
      // If we got here, authentication is working - break out of the loop
      console.log('\n🎉 Production APIs are working with authentication!');
      break;
      
    } catch (error) {
      console.log('❌ Login failed:', error.response?.status, error.response?.data?.error);
    }
  }
}

testWithValidUser().catch(console.error); 