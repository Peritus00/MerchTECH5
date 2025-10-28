#!/usr/bin/env node
/**
 * Test ipinfo.io API token
 */

const https = require('https');

const TOKEN = process.env.GEO_API_KEY || '788978130e33f6';
const TEST_IP = '8.8.8.8';

console.log('🧪 Testing ipinfo.io API Token\n');
console.log(`Token: ${TOKEN}`);
console.log(`Test IP: ${TEST_IP}\n`);

const url = `https://ipinfo.io/${TEST_IP}?token=${TOKEN}`;

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    console.log('\nResponse Data:');
    console.log('─'.repeat(60));
    
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
      
      console.log('\n─'.repeat(60));
      
      if (res.statusCode === 200 && json.city) {
        console.log('\n✅ API token is working!');
        console.log(`   IP: ${json.ip}`);
        console.log(`   City: ${json.city}`);
        console.log(`   Region: ${json.region}`);
        console.log(`   Country: ${json.country}`);
        console.log(`   Location: ${json.loc}`);
        console.log(`   Timezone: ${json.timezone}`);
        
        console.log('\n📋 For Railway, set these environment variables:');
        console.log('   GEO_PROVIDER=ipinfo');
        console.log('   GEO_API_KEY=788978130e33f6');
        
        console.log('\n✅ Your token has city-level data access!');
      } else if (res.statusCode === 429) {
        console.log('\n⚠️  Rate limit exceeded');
        console.log('   Wait a bit and try again, or check your quota at ipinfo.io');
      } else if (res.statusCode === 401) {
        console.log('\n❌ Invalid API token');
        console.log('   Check your token at https://ipinfo.io/account');
      } else {
        console.log('\n⚠️  Unexpected response');
      }
    } catch (e) {
      console.log(data);
      console.log('\n❌ Failed to parse response:', e.message);
    }
  });
}).on('error', (err) => {
  console.error('❌ Request failed:', err.message);
});

