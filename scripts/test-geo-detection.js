#!/usr/bin/env node
/**
 * Test geo detection with geoip-lite
 */

const geoip = require('geoip-lite');

console.log('🌍 Testing Geo Detection\n');

// Test various IPs
const testIPs = [
  { ip: '8.8.8.8', desc: 'Google DNS (US)' },
  { ip: '1.1.1.1', desc: 'Cloudflare (US)' },
  { ip: '87.250.250.242', desc: 'Yandex (Russia)' },
  { ip: '203.0.113.1', desc: 'Test IP (Reserved)' },
  { ip: '104.28.0.1', desc: 'Cloudflare Edge' },
];

console.log('Testing geoip-lite lookups:');
console.log('─'.repeat(80));

testIPs.forEach(({ ip, desc }) => {
  const geo = geoip.lookup(ip);
  if (geo) {
    console.log(`✅ ${desc.padEnd(30)} ${ip.padEnd(15)}`);
    console.log(`   Country: ${geo.country || 'Unknown'}`);
    console.log(`   Region: ${geo.region || 'Unknown'}`);
    console.log(`   City: ${geo.city || 'Unknown'}`);
    console.log(`   Timezone: ${geo.timezone || 'Unknown'}`);
    console.log(`   Coordinates: ${geo.ll ? `${geo.ll[0]}, ${geo.ll[1]}` : 'Unknown'}`);
  } else {
    console.log(`❌ ${desc.padEnd(30)} ${ip.padEnd(15)} - No geo data`);
  }
  console.log('');
});

console.log('─'.repeat(80));

// Test with localhost/private IPs
console.log('\n🔒 Testing private/local IPs (should return null):');
const privateIPs = ['127.0.0.1', '192.168.1.1', '10.0.0.1', '::1'];
privateIPs.forEach(ip => {
  const geo = geoip.lookup(ip);
  const status = geo ? '⚠️  Unexpected result' : '✅ Correctly returned null';
  console.log(`  ${status} for ${ip}`);
});

console.log('\n✅ Geo detection test complete!');
console.log('\nNote: geoip-lite uses local database - no API calls required.');
console.log('For reverse geocoding (lat/lng to city), configure GEOCODER_PROVIDER in .env');

