#!/usr/bin/env node
/**
 * Test what IP Railway can detect
 */

const https = require('https');

console.log('🔍 Testing Railway IP Detection\n');
console.log('Making request to your Railway API...\n');

const url = 'https://merchtech5-production.up.railway.app/api/admin/geo-debug';

// We need an auth token, but let's try without first to see if endpoint exists
https.get(url, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  if (res.statusCode === 401 || res.statusCode === 403) {
    console.log('\n✅ Endpoint exists (needs auth)');
    console.log('\n📋 To check Railway IP detection:');
    console.log('   1. Get admin JWT token from your app');
    console.log('   2. Run:');
    console.log('      curl https://merchtech5-production.up.railway.app/api/admin/geo-debug \\');
    console.log('        -H "Authorization: Bearer YOUR_TOKEN"');
    console.log('\n   This will show what headers Railway provides');
  } else {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('\nRailway Headers:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('\nResponse:', data);
      }
    });
  }
}).on('error', (err) => {
  console.error('❌ Error:', err.message);
});

