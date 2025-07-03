const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

// ---------- CONFIG ----------
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001/api';
const TEST_EMAIL = process.env.TEST_EMAIL || 'djjetfuel@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Kerrie321';
const TEST_IMAGE_PATH = process.env.TEST_IMAGE || path.join(__dirname, '../assets/images/icon.png');

async function main() {
  console.log('🧪 Slideshow Image Uploader Integration Test');
  console.log('===========================================\n');
  console.log('API_BASE_URL:', API_BASE_URL);

  // 1. Login
  console.log('🔑 Logging in as', TEST_EMAIL, '...');
  const loginResp = await axios.post(`${API_BASE_URL}/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  const token = loginResp.data.token;
  console.log('✅ Login successful, user id', loginResp.data.user.id, '\n');

  const authHeader = { Authorization: `Bearer ${token}` };

  // 2. Create slideshow
  console.log('🎬 Creating test slideshow ...');
  const slideResp = await axios.post(
    `${API_BASE_URL}/slideshows`,
    {
      name: 'Uploader Test ' + Date.now(),
      description: 'Integration test slideshow',
      autoplayInterval: 5000,
      transition: 'fade',
    },
    { headers: authHeader }
  );
  const slideshow = slideResp.data.slideshow;
  console.log('✅ Slideshow created with id', slideshow.id, '\n');

  // 3. Upload image
  console.log('🖼️ Uploading image ...');
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    throw new Error('Test image not found at ' + TEST_IMAGE_PATH);
  }
  const form = new FormData();
  form.append('file', fs.createReadStream(TEST_IMAGE_PATH));
  const uploadResp = await axios.post(`${API_BASE_URL}/upload`, form, {
    headers: {
      ...form.getHeaders(),
      ...authHeader,
    },
  });
  const fileUrl = uploadResp.data.fileUrl;
  console.log('✅ Image uploaded:', fileUrl, '\n');

  // 4. Attach image to slideshow
  console.log('🔗 Attaching image to slideshow ...');
  await axios.post(
    `${API_BASE_URL}/slideshows/${slideshow.id}/images`,
    {
      imageUrl: fileUrl,
      displayOrder: 1,
    },
    { headers: authHeader }
  );
  console.log('✅ Image attached to slideshow\n');

  // 5. Fetch slideshow to verify
  console.log('🔍 Fetching slideshow to verify ...');
  const verifyResp = await axios.get(`${API_BASE_URL}/slideshows/${slideshow.id}`, { headers: authHeader });
  const images = verifyResp.data.slideshow.images;
  if (images.length > 0 && images[0].imageUrl === fileUrl) {
    console.log('🎉 Test PASSED: Slideshow contains uploaded image.');
  } else {
    console.error('❌ Test FAILED: Uploaded image not found in slideshow response');
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('❌ Test failed with error:', err.response?.data || err.message);
  process.exitCode = 1;
}); 