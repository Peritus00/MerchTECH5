// test-slideshow-audio-fix.js
const axios = require('axios');

/**
 * This script tests the slideshow audio functionality in production
 * to verify that our fixes are working correctly.
 */
async function testSlideshowAudio() {
  console.log('🎵 Testing Slideshow Audio Functionality in Production\n');
  
  const baseURL = 'https://merchtech5-production.up.railway.app/api';
  const frontendURL = 'https://app.merchtech.net';
  
  try {
    // Step 1: Get a valid auth token
    console.log('1️⃣ Authenticating...');
    const authResponse = await axios.post(`${baseURL}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });
    
    const token = authResponse.data.token;
    console.log('✅ Authentication successful');
    
    // Step 2: Get a list of slideshows
    console.log('\n2️⃣ Fetching slideshows...');
    const slideshowsResponse = await axios.get(`${baseURL}/slideshows`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!slideshowsResponse.data.slideshows || slideshowsResponse.data.slideshows.length === 0) {
      console.log('❌ No slideshows found');
      return;
    }
    
    console.log(`✅ Found ${slideshowsResponse.data.slideshows.length} slideshows`);
    
    // Step 3: Get details of the first slideshow
    const slideshowId = slideshowsResponse.data.slideshows[0].id;
    console.log(`\n3️⃣ Fetching details for slideshow ID: ${slideshowId}...`);
    
    const slideshowResponse = await axios.get(`${baseURL}/slideshows/${slideshowId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const slideshow = slideshowResponse.data.slideshow;
    console.log('✅ Slideshow details retrieved');
    
    // Step 4: Check if the slideshow has audio
    console.log('\n4️⃣ Checking slideshow audio...');
    if (!slideshow.audioUrl) {
      console.log('❌ Slideshow does not have audio');
    } else {
      console.log('✅ Slideshow has audio URL:', slideshow.audioUrl);
      
      // Step 5: Test audio streaming endpoint
      console.log('\n5️⃣ Testing audio streaming endpoint...');
      try {
        const audioStreamResponse = await axios.get(`${baseURL}/slideshows/${slideshowId}/audio/stream`, {
          headers: { 'Authorization': `Bearer ${token}` },
          responseType: 'stream'
        });
        
        console.log('✅ Audio streaming endpoint working:', {
          status: audioStreamResponse.status,
          contentType: audioStreamResponse.headers['content-type']
        });
      } catch (error) {
        console.log('❌ Audio streaming endpoint failed:', error.response?.status, error.response?.data);
        console.log('💡 You may need to implement this endpoint in your server');
      }
    }
    
    // Step 6: Check if the slideshow has images
    console.log('\n6️⃣ Checking slideshow images...');
    if (!slideshow.images || slideshow.images.length === 0) {
      console.log('❌ Slideshow does not have images');
    } else {
      console.log(`✅ Slideshow has ${slideshow.images.length} images`);
      
      // Step 7: Test image streaming endpoint for the first image
      const firstImage = slideshow.images[0];
      console.log('\n7️⃣ Testing image streaming endpoint...');
      try {
        const imageStreamResponse = await axios.get(`${baseURL}/slideshow-images/${firstImage.id}/stream`, {
          headers: { 'Authorization': `Bearer ${token}` },
          responseType: 'stream'
        });
        
        console.log('✅ Image streaming endpoint working:', {
          status: imageStreamResponse.status,
          contentType: imageStreamResponse.headers['content-type']
        });
      } catch (error) {
        console.log('❌ Image streaming endpoint failed:', error.response?.status, error.response?.data);
        console.log('💡 You may need to implement this endpoint in your server');
      }
    }
    
    // Step 8: Generate test URLs
    console.log('\n8️⃣ Generating test URLs...');
    console.log(`📱 Slideshow URL: ${frontendURL}/media-player/${slideshowId}?type=slideshow`);
    
    console.log('\n🎉 Test Complete!');
    console.log('If you need to implement streaming endpoints, check the server code for missing routes.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.status, error.response?.data || error.message);
  }
}

testSlideshowAudio();