#!/usr/bin/env node
/**
 * Test complete geo detection flow including database writes
 */

require('dotenv').config();
const { Pool } = require('pg');
const geoip = require('geoip-lite');

async function testGeoFlow() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🧪 Testing Complete Geo Detection Flow\n');

    // 1. Test geoip-lite
    console.log('1️⃣  Testing geoip-lite fallback:');
    const testIP = '8.8.8.8';
    const geoData = geoip.lookup(testIP);
    console.log(`   IP: ${testIP}`);
    console.log(`   Result: ${JSON.stringify(geoData, null, 2)}`);
    console.log(`   ${geoData ? '✅' : '❌'} geoip-lite working\n`);

    // 2. Check if external geo provider is configured
    console.log('2️⃣  Checking external geo provider configuration:');
    const hasProvider = !!process.env.GEO_PROVIDER;
    const hasKey = !!process.env.GEO_API_KEY;
    console.log(`   GEO_PROVIDER: ${process.env.GEO_PROVIDER || '❌ Not configured'}`);
    console.log(`   GEO_API_KEY: ${hasKey ? '✅ Configured' : '❌ Not configured'}`);
    
    if (!hasProvider || !hasKey) {
      console.log(`\n   ⚠️  No external provider configured - will use geoip-lite fallback`);
      console.log(`   💡 To get city-level data, add to Railway env vars:`);
      console.log(`      GEO_PROVIDER=ipinfo`);
      console.log(`      GEO_API_KEY=<your-api-key>`);
      console.log(`   📝 Or sign up at: https://ipinfo.io/signup (50k requests/month free)\n`);
    } else {
      console.log(`   ✅ External provider configured\n`);
    }

    // 3. Check database schema
    console.log('3️⃣  Verifying database schema:');
    const schemaCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'qr_scans' 
        AND column_name IN ('city', 'region', 'visitor_id', 'location_source', 
                            'user_provided_city', 'geo_lat', 'geo_lng')
      ORDER BY column_name
    `);
    
    const columns = schemaCheck.rows.map(r => r.column_name);
    const required = ['city', 'region', 'visitor_id', 'location_source'];
    
    required.forEach(col => {
      const exists = columns.includes(col);
      console.log(`   ${exists ? '✅' : '❌'} ${col}`);
    });

    if (columns.length < required.length) {
      console.log('\n   ❌ Missing required columns! Run: node scripts/run-missing-migrations.js');
      return;
    }

    // 4. Test database write with geo data
    console.log('\n4️⃣  Testing database write with geo data:');
    
    // Get a test QR code
    const qrResult = await pool.query('SELECT id FROM qr_codes LIMIT 1');
    if (qrResult.rows.length === 0) {
      console.log('   ⚠️  No QR codes found - create one first to test scans');
      return;
    }

    const qrCodeId = qrResult.rows[0].id;
    console.log(`   Using QR code ID: ${qrCodeId}`);

    // Insert a test scan with geo data
    const { v4: uuidv4 } = require('uuid');
    const visitorIdUUID = uuidv4();
    const visitorIdString = visitorIdUUID.toString();
    
    const insertResult = await pool.query(`
      INSERT INTO qr_scans (
        qr_code_id, scanned_at, device_type, browser_name, operating_system,
        country_code, country_name, region, city, 
        visitor_id, qr_visitor_id, location_source
      ) VALUES (
        $1, NOW(), 'mobile', 'Test Browser', 'Test OS',
        'US', 'United States', 'California', 'San Francisco',
        $2::uuid, $3, 'auto'
      )
      RETURNING id, city, region, country_code, location_source
    `, [qrCodeId, visitorIdUUID, visitorIdString]);

    if (insertResult.rows.length > 0) {
      console.log(`   ✅ Successfully inserted test scan:`);
      console.log(`      ID: ${insertResult.rows[0].id}`);
      console.log(`      Location: ${insertResult.rows[0].city}, ${insertResult.rows[0].region} ${insertResult.rows[0].country_code}`);
      console.log(`      Source: ${insertResult.rows[0].location_source}`);
    }

    // 5. Test analytics query (matches production analytics query)
    console.log('\n5️⃣  Testing analytics query for cities:');
    const analyticsResult = await pool.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown') AS city,
        COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), '') AS region,
        COALESCE(s.country_name, s.country_code, '') AS country_code,
        SUM(CASE WHEN s.location_source = 'user' THEN 1 ELSE 0 END) AS user_provided_count,
        COUNT(*) AS count
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE (s.city IS NOT NULL AND s.city != '') 
         OR (s.user_provided_city IS NOT NULL AND s.user_provided_city != '')
      GROUP BY 
        COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown'),
        COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), ''),
        COALESCE(s.country_name, s.country_code, '')
      ORDER BY count DESC
      LIMIT 5
    `);

    if (analyticsResult.rows.length > 0) {
      console.log(`   ✅ Found ${analyticsResult.rows.length} cities in analytics:`);
      analyticsResult.rows.forEach(row => {
        console.log(`      ${row.city}${row.region ? ', ' + row.region : ''} ${row.country_code}: ${row.count} scans`);
      });
    } else {
      console.log(`   ⚠️  No city data found in scans yet`);
      console.log(`      This will populate after QR codes are scanned with geo detection`);
    }

    console.log('\n✅ Geo flow test complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. For production: Add GEO_PROVIDER and GEO_API_KEY to Railway');
    console.log('   2. Test by scanning a QR code');
    console.log('   3. Check analytics page for city data');

  } catch (error) {
    console.error('❌ Test error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testGeoFlow();

