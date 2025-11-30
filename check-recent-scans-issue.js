const { Pool } = require('pg');
require('dotenv').config();

const productionDbUrl = 'postgresql://neondb_owner:npg_NGOT3izWBC7u@ep-weathered-leaf-ahn82u26-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: productionDbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function checkRecentScans() {
  try {
    const userId = 43; // DJKINGCAKE
    
    console.log('🔍 Checking recent scans and analytics query...\n');
    
    // Get the most recent scans from the database
    console.log('📊 Most recent scans in database (last 10):\n');
    const recentScans = await pool.query(
      `SELECT 
        s.id as scan_id,
        s.scanned_at,
        s.qr_code_id,
        q.name as qr_name,
        q.url as qr_url,
        q.user_id as qr_user_id,
        q.playlist_id
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      ORDER BY s.scanned_at DESC
      LIMIT 10`
    );
    
    console.log(`Found ${recentScans.rows.length} recent scans:\n`);
    recentScans.rows.forEach((scan, idx) => {
      const isUser43 = scan.qr_user_id === userId;
      console.log(`${idx + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   Time: ${scan.scanned_at}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   QR Name: "${scan.qr_name}"`);
      console.log(`   QR URL: ${scan.qr_url?.substring(0, 60)}...`);
      console.log(`   User ID: ${scan.qr_user_id}${isUser43 ? ' ✅ (DJKINGCAKE)' : ''}`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      console.log('');
    });
    
    // Test the analytics query that the dashboard uses
    console.log('📊 Testing analytics query (what dashboard sees):\n');
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
    
    console.log(`Analytics query returned ${analyticsQuery.rows.length} scans:\n`);
    if (analyticsQuery.rows.length === 0) {
      console.log('❌ NO SCANS RETURNED BY ANALYTICS QUERY!\n');
      console.log('This explains why nothing shows in recent activity.\n');
    } else {
      analyticsQuery.rows.forEach((scan, idx) => {
        console.log(`${idx + 1}. Time: ${scan.timestamp}`);
        console.log(`   QR Code ID: ${scan.qr_code_id}`);
        console.log(`   QR Name: "${scan.qr_name}"`);
        console.log(`   Location: ${scan.city || scan.country_code || 'Unknown'}`);
        console.log('');
      });
    }
    
    // Check if there are any scans for user 43 that aren't being returned
    console.log('📊 Checking all scans for user 43:\n');
    const allUserScans = await pool.query(
      `SELECT 
        s.id,
        s.scanned_at,
        s.qr_code_id,
        q.name as qr_name
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
      ORDER BY s.scanned_at DESC
      LIMIT 20`,
      [userId]
    );
    
    console.log(`Total scans for user 43: ${allUserScans.rows.length}\n`);
    if (allUserScans.rows.length > 0) {
      console.log('Most recent scans:\n');
      allUserScans.rows.slice(0, 5).forEach((scan, idx) => {
        console.log(`${idx + 1}. Scan ID: ${scan.id}, Time: ${scan.scanned_at}, QR: "${scan.qr_name}"`);
      });
    }
    
    // Check the time difference
    const now = new Date();
    console.log(`\n⏰ Current time: ${now.toISOString()}`);
    if (allUserScans.rows.length > 0) {
      const latestScan = new Date(allUserScans.rows[0].scanned_at);
      const diffMinutes = Math.floor((now - latestScan) / 1000 / 60);
      console.log(`   Latest scan: ${latestScan.toISOString()}`);
      console.log(`   Time difference: ${diffMinutes} minutes ago`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
  } finally {
    await pool.end();
  }
}

checkRecentScans();

