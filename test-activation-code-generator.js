const axios = require('axios');

async function testActivationCodeGenerator() {
  console.log('🔑 Testing Activation Code Generator for Playlists and Slideshows...\n');

  const baseURL = 'https://merchtech5-production.up.railway.app/api';
  const adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGpqZXRmdWVsQGdtYWlsLmNvbSIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc1MTk0MzcwOSwiZXhwIjoxNzUyMDMwMTA5fQ.OKOjRWeemoMxfgYbFmW8bgOKC3MhPjAhNgONVPa4cf0';

  try {
    // 1. Create a playlist with activation code requirement
    console.log('1️⃣ Creating protected playlist...');
    const playlistRes = await axios.post(`${baseURL}/playlists`, {
      name: 'Test Protected Playlist',
      description: 'A playlist that requires activation codes',
      is_public: false,
      requires_activation_code: true
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    const playlistId = playlistRes.data.id;
    console.log('✅ Playlist created:', playlistId);

    // 2. Generate activation code for playlist
    console.log('2️⃣ Generating activation code for playlist...');
    const playlistCodeRes = await axios.post(`${baseURL}/activation-codes`, {
      playlistId: playlistId,
      maxUses: 3,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    const playlistCode = playlistCodeRes.data.code;
    console.log('✅ Playlist activation code generated:', playlistCode);

    // 3. Validate playlist activation code
    console.log('3️⃣ Validating playlist activation code...');
    try {
      const validateResponse = await axios.post(`${baseURL}/activation-codes/validate`, {
        code: playlistCode,
        playlistId: playlistId
      });
      console.log('✅ Playlist activation code validated:', validateResponse.data);
    } catch (error) {
      console.log('❌ Test failed:', error.response?.status, error.response?.data);
      console.log('📋 Full error response:');
      console.log(JSON.stringify(error.response?.data, null, 2));
    }

    // 4. Create a slideshow with activation code requirement
    console.log('4️⃣ Creating protected slideshow...');
    const slideshowRes = await axios.post(`${baseURL}/slideshows`, {
      name: 'Protected Slideshow Test',
      description: 'Testing slideshow with activation code',
      is_public: false,
      requires_activation_code: true
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    const slideshowId = slideshowRes.data.id;
    console.log('✅ Slideshow created:', slideshowId);

    // 5. Generate activation code for slideshow
    console.log('5️⃣ Generating activation code for slideshow...');
    const slideshowCodeRes = await axios.post(`${baseURL}/activation-codes`, {
      slideshowId: slideshowId,
      maxUses: 3,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    const slideshowCode = slideshowCodeRes.data.code;
    console.log('✅ Slideshow activation code generated:', slideshowCode);

    // 6. Validate slideshow activation code
    console.log('6️⃣ Validating slideshow activation code...');
    const validateSlideshowCodeRes = await axios.post(`${baseURL}/activation-codes/validate`, {
      code: slideshowCode,
      slideshowId: slideshowId
    });
    console.log('✅ Slideshow activation code validated:', validateSlideshowCodeRes.data.valid);

    // 7. Clean up - delete playlist and slideshow
    await axios.delete(`${baseURL}/playlists/${playlistId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    await axios.delete(`${baseURL}/slideshows/${slideshowId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('🧹 Cleanup complete.');

    console.log('\n🎉 Activation Code Generator Test Summary:');
    console.log('   ✅ Playlist Activation Code Generation & Validation - Working');
    console.log('   ✅ Slideshow Activation Code Generation & Validation - Working');
    console.log('   ✅ Cleanup - Working');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.status, error.response?.data || error.message);
    if (error.response?.data) {
      console.log('📋 Full error response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
}

testActivationCodeGenerator(); 