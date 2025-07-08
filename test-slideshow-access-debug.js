const axios = require('axios');

async function testSlideshowAccessDebug() {
  console.log('🔍 Debugging Slideshow Access...\n');

  const baseURL = 'https://merchtech5-production.up.railway.app/api';
  const adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGpqZXRmdWVsQGdtYWlsLmNvbSIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc1MTk0MzcwOSwiZXhwIjoxNzUyMDMwMTA5fQ.OKOjRWeemoMxfgYbFmW8bgOKC3MhPjAhNgONVPa4cf0';

  try {
    // First, let's get the slideshow details to see what we're working with
    console.log('1️⃣ Getting slideshow details...');
    const slideshowResponse = await axios.get(`${baseURL}/slideshows/13`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Slideshow details:');
    console.log(`   ID: ${slideshowResponse.data.slideshow.id}`);
    console.log(`   Name: ${slideshowResponse.data.slideshow.name}`);
    console.log(`   Requires Activation: ${slideshowResponse.data.slideshow.requires_activation_code}`);
    console.log(`   Is Public: ${slideshowResponse.data.slideshow.is_public}\n`);

    // Test slideshow access with activation code
    console.log('2️⃣ Testing slideshow access with activation code...');
    const accessResponse = await axios.get(`${baseURL}/slideshow-access/13`, {
      params: { activationCode: 'ACCESS-T3Q5P9DOIBS' }
    });

    console.log('✅ Slideshow access successful:');
    console.log(`   Slideshow ID: ${accessResponse.data.slideshow.id}`);
    console.log(`   Name: ${accessResponse.data.slideshow.name}`);
    console.log(`   Images Count: ${accessResponse.data.slideshow.images.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    
    if (error.response?.data) {
      console.log('📋 Full error response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
}

testSlideshowAccessDebug(); 