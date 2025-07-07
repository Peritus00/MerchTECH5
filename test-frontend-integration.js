#!/usr/bin/env node

/**
 * Frontend Integration Test
 * Tests the connection between frontend and Railway backend
 */

const axios = require('axios');

const RAILWAY_BACKEND_URL = 'https://merchtech5-production.up.railway.app/api';

console.log('🧪 Testing Frontend Integration with Railway Backend');
console.log('==================================================');
console.log(`Backend URL: ${RAILWAY_BACKEND_URL}`);
console.log('');

async function testBackendConnection() {
  try {
    console.log('1️⃣ Testing Health Endpoint...');
    const healthResponse = await axios.get(`${RAILWAY_BACKEND_URL}/health`);
    console.log('✅ Health check successful:', healthResponse.data);
    
    console.log('\n2️⃣ Testing Public Products Endpoint...');
    const productsResponse = await axios.get(`${RAILWAY_BACKEND_URL}/products/all`);
    console.log('✅ Products endpoint working:', productsResponse.data.length, 'products found');
    
    console.log('\n3️⃣ Testing Registration Endpoint...');
    const timestamp = Date.now();
    const testEmail = `integrationtest${timestamp}@example.com`;
    const testUsername = `integrationtest${timestamp}`;
    const registerResponse = await axios.post(`${RAILWAY_BACKEND_URL}/auth/register`, {
      email: testEmail,
      password: 'testpass123',
      username: testUsername
    });
    console.log('✅ Registration successful:', registerResponse.data);
    
    console.log('\n4️⃣ Testing Login Endpoint...');
    const loginResponse = await axios.post(`${RAILWAY_BACKEND_URL}/auth/login`, {
      email: testEmail,
      password: 'testpass123'
    });
    console.log('✅ Login successful, token received');
    
    const token = loginResponse.data.token;
    
    console.log('\n5️⃣ Testing Authenticated Media Endpoint...');
    const mediaResponse = await axios.get(`${RAILWAY_BACKEND_URL}/media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Media endpoint working:', mediaResponse.data.length, 'media files found');
    
    console.log('\n6️⃣ Testing Products Endpoint (Authenticated)...');
    const userProductsResponse = await axios.get(`${RAILWAY_BACKEND_URL}/products`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ User products endpoint working:', userProductsResponse.data.length, 'products found');
    
    console.log('\n7️⃣ Testing Playlists Endpoint...');
    const playlistsResponse = await axios.get(`${RAILWAY_BACKEND_URL}/playlists`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Playlists endpoint working:', playlistsResponse.data.length, 'playlists found');
    
    console.log('\n8️⃣ Testing QR Codes Endpoint...');
    const qrCodesResponse = await axios.get(`${RAILWAY_BACKEND_URL}/qr-codes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ QR codes endpoint working:', qrCodesResponse.data.length, 'QR codes found');
    
    console.log('\n8️⃣ Testing Slideshows Endpoint...');
    const slideshowsResponse = await axios.get(`${RAILWAY_BACKEND_URL}/slideshows`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Slideshows endpoint working:', slideshowsResponse.data.length, 'slideshows found');
    
    console.log('\n9️⃣ Testing Activation Codes Endpoint...');
    const activationCodesResponse = await axios.get(`${RAILWAY_BACKEND_URL}/activation-codes/generated`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Activation codes endpoint working:', activationCodesResponse.data.length, 'codes found');
    
    console.log('\n🎉 ALL TESTS PASSED! Frontend integration is ready!');
    console.log('\n📱 Your frontend can now connect to the Railway backend at:');
    console.log(`   ${RAILWAY_BACKEND_URL}`);
    console.log('\n🔧 Environment Configuration:');
    console.log('   - Production API URL: https://merchtech5-production.up.railway.app/api');
    console.log('   - Development API URL: http://localhost:5001/api (or EXPO_PUBLIC_API_URL)');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testBackendConnection(); 