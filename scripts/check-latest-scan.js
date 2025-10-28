#!/usr/bin/env node
/**
 * Check the most recent scan for city data
 */

require('dotenv').config();
const { Pool } = require('pg');

async function checkLatestScan() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Checking Latest QR Code Scan\n');

    const result = await pool.query(`
      SELECT 
        s.id,
        s.city,
        s.region,
        s.country_code,
        s.country_name,
        s.user_provided_city,
        s.location_source,
        s.device_type,
        s.browser_name,
        s.scanned_at,
        q.name as qr_name
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      ORDER BY s.scanned_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('❌ No scans found');
      await pool.end();
      return;
    }

    const scan = result.rows[0];
    const timeSince = Math.round((Date.now() - new Date(scan.scanned_at).getTime()) / 1000);
    const timeStr = timeSince < 60 ? `${timeSince}s ago` : `${Math.round(timeSince/60)}m ago`;

    console.log(`📱 QR Code: ${scan.qr_name}`);
    console.log(`⏰ Scanned: ${timeStr}`);
    console.log(`📱 Device: ${scan.device_type} (${scan.browser_name})`);
    console.log('');

    // Check if city data was captured
    const city = scan.user_provided_city || scan.city;
    const region = scan.user_provided_state || scan.region;
    
    if (city && city !== '') {
      console.log('✅ SUCCESS! City data captured:');
      console.log(`   📍 ${city}${region ? ', ' + region : ''} ${scan.country_code || ''}`);
      console.log(`   Source: ${scan.location_source}`);
      console.log('');
      console.log('🎉 ipinfo.io is working! Your city will now appear in analytics!');
    } else if (scan.country_code) {
      console.log('⚠️  Only country detected:');
      console.log(`   📍 Country: ${scan.country_code}`);
      console.log(`   City: Not detected`);
      console.log('');
      console.log('This means:');
      console.log('   • Railway may still be deploying with new env vars');
      console.log('   • This scan happened before the redeploy');
      console.log('');
      console.log('💡 Wait ~3-4 minutes for Railway to finish deploying,');
      console.log('   then scan again and run this script.');
    } else {
      console.log('❌ No location data captured');
      console.log('');
      console.log('Check:');
      console.log('   1. Railway deployment finished');
      console.log('   2. GEO_PROVIDER and GEO_API_KEY are set');
      console.log('   3. Server logs for geo detection errors');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
  }
}

checkLatestScan();

