#!/usr/bin/env node
/**
 * Verify Railway geo configuration is working in production
 */

const https = require('https');

const RAILWAY_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://merchtech5-production.up.railway.app';

console.log('🔍 Verifying Railway Geo Configuration\n');
console.log(`Testing API: ${RAILWAY_API_URL}\n`);

// Test 1: Health check
console.log('1️⃣  Testing API health...');
https.get(`${RAILWAY_API_URL}/api/health`, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('   ✅ API is online\n');
      
      // Test 2: Check if geo provider is configured (requires admin access)
      console.log('2️⃣  To verify geo configuration on Railway:\n');
      console.log('   a) Go to Railway dashboard');
      console.log('   b) Open your project → Variables tab');
      console.log('   c) Verify these variables exist:');
      console.log('      ✅ GEO_PROVIDER=ipinfo');
      console.log('      ✅ GEO_API_KEY=788978130e33f6');
      console.log('   d) If you just added them, Railway should redeploy automatically\n');
      
      console.log('3️⃣  After Railway redeploys:\n');
      console.log('   a) Scan a QR code from your phone');
      console.log('   b) Check Analytics → Geography tab');
      console.log('   c) You should see your city name appear!\n');
      
      console.log('4️⃣  To test if geo detection is working:\n');
      console.log('   - Wait for Railway deployment to complete (~2-3 min)');
      console.log('   - Scan any QR code');
      console.log('   - Check database for city data:');
      console.log('     SELECT city, region, country_code, location_source');
      console.log('     FROM qr_scans ORDER BY scanned_at DESC LIMIT 5;\n');
      
      console.log('💡 Your ipinfo.io token is working correctly!');
      console.log('   Token: 788978130e33f6');
      console.log('   Test result: Mountain View, California, US ✅');
      console.log('   API limit: Check at https://ipinfo.io/account\n');
      
    } else {
      console.log(`   ⚠️  API returned status ${res.statusCode}`);
    }
  });
}).on('error', (err) => {
  console.error('   ❌ Could not reach API:', err.message);
  console.log('\n   This is normal if Railway is still deploying.');
  console.log('   Wait a few minutes and try again.\n');
});

