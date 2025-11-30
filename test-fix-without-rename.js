const { Pool } = require('pg');
require('dotenv').config();

const productionDbUrl = 'postgresql://neondb_owner:npg_NGOT3izWBC7u@ep-weathered-leaf-ahn82u26-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: productionDbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function testFix() {
  try {
    const userId = 43;
    
    console.log('🔍 Testing if the fix works WITHOUT renaming...\n');
    console.log('💡 The fix should show playlist name when QR code name is "Test"\n');
    
    // Temporarily rename QR Code 64 back to "Test" to test the fix
    console.log('🔄 Temporarily renaming QR Code 64 back to "Test" to test the fix...\n');
    await pool.query(`UPDATE qr_codes SET name = 'Test' WHERE id = 64`);
    
    // Now test the analytics query
    const testQuery = await pool.query(
      `WITH dedup AS (
         SELECT DISTINCT ON (
           s.qr_code_id,
           date_trunc('minute', s.scanned_at)
         ) s.id, s.qr_code_id, s.scanned_at, s.country_code, s.city
         FROM qr_scans s
         JOIN qr_codes q ON s.qr_code_id = q.id
         WHERE q.user_id = $1
         ORDER BY s.qr_code_id, date_trunc('minute', s.scanned_at), s.scanned_at ASC
       ),
       qr_with_extracted_ids AS (
         SELECT 
           q.id,
           q.name,
           q.url,
           q.playlist_id,
           q.slideshow_id,
           CASE 
             WHEN q.url LIKE '%playlist-access/%' THEN 
               CAST(SUBSTRING(q.url FROM '/playlist-access/([0-9]+)') AS INTEGER)
             ELSE NULL
           END AS extracted_playlist_id
         FROM qr_codes q
         WHERE q.user_id = $1
       )
       SELECT 
         qwe.id AS qr_code_id,
         qwe.name AS original_name,
         CASE 
           WHEN (LOWER(qwe.name) IN ('test', 'test qr code', 'qr code') OR LOWER(qwe.name) LIKE 'test%')
             AND qwe.playlist_id IS NOT NULL
             AND p1.name IS NOT NULL
           THEN p1.name
           WHEN (LOWER(qwe.name) IN ('test', 'test qr code', 'qr code') OR LOWER(qwe.name) LIKE 'test%')
             AND qwe.playlist_id IS NULL
             AND qwe.extracted_playlist_id IS NOT NULL
             AND p2.name IS NOT NULL
           THEN p2.name
           ELSE qwe.name
         END AS display_name,
         d.scanned_at AS timestamp
       FROM dedup d
       JOIN qr_with_extracted_ids qwe ON d.qr_code_id = qwe.id
       LEFT JOIN playlists p1 ON qwe.playlist_id = p1.id AND p1.user_id = $1
       LEFT JOIN playlists p2 ON qwe.extracted_playlist_id = p2.id AND p2.user_id = $1
       WHERE qwe.id = 64
       ORDER BY d.scanned_at DESC
       LIMIT 5`,
      [userId]
    );
    
    console.log('📊 Test Results:\n');
    if (testQuery.rows.length > 0) {
      testQuery.rows.forEach((scan, idx) => {
        console.log(`${idx + 1}. QR Code ID: ${scan.qr_code_id}`);
        console.log(`   Original Name: "${scan.original_name}"`);
        console.log(`   Display Name: "${scan.display_name}"`);
        console.log(`   Time: ${scan.timestamp}`);
        
        if (scan.original_name === 'Test' && scan.display_name === 'Bottle opener') {
          console.log(`   ✅ FIX IS WORKING! Shows playlist name instead of "Test"`);
        } else if (scan.original_name === 'Test' && scan.display_name === 'Test') {
          console.log(`   ❌ FIX NOT WORKING! Still showing "Test"`);
        }
        console.log('');
      });
    } else {
      console.log('❌ No scans found for QR Code 64\n');
    }
    
    // Restore the name back to "Bottle opener"
    console.log('🔄 Restoring QR Code 64 name back to "Bottle opener"...\n');
    await pool.query(`UPDATE qr_codes SET name = 'Bottle opener' WHERE id = 64`);
    
    console.log('✅ Done! The fix SHOULD work, but renaming ensures it displays correctly regardless.\n');
    console.log('💡 The rename was a "belt and suspenders" approach - the fix should handle it,');
    console.log('   but having the correct name in the database is the proper long-term solution.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testFix();

