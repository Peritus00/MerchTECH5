const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkAnalyticsTestIssue() {
  try {
    // Get user ID
    const userRes = await pool.query(
      "SELECT id FROM users WHERE email = 'djjetfuel@gmail.com' OR email = 'DJKINGCAKE@GMAIL.COM'"
    );
    
    if (userRes.rows.length === 0) {
      console.log('❌ User not found\n');
      return;
    }
    
    const userId = userRes.rows[0].id;
    console.log(`✅ Found user ID: ${userId}\n`);
    
    // Run the exact analytics query that the dashboard uses
    console.log('📊 Running analytics query (what dashboard shows):\n');
    
    const analyticsQuery = await pool.query(
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
           END AS extracted_playlist_id,
           CASE 
             WHEN q.url LIKE '%slideshow-access/%' THEN 
               CAST(SUBSTRING(q.url FROM '/slideshow-access/([0-9]+)') AS INTEGER)
             ELSE NULL
           END AS extracted_slideshow_id
         FROM qr_codes q
         WHERE q.user_id = $1
       )
       SELECT 
         qwe.id AS qr_code_id,
         qwe.name AS original_qr_name,
         qwe.playlist_id,
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
           WHEN (LOWER(qwe.name) IN ('test', 'test qr code', 'qr code') OR LOWER(qwe.name) LIKE 'test%')
             AND qwe.slideshow_id IS NOT NULL
             AND sh1.name IS NOT NULL
           THEN sh1.name
           WHEN (LOWER(qwe.name) IN ('test', 'test qr code', 'qr code') OR LOWER(qwe.name) LIKE 'test%')
             AND qwe.slideshow_id IS NULL
             AND qwe.extracted_slideshow_id IS NOT NULL
             AND sh2.name IS NOT NULL
           THEN sh2.name
           ELSE qwe.name
         END AS qr_name,
         p1.name AS playlist_name,
         d.country_code AS country_code,
         d.city AS city,
         d.scanned_at AS timestamp
       FROM dedup d
       JOIN qr_with_extracted_ids qwe ON d.qr_code_id = qwe.id
       LEFT JOIN playlists p1 ON qwe.playlist_id = p1.id AND p1.user_id = $1
       LEFT JOIN playlists p2 ON qwe.extracted_playlist_id = p2.id AND p2.user_id = $1
       LEFT JOIN slideshows sh1 ON qwe.slideshow_id = sh1.id AND sh1.user_id = $1
       LEFT JOIN slideshows sh2 ON qwe.extracted_slideshow_id = sh2.id AND sh2.user_id = $1
       ORDER BY d.scanned_at DESC
       LIMIT 20`,
      [userId]
    );
    
    console.log(`Found ${analyticsQuery.rows.length} recent scans:\n`);
    analyticsQuery.rows.forEach((scan, idx) => {
      const showsTest = scan.qr_name?.toLowerCase().includes('test') || scan.original_qr_name?.toLowerCase().includes('test');
      console.log(`${idx + 1}. Time: ${scan.timestamp}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   Original QR Name: "${scan.original_qr_name}"`);
      console.log(`   Display QR Name: "${scan.qr_name}"`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      console.log(`   Playlist Name: ${scan.playlist_name || 'null'}`);
      if (showsTest) {
        console.log(`   ⚠️  WARNING: Still showing "Test"!`);
      }
      console.log('');
    });
    
    // Check if any QR codes still have "Test" in the name
    const testQRs = await pool.query(`
      SELECT id, name, description, playlist_id
      FROM qr_codes
      WHERE user_id = $1
        AND (LOWER(name) LIKE '%test%' OR LOWER(description) LIKE '%test%')
    `, [userId]);
    
    if (testQRs.rows.length > 0) {
      console.log('⚠️  QR codes with "Test" in name or description:\n');
      testQRs.rows.forEach((qr, idx) => {
        console.log(`   ${idx + 1}. ID ${qr.id}: "${qr.name}"`);
        console.log(`      Description: "${qr.description || '(none)'}"`);
        console.log(`      Playlist ID: ${qr.playlist_id || 'null'}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkAnalyticsTestIssue();

