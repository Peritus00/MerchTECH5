const { Pool } = require('pg');
require('dotenv').config();

const productionDbUrl = 'postgresql://neondb_owner:npg_NGOT3izWBC7u@ep-weathered-leaf-ahn82u26-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: productionDbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function verifyQuery() {
  try {
    const userId = 43;
    
    console.log('🔍 Verifying the exact recent scans query used by the dashboard...\n');
    
    // This is the EXACT query from the code (for recent scans, not the main analytics)
    const recentScansQuery = await pool.query(
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
       LIMIT 10`,
      [userId]
    );
    
    console.log(`📊 Recent scans query returned ${recentScansQuery.rows.length} scans:\n`);
    if (recentScansQuery.rows.length === 0) {
      console.log('❌ NO SCANS RETURNED! This explains why nothing shows.\n');
    } else {
      recentScansQuery.rows.forEach((scan, idx) => {
        const timeAgo = Math.floor((Date.now() - new Date(scan.timestamp).getTime()) / 1000 / 60);
        console.log(`${idx + 1}. Time: ${scan.timestamp} (${timeAgo} minutes ago)`);
        console.log(`   QR Code ID: ${scan.qr_code_id}`);
        console.log(`   QR Name: "${scan.qr_name}"`);
        console.log(`   Location: ${scan.city || scan.country_code || 'Unknown'}`);
        console.log('');
      });
    }
    
    // Check the two most recent scans specifically
    console.log('🔍 Checking the two most recent scans (331 and 330):\n');
    const specificScans = await pool.query(
      `SELECT 
        s.id,
        s.scanned_at,
        s.qr_code_id,
        q.name as qr_name,
        q.playlist_id
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE s.id IN (331, 330)
        AND q.user_id = $1
      ORDER BY s.scanned_at DESC`,
      [userId]
    );
    
    console.log(`Found ${specificScans.rows.length} of the two scans:\n`);
    specificScans.rows.forEach((scan, idx) => {
      console.log(`${idx + 1}. Scan ID: ${scan.id}`);
      console.log(`   Time: ${scan.scanned_at}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   QR Name: "${scan.qr_name}"`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
  } finally {
    await pool.end();
  }
}

verifyQuery();

