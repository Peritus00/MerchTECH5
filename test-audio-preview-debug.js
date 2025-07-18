const axios = require('axios');

// Test script to debug audio preview issues
async function testAudioUrls() {
  console.log('🔍 Testing audio URLs from playlist 30...');
  
  const baseUrl = 'http://localhost:5001';
  
  try {
    // Get playlist data
    const playlistResponse = await axios.get(`${baseUrl}/api/playlists/30`);
    const playlist = playlistResponse.data.playlist;
    
    console.log('📋 Playlist:', playlist.name);
    console.log('📋 Media files:', playlist.mediaFiles.length);
    
    // Test each media file
    for (const media of playlist.mediaFiles) {
      console.log(`\n🎵 Testing media ${media.id}: ${media.title}`);
      console.log(`   File type: ${media.fileType}`);
      console.log(`   Content type: ${media.contentType}`);
      console.log(`   URL: ${media.url}`);
      
      try {
        // Test HEAD request
        const headResponse = await axios.head(media.url);
        console.log(`   ✅ HEAD request successful:`, {
          status: headResponse.status,
          contentType: headResponse.headers['content-type'],
          contentLength: headResponse.headers['content-length'],
          acceptRanges: headResponse.headers['accept-ranges']
        });
        
        // Test partial GET request (first 1KB)
        const partialResponse = await axios.get(media.url, {
          headers: { 'Range': 'bytes=0-1023' },
          responseType: 'arraybuffer'
        });
        console.log(`   ✅ Partial GET request successful:`, {
          status: partialResponse.status,
          contentType: partialResponse.headers['content-type'],
          contentLength: partialResponse.headers['content-length'],
          dataLength: partialResponse.data.byteLength
        });
        
        // Check if it's a valid audio file by examining the header
        const buffer = Buffer.from(partialResponse.data);
        const header = buffer.toString('hex', 0, 4);
        console.log(`   🔍 File header: ${header}`);
        
        // Common audio file signatures
        const audioSignatures = {
          'fff3': 'MP3 (MPEG-1 Layer 3)',
          'fff2': 'MP3 (MPEG-2 Layer 3)',
          '4944': 'MP3 with ID3 tag',
          '5249': 'WAV (RIFF)',
          '6674': 'MP4/M4A'
        };
        
        if (audioSignatures[header]) {
          console.log(`   ✅ Valid audio file detected: ${audioSignatures[header]}`);
        } else {
          console.log(`   ⚠️  Unknown file format, header: ${header}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Request failed:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testAudioUrls().catch(console.error); 