/**
 * Test script to verify play tracking is working
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

async function testPlayTracking() {
  try {
    console.log('🧪 Testing Play Tracking System\n');
    console.log(`API URL: ${API_URL}\n`);

    // Test 1: Check if tracking endpoint exists
    console.log('1️⃣ Testing /api/analytics/track-media-play endpoint...');
    try {
      const testPayload = {
        mediaId: 1,
        playDuration: 30,
        sessionId: 'test-session-' + Date.now(),
        userId: null
      };

      const response = await axios.post(
        `${API_URL}/api/analytics/track-media-play`,
        testPayload
      );

      console.log('   ✅ Tracking endpoint responded:', response.data);
      console.log('   Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      if (error.response) {
        console.log('   ❌ Error:', error.response.status, error.response.data);
      } else {
        console.log('   ❌ Error:', error.message);
      }
    }

    // Test 2: Check current play stats
    console.log('\n2️⃣ Checking current play stats...');
    try {
      const statsResponse = await axios.get(`${API_URL}/api/analytics/play-stats?userId=43`);
      console.log('   Current stats:', JSON.stringify(statsResponse.data, null, 2));
    } catch (error) {
      console.log('   ❌ Error fetching stats:', error.message);
    }

    // Test 3: Check if media_plays table is accessible
    console.log('\n3️⃣ Recommendations:');
    console.log('   - Play some media for 30+ seconds to generate tracking data');
    console.log('   - Check browser console for tracking logs');
    console.log('   - Verify MediaPlayer component is calling trackMediaPlay()');
    console.log('   - Check if sessionId is being generated correctly');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testPlayTracking();

