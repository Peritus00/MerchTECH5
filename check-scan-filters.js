const { Pool } = require('pg');
require('dotenv').config();

const productionDbUrl = 'postgresql://neondb_owner:npg_NGOT3izWBC7u@ep-weathered-leaf-ahn82u26-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: productionDbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function checkFilters() {
  try {
    const userId = 43;
    
    console.log('🔍 Checking if location filters are excluding scans...\n');
    
    // Check the most recent scans and their location data
    const recentScans = await pool.query(
      `SELECT 
        s.id,
        s.scanned_at,
        s.qr_code_id,
        s.city,
        s.user_provided_city,
        s.country_code,
        s.location_source,
        q.name as qr_name
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
      ORDER BY s.scanned_at DESC
      LIMIT 10`,
      [userId]
    );
    
    console.log(`📊 Most recent ${recentScans.rows.length} scans:\n`);
    recentScans.rows.forEach((scan, idx) => {
      const hasLocation = scan.city || scan.user_provided_city || (scan.country_code && scan.location_source);
      const wouldBeExcluded = !hasLocation;
      console.log(`${idx + 1}. Scan ID: ${scan.id}`);
      console.log(`   Time: ${scan.scanned_at}`);
      console.log(`   QR: "${scan.qr_name}"`);
      console.log(`   City: ${scan.city || scan.user_provided_city || 'null'}`);
      console.log(`   Country: ${scan.country_code || 'null'}`);
      console.log(`   Location Source: ${scan.location_source || 'null'}`);
      console.log(`   Has Location: ${hasLocation ? 'YES ✅' : 'NO ❌'}`);
      console.log(`   Would be excluded by filter: ${wouldBeExcluded ? 'YES ⚠️' : 'NO ✅'}`);
      console.log('');
    });
    
    // Count scans with and without location
    const stats = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN s.city IS NOT NULL OR s.user_provided_city IS NOT NULL OR (s.country_code IS NOT NULL AND s.location_source IS NOT NULL) THEN 1 END) as with_location,
        COUNT(CASE WHEN NOT (s.city IS NOT NULL OR s.user_provided_city IS NOT NULL OR (s.country_code IS NOT NULL AND s.location_source IS NOT NULL)) THEN 1 END) as without_location
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
        AND s.scanned_at >= NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    
    if (stats.rows.length > 0) {
      const s = stats.rows[0];
      console.log(`📊 Scans in last 24 hours:`);
      console.log(`   Total: ${s.total}`);
      console.log(`   With location: ${s.with_location} ✅`);
      console.log(`   Without location: ${s.without_location} ${s.without_location > 0 ? '⚠️ (EXCLUDED)' : ''}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkFilters();

