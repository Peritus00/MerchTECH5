#!/usr/bin/env node
/**
 * Debug why geo detection isn't returning city data
 */

const https = require('https');

console.log('🔍 Debugging Geo Detection Logic\n');

// Simulate what happens when Railway headers provide country but no city
console.log('1️⃣  Simulating Railway header detection:\n');

const mockHeaders = {
  'cf-ipcountry': 'US',           // Cloudflare provides country
  'x-vercel-ip-city': undefined,  // But no city
  'x-vercel-ip-country': 'US'
};

console.log('   Headers from Railway/Cloudflare:');
console.log(`   - Country: ${mockHeaders['cf-ipcountry'] || 'None'}`);
console.log(`   - City: ${mockHeaders['x-vercel-ip-city'] || 'None'}`);
console.log('');

// This is what inferGeo returns
const fromHeaders = {
  countryCode: 'US',
  region: null,
  city: null
};

console.log('   inferGeo() returns:', fromHeaders);
console.log('');

// Check the bug in resolveGeo
console.log('2️⃣  Checking resolveGeo() logic:\n');
console.log('   Current code (BUGGY):');
console.log('   if (fromHeaders.countryCode || fromHeaders.city || fromHeaders.region) {');
console.log('     return fromHeaders;  // Returns early!');
console.log('   }');
console.log('');
console.log('   ❌ PROBLEM: Returns { countryCode: "US", city: null, region: null }');
console.log('   ❌ Never calls ipinfo.io API because it found countryCode!');
console.log('');

console.log('3️⃣  The Fix:\n');
console.log('   Should check if city/region exist, not just country:');
console.log('   if (fromHeaders.city || fromHeaders.region) {');
console.log('     return fromHeaders;');
console.log('   }');
console.log('   // Now continues to ipinfo.io API when no city found');
console.log('');

// Test if ipinfo API is accessible
console.log('4️⃣  Testing ipinfo.io API accessibility:\n');

const testIP = '8.8.8.8';
const token = '788978130e33f6';
const url = `https://ipinfo.io/${testIP}?token=${token}`;

https.get(url, (res) => {
  if (res.statusCode === 200) {
    console.log('   ✅ ipinfo.io API is accessible and working');
    console.log('   ✅ Token is valid');
    console.log('');
    console.log('🎯 ROOT CAUSE IDENTIFIED:');
    console.log('   Railway provides country code in headers');
    console.log('   → resolveGeo() returns early with just country');
    console.log('   → Never calls ipinfo.io for city data');
    console.log('   → Result: country_code="US", city=null');
    console.log('');
    console.log('✅ SOLUTION:');
    console.log('   Fix the condition in resolveGeo() to only return early');
    console.log('   if headers actually contain city/region data.');
  } else {
    console.log('   ⚠️  ipinfo.io returned status:', res.statusCode);
  }
}).on('error', (err) => {
  console.error('   ❌ Cannot reach ipinfo.io:', err.message);
});

