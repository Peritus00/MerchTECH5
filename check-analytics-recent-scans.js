const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkAnalytics() {
  try {
    const userId = 43; // DJKINGCAKE
    
    console.log('🔍 Testing the analytics query for recent scans...\n');
    
    // Test the CURRENT query (before my fix)
    console.log('📊 CURRENT QUERY (before fix):\n');
    const currentQuery = await pool.query(
      `WITH dedup AS (
         SELECT DISTINCT ON (
           s.qr_code_id,
           date_trunc('minute', s.scanned_at)
         ) s.id, s.qr_code_id, s.scanned_at, s.country_code, s.city
         FROM qr_scans s
         JOIN qr_codes q ON s.qr_code_id = q.id
         WHERE q.user_id = $1
         ORDER BY s.qr_code_id, date_trunc('minute', s.scanned_at), s.scanned_at ASC
       )
       SELECT q.id AS qr_code_id,
              q.name AS qr_name,
              d.country_code AS country_code,
              d.city AS city,
              d.scanned_at AS timestamp
       FROM dedup d
       JOIN qr_codes q ON d.qr_code_id = q.id
       ORDER BY d.scanned_at DESC
       LIMIT 10`,
      [userId]
    );
    
    console.log(`Found ${currentQuery.rows.length} recent scans:\n`);
    currentQuery.rows.forEach((scan, idx) => {
      console.log(`${idx + 1}. Time: ${scan.timestamp}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   QR Name: "${scan.qr_name}"`);
      console.log('');
    });
    
    // Test the NEW query (with my fix)
    console.log('\n📊 NEW QUERY (with fix - showing playlist name for generic QR names):\n');
    const newQuery = await pool.query(
      `WITH dedup AS (
         SELECT DISTINCT ON (
           s.qr_code_id,
           date_trunc('minute', s.scanned_at)
         ) s.id, s.qr_code_id, s.scanned_at, s.country_code, s.city
         FROM qr_scans s
         JOIN qr_codes q ON s.qr_code_id = q.id
         WHERE q.user_id = $1
         ORDER BY s.qr_code_id, date_trunc('minute', s.scanned_at), s.scanned_at ASC
       )
       SELECT 
         q.id AS qr_code_id,
         CASE 
           WHEN (LOWER(q.name) IN ('test', 'test qr code', 'qr code') OR LOWER(q.name) LIKE 'test%')
             AND q.playlist_id IS NOT NULL
             AND p.name IS NOT NULL
           THEN p.name
           WHEN (LOWER(q.name) IN ('test', 'test qr code', 'qr code') OR LOWER(q.name) LIKE 'test%')
             AND q.slideshow_id IS NOT NULL
             AND sh.name IS NOT NULL
           THEN sh.name
           ELSE q.name
         END AS qr_name,
         q.name AS original_qr_name,
         q.playlist_id,
         p.name AS playlist_name,
         d.country_code AS country_code,
         d.city AS city,
         d.scanned_at AS timestamp
       FROM dedup d
       JOIN qr_codes q ON d.qr_code_id = q.id
       LEFT JOIN playlists p ON q.playlist_id = p.id AND p.user_id = $1
       LEFT JOIN slideshows sh ON q.slideshow_id = sh.id AND sh.user_id = $1
       ORDER BY d.scanned_at DESC
       LIMIT 10`,
      [userId]
    );
    
    console.log(`Found ${newQuery.rows.length} recent scans:\n`);
    newQuery.rows.forEach((scan, idx) => {
      console.log(`${idx + 1}. Time: ${scan.timestamp}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   Original QR Name: "${scan.original_qr_name}"`);
      console.log(`   Display QR Name: "${scan.qr_name}"`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      console.log(`   Playlist Name: ${scan.playlist_name || 'null'}`);
      console.log('');
    });
    
    // Check if there are any QR codes that point to playlist-access URLs but don't have playlist_id set
    console.log('\n🔍 QR codes pointing to playlist-access URLs without playlist_id set:\n');
    const qrsWithoutPlaylistId = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        CASE 
          WHEN q.url LIKE '%playlist-access/%' THEN 
            CAST(SUBSTRING(q.url FROM '/playlist-access/([0-9]+)') AS INTEGER)
          ELSE NULL
        END AS extracted_playlist_id,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      WHERE q.user_id = $1
        AND q.url LIKE '%playlist-access/%'
        AND q.playlist_id IS NULL
      GROUP BY q.id, q.name, q.url, q.playlist_id
      ORDER BY q.created_at DESC
      LIMIT 10
    `, [userId]);
    
    console.log(`Found ${qrsWithoutPlaylistId.rows.length} QR codes:\n`);
    qrsWithoutPlaylistId.rows.forEach((qr, idx) => {
      console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}"`);
      console.log(`   URL: ${qr.url}`);
      console.log(`   Playlist ID (set): ${qr.playlist_id || 'null'}`);
      console.log(`   Playlist ID (from URL): ${qr.extracted_playlist_id || 'null'}`);
      console.log(`   Scans: ${qr.scan_count}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkAnalytics();

