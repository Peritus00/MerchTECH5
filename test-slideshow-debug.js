// Test script to debug slideshow data flow
const axios = require('axios');

async function testSlideshowDataFlow() {
  console.log('🧪 Testing slideshow data flow...');
  
  try {
    // Step 1: Fetch slideshow data (like the frontend does)
    console.log('\n1️⃣ Fetching slideshow data from API...');
    const response = await axios.get('http://localhost:5001/api/slideshow-access/31');
    const slideshowData = response.data;
    
    console.log('✅ Raw slideshow data received:', {
      id: slideshowData.id,
      name: slideshowData.name,
      imagesCount: slideshowData.images?.length,
      audioUrl: slideshowData.audioUrl ? 'present' : 'missing'
    });
    
    // Step 2: Process images (like formattedMediaFiles does)
    console.log('\n2️⃣ Processing images...');
    if (!slideshowData.images) {
      console.log('❌ No images found in slideshow data');
      return;
    }
    
    const imageFiles = slideshowData.images.map((image, index) => {
      console.log(`   Processing image ${index + 1}:`, {
        id: image.id,
        url: image.url,
        caption: image.caption,
        title: image.title
      });
      
      return {
        id: image.id,
        title: image.caption || `Image ${index + 1}`,
        url: image.url,
        fileType: 'image',
        contentType: 'image/jpeg',
        type: 'image',
        duration: slideshowData.autoplayInterval || 5000,
      };
    });
    
    console.log('\n3️⃣ Final processed media files:', JSON.stringify(imageFiles, null, 2));
    
    // Step 3: Test image URLs
    console.log('\n4️⃣ Testing image URLs...');
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      try {
        const imageResponse = await axios.head(imageFile.url);
        console.log(`   ✅ Image ${i + 1} (${imageFile.url}): ${imageResponse.status} ${imageResponse.headers['content-type']}`);
      } catch (error) {
        console.log(`   ❌ Image ${i + 1} (${imageFile.url}): ${error.message}`);
      }
    }
    
    // Step 4: Simulate PreviewPlayer logic
    console.log('\n5️⃣ Simulating PreviewPlayer logic...');
    const currentTrack = 0;
    const currentMedia = imageFiles[currentTrack];
    
    console.log('Current media:', currentMedia);
    
    // Check media type flags
    const isVideo = currentMedia?.fileType === 'video' || currentMedia?.contentType?.startsWith('video/') || currentMedia?.type === 'video';
    const isAudio = currentMedia?.fileType === 'audio' || currentMedia?.contentType?.startsWith('audio/') || currentMedia?.type === 'audio';
    const isImage = currentMedia?.fileType === 'image' || currentMedia?.contentType?.startsWith('image/') || currentMedia?.type === 'image';
    const isSlideshow = imageFiles.length > 1 && imageFiles.some(file => 
      file.fileType === 'image' || file.contentType?.startsWith('image/') || file.type === 'image'
    );
    
    console.log('Media type flags:', {
      isVideo,
      isAudio, 
      isImage,
      isSlideshow,
      mediaFilesLength: imageFiles.length
    });
    
    console.log('\n🎯 CONCLUSION:');
    if (imageFiles.length > 0 && isImage && isSlideshow) {
      console.log('✅ Data processing looks correct - the issue is likely in the React component rendering');
    } else {
      console.log('❌ Data processing has issues');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSlideshowDataFlow(); 