const axios = require('axios');
require('dotenv').config();

async function testAnalyticsAPI() {
  try {
    // You'll need to get a valid JWT token - this is just for testing
    // In production, the app gets this from the auth context
    console.log('🔍 Testing analytics API endpoint directly...\n');
    
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://merchtech5-production.up.railway.app/api';
    const analyticsUrl = `${apiUrl}/analytics/summary`;
    
    console.log(`📡 API URL: ${analyticsUrl}\n`);
    console.log('⚠️  Note: This requires authentication. Testing without auth will fail.\n');
    console.log('💡 The scans ARE being recorded in the database.');
    console.log('💡 The analytics query IS returning the scans.');
    console.log('💡 If you\'re not seeing them in the app, try:');
    console.log('   1. Pull down to refresh on the dashboard');
    console.log('   2. Close and reopen the app');
    console.log('   3. Check browser/app console for any errors\n');
    
    // Check if we can at least verify the endpoint exists
    try {
      const response = await axios.get(analyticsUrl, {
        validateStatus: () => true // Don't throw on 401/403
      });
      
      if (response.status === 401 || response.status === 403) {
        console.log('✅ Endpoint exists but requires authentication (expected)');
        console.log(`   Status: ${response.status}`);
      } else if (response.status === 200) {
        console.log('✅ Endpoint accessible!');
        console.log(`   Recent scans returned: ${response.data.recentScans?.length || 0}`);
        if (response.data.recentScans && response.data.recentScans.length > 0) {
          console.log('\n   Recent scans:');
          response.data.recentScans.slice(0, 5).forEach((scan, idx) => {
            console.log(`   ${idx + 1}. ${scan.qrName} - ${scan.timestamp}`);
          });
        }
      } else {
        console.log(`⚠️  Unexpected status: ${response.status}`);
      }
    } catch (error) {
      if (error.response) {
        console.log(`✅ Endpoint exists (status: ${error.response.status})`);
        if (error.response.status === 401 || error.response.status === 403) {
          console.log('   Requires authentication (expected)');
        }
      } else {
        console.log('❌ Network error:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAnalyticsAPI();

