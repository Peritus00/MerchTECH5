const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001/api';
const TEST_EMAIL = process.env.TEST_EMAIL || 'djjetfuel@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Kerrie321';
const TEST_IMAGE_PATH = path.join(__dirname, '../assets/images/icon.png');

(async () => {
  const login = await axios.post(`${API_BASE_URL}/auth/login`, { email: TEST_EMAIL, password: TEST_PASSWORD });
  const token = login.data.token;
  const auth = { Authorization: `Bearer ${token}` };
  const slide = await axios.post(`${API_BASE_URL}/slideshows`, { name: 'DelTest', description: 'del', autoplayInterval: 3000 }, { headers: auth });
  const slideshowId = slide.data.slideshow.id;
  const form = new FormData();
  form.append('file', fs.createReadStream(TEST_IMAGE_PATH));
  const up = await axios.post(`${API_BASE_URL}/upload`, form, { headers: { ...form.getHeaders(), ...auth } });
  const fileUrl = up.data.fileUrl;
  const add = await axios.post(`${API_BASE_URL}/slideshows/${slideshowId}/images`, { imageUrl: fileUrl }, { headers: auth });
  const imgId = add.data.slideshow.images[0].id;
  console.log('Image added id', imgId);
  const del = await axios.delete(`${API_BASE_URL}/slideshows/${slideshowId}/images/${imgId}`, { headers: auth });
  console.log('Delete response images length', del.data.slideshow.images.length);
})(); 