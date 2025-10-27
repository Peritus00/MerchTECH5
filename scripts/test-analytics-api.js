#!/usr/bin/env node
/**
 * Test the analytics API endpoint to verify topCities data
 */

require('dotenv').config();
const { Pool } = require('pg');

async function testAnalyticsAPI() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🧪 Testing Analytics API (Server-side Query)\n');

    // Get a user ID to test with
    const userResult = await pool.query('SELECT id, email FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('❌ No users found - create a user first');
      return;
    }

    const userId = userResult.rows[0].id;
    const userEmail = userResult.rows[0].email;
    console.log(`📊 Testing analytics for user: ${userEmail} (ID: ${userId})\n`);

    // Simulate the analytics summary query from main.js
    const rangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const hasQrFilter = false;

    // Top cities query (exact match from main.js lines 908-924)
    console.log('1️⃣  Testing Top Cities Query:');
    const citiesRes = await pool.query(
      `SELECT 
        COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown') AS city,
        COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), '') AS region,
        COALESCE(s.country_name, s.country_code, '') AS country_code,
        SUM(CASE WHEN s.location_source = 'user' THEN 1 ELSE 0 END) AS user_provided_count,
        COUNT(*) AS count
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
        AND s.scanned_at >= $2
        ${hasQrFilter ? 'AND s.qr_code_id = $3' : ''}
      GROUP BY 
        COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown'),
        COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), ''),
        COALESCE(s.country_name, s.country_code, '')
      ORDER BY count DESC
      LIMIT 10`,
      hasQrFilter ? [userId, rangeStart, null] : [userId, rangeStart]
    );

    console.log(`   Found ${citiesRes.rows.length} cities\n`);
    
    if (citiesRes.rows.length > 0) {
      console.log('   Top Cities:');
      console.log('   ' + '─'.repeat(70));
      citiesRes.rows.forEach((row, idx) => {
        const location = `${row.city}${row.region ? ', ' + row.region : ''}${row.country_code ? ' • ' + row.country_code : ''}`;
        const userProvided = row.user_provided_count > 0 ? ` (${row.user_provided_count} user-provided)` : '';
        console.log(`   ${(idx + 1).toString().padStart(2)}. ${location.padEnd(40)} ${row.count} scans${userProvided}`);
      });
      console.log('   ' + '─'.repeat(70));
      
      // Format as it would appear in API response
      const topCities = citiesRes.rows.map(r => ({ 
        city: r.city, 
        region: r.region, 
        country: r.country_code, 
        count: parseInt(r.count),
        userProvidedCount: parseInt(r.user_provided_count || 0)
      }));
      
      console.log('\n   API Response Format:');
      console.log('   ```json');
      console.log('   "topCities": ' + JSON.stringify(topCities, null, 4).replace(/\n/g, '\n   '));
      console.log('   ```');
    } else {
      console.log('   ⚠️  No city data found');
      console.log('   This means:');
      console.log('   - No QR codes have been scanned yet, OR');
      console.log('   - Scans don\'t have city data (need geo detection configured)');
    }

    // Check scan data
    console.log('\n2️⃣  Checking Recent Scans:');
    const recentScans = await pool.query(`
      SELECT 
        s.id,
        s.city,
        s.region,
        s.country_code,
        s.user_provided_city,
        s.user_provided_state,
        s.location_source,
        s.scanned_at,
        q.name as qr_name
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `, [userId]);

    console.log(`   Found ${recentScans.rows.length} recent scans\n`);
    
    if (recentScans.rows.length > 0) {
      console.log('   Recent Scans:');
      console.log('   ' + '─'.repeat(80));
      recentScans.rows.forEach(scan => {
        const city = scan.user_provided_city || scan.city || 'Unknown';
        const region = scan.user_provided_state || scan.region || '';
        const location = `${city}${region ? ', ' + region : ''}`;
        const source = scan.location_source || 'unknown';
        const date = new Date(scan.scanned_at).toLocaleString();
        console.log(`   ${scan.id.toString().padStart(4)}: ${location.padEnd(30)} [${source.padEnd(7)}] ${date}`);
      });
      console.log('   ' + '─'.repeat(80));

      // Analyze sources
      const sources = recentScans.rows.reduce((acc, scan) => {
        const source = scan.location_source || 'unknown';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});

      console.log('\n   Location Sources:');
      Object.entries(sources).forEach(([source, count]) => {
        console.log(`     ${source}: ${count} scans`);
      });
    } else {
      console.log('   ⚠️  No scans found for this user');
      console.log('   Create and scan a QR code to see city data');
    }

    // Check if geo provider is configured
    console.log('\n3️⃣  Geo Provider Configuration:');
    console.log(`   GEO_PROVIDER: ${process.env.GEO_PROVIDER || '❌ Not set (using geoip-lite fallback)'}`);
    console.log(`   GEO_API_KEY: ${process.env.GEO_API_KEY ? '✅ Configured' : '❌ Not set'}`);
    
    if (!process.env.GEO_PROVIDER) {
      console.log('\n   💡 To get city-level data, configure a geo provider in Railway:');
      console.log('      GEO_PROVIDER=ipinfo');
      console.log('      GEO_API_KEY=<your-api-key>');
      console.log('   Get free API key: https://ipinfo.io/signup');
    }

    console.log('\n✅ Analytics API test complete!');

  } catch (error) {
    console.error('❌ Test error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testAnalyticsAPI();

