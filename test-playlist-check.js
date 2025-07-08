const axios = require('axios');

async function checkPlaylistCreation() {
  console.log('🔍 Checking Playlist Creation with Activation Code...\n');

  const baseURL = 'https://merchtech5-production.up.railway.app/api';
  const adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGpqZXRmdWVsQGdtYWlsLmNvbSIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc1MTk0MzcwOSwiZXhwIjoxNzUyMDMwMTA5fQ.OKOjRWeemoMxfgYbFmW8bgOKC3MhPjAhNgONVPa4cf0';

  try {
    // Create a playlist with activation code requirement
    console.log('1️⃣ Creating playlist with requires_activation_code: true...');
    const createResponse = await axios.post(`${baseURL}/playlists`, {
      name: 'Test Protected Playlist',
      description: 'A playlist that requires activation codes',
      is_public: false,
      requires_activation_code: true
    }, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    const playlist = createResponse.data;
    console.log('✅ Playlist created:', {
      id: playlist.id,
      name: playlist.name,
      requires_activation_code: playlist.requires_activation_code,
      is_public: playlist.is_public
    });

    // Check if the playlist was saved correctly
    console.log('\n2️⃣ Checking playlist data...');
    const getResponse = await axios.get(`${baseURL}/playlists/${playlist.id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    const retrievedPlaylist = getResponse.data.playlist;
    console.log('✅ Retrieved playlist:', {
      id: retrievedPlaylist.id,
      name: retrievedPlaylist.name,
      requires_activation_code: retrievedPlaylist.requires_activation_code,
      requiresActivationCode: retrievedPlaylist.requiresActivationCode,
      is_public: retrievedPlaylist.is_public,
      isPublic: retrievedPlaylist.isPublic
    });

    // Clean up
    console.log('\n3️⃣ Cleaning up...');
    await axios.delete(`${baseURL}/playlists/${playlist.id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('✅ Playlist deleted');

  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data);
  }
}

checkPlaylistCreation(); 