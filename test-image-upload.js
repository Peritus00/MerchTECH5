const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testImageUpload() {
  console.log('🖼️ Testing Image Upload...\n');

  const baseURL = 'https://merchtech5-production.up.railway.app/api';
  const adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGpqZXRmdWVsQGdtYWlsLmNvbSIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc1MTk0MzcwOSwiZXhwIjoxNzUyMDMwMTA5fQ.OKOjRWeemoMxfgYbFmW8bgOKC3MhPjAhNgONVPa4cf0';

  try {
    // First, create a slideshow
    console.log('1️⃣ Creating slideshow for image upload test...');
    const slideshowResponse = await axios.post(`${baseURL}/slideshows`, {
      name: 'Image Upload Test Slideshow',
      description: 'Testing image upload functionality',
      is_public: true
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Slideshow created:', slideshowResponse.data.id);
    const slideshowId = slideshowResponse.data.id;

    // Test image upload
    console.log('2️⃣ Testing image upload...');
    
    // Create a simple test image (1x1 pixel PNG)
    const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    const formData = new FormData();
    formData.append('image', testImageBuffer, {
      filename: 'test-image.png',
      contentType: 'image/png'
    });
    formData.append('caption', 'Test image for slideshow');
    formData.append('position', '1');

    const uploadResponse = await axios.post(`${baseURL}/slideshows/${slideshowId}/images`, formData, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        ...formData.getHeaders()
      }
    });

    console.log('✅ Image uploaded successfully:');
    console.log(`   Image ID: ${uploadResponse.data.image.id}`);
    console.log(`   URL: ${uploadResponse.data.image.url}`);
    console.log(`   Caption: ${uploadResponse.data.image.caption}\n`);

    const imageId = uploadResponse.data.image.id;

    // Test image deletion
    console.log('3️⃣ Testing image deletion...');
    const deleteResponse = await axios.delete(`${baseURL}/slideshows/${slideshowId}/images/${imageId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Image deleted successfully:', deleteResponse.data.message);

    // Clean up - delete the test slideshow
    console.log('4️⃣ Cleaning up test slideshow...');
    await axios.delete(`${baseURL}/slideshows/${slideshowId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Test slideshow deleted\n');

    console.log('🎉 Image Upload Test Summary:');
    console.log('   ✅ Slideshow Creation - Working');
    console.log('   ✅ Image Upload - Working');
    console.log('   ✅ Image Deletion - Working');
    console.log('   ✅ Cleanup - Working');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.status, error.response?.data || error.message);
    
    if (error.response?.data) {
      console.log('📋 Full error response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
}

testImageUpload(); 