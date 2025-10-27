#!/usr/bin/env node
/**
 * Verify test data is in the database and visible in analytics
 */

require('dotenv').config();
const { Pool } = require('pg');

async function verifyTestData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Verifying Test Data\n');

    // Find scans with city data
    console.log('1️⃣  All scans with city data:');
    const scansWithCity = await pool.query(`
      SELECT 
        s.id,
        s.qr_code_id,
        s.city,
        s.region,
        s.country_code,
        s.location_source,
        q.name as qr_name,
        q.user_id,
        u.email as owner_email,
        s.scanned_at
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      JOIN users u ON q.user_id = u.id
      WHERE s.city IS NOT NULL AND s.city != ''
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `);

    if (scansWithCity.rows.length > 0) {
      console.log(`   Found ${scansWithCity.rows.length} scans with city data:\n`);
      scansWithCity.rows.forEach(scan => {
        console.log(`   Scan ID: ${scan.id}`);
        console.log(`     QR Code: ${scan.qr_name} (ID: ${scan.qr_code_id})`);
        console.log(`     Owner: ${scan.owner_email} (User ID: ${scan.user_id})`);
        console.log(`     Location: ${scan.city}, ${scan.region} ${scan.country_code}`);
        console.log(`     Source: ${scan.location_source}`);
        console.log(`     Scanned: ${new Date(scan.scanned_at).toLocaleString()}`);
        console.log('');
      });

      // For each unique user, show their analytics
      const users = [...new Set(scansWithCity.rows.map(s => s.user_id))];
      
      for (const userId of users) {
        const userEmail = scansWithCity.rows.find(s => s.user_id === userId).owner_email;
        console.log(`\n2️⃣  Analytics for ${userEmail} (User ID: ${userId}):`);
        
        const rangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const citiesForUser = await pool.query(`
          SELECT 
            COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown') AS city,
            COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), '') AS region,
            COALESCE(s.country_name, s.country_code, '') AS country_code,
            SUM(CASE WHEN s.location_source = 'user' THEN 1 ELSE 0 END) AS user_provided_count,
            COUNT(*) AS count
          FROM qr_scans s
          JOIN qr_codes q ON s.qr_code_id = q.id
          WHERE q.user_id = $1
            AND s.scanned_at >= $2
          GROUP BY 
            COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown'),
            COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), ''),
            COALESCE(s.country_name, s.country_code, '')
          ORDER BY count DESC
          LIMIT 10
        `, [userId, rangeStart]);

        if (citiesForUser.rows.length > 0) {
          console.log(`   Top Cities:`);
          citiesForUser.rows.forEach((city, idx) => {
            const location = `${city.city}${city.region ? ', ' + city.region : ''}${city.country_code ? ' • ' + city.country_code : ''}`;
            console.log(`     ${idx + 1}. ${location}: ${city.count} scans`);
          });
        } else {
          console.log('   ⚠️  No city data in analytics (query issue?)');
        }
      }
    } else {
      console.log('   ❌ No scans with city data found');
      console.log('\n   Creating test scan...');
      
      // Find first QR code
      const qrResult = await pool.query('SELECT id, name, user_id FROM qr_codes LIMIT 1');
      if (qrResult.rows.length === 0) {
        console.log('   ❌ No QR codes found - create one first');
        return;
      }

      const qr = qrResult.rows[0];
      const { v4: uuidv4 } = require('uuid');
      const visitorId = uuidv4();

      await pool.query(`
        INSERT INTO qr_scans (
          qr_code_id, scanned_at, device_type, browser_name, operating_system,
          country_code, country_name, region, city, 
          visitor_id, qr_visitor_id, location_source
        ) VALUES (
          $1, NOW(), 'mobile', 'Test Browser', 'Test OS',
          'US', 'United States', 'California', 'Los Angeles',
          $2::uuid, $3, 'auto'
        )
      `, [qr.id, visitorId, visitorId.toString()]);

      console.log(`   ✅ Created test scan for QR "${qr.name}" (User ID: ${qr.user_id})`);
      console.log('   Run this script again to see the results');
    }

    console.log('\n✅ Verification complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

verifyTestData();

