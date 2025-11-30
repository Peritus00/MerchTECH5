const { Pool } = require('pg');
require('dotenv').config();

const productionDbUrl = 'postgresql://neondb_owner:npg_NGOT3izWBC7u@ep-weathered-leaf-ahn82u26-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: productionDbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function checkQR64() {
  try {
    const userId = 43;
    
    console.log('🔍 Checking QR Code ID 64 and why it shows "Test" instead of "Bottle opener"...\n');
    
    // Get QR Code 64 details
    const qr64 = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.user_id,
        q.created_at,
        q.is_active
      FROM qr_codes q
      WHERE q.id = 64`
    );
    
    if (qr64.rows.length === 0) {
      console.log('❌ QR Code ID 64 not found\n');
      await pool.end();
      return;
    }
    
    const qr = qr64.rows[0];
    console.log('📱 QR Code ID 64 Details:');
    console.log(`   Name: "${qr.name}"`);
    console.log(`   URL: ${qr.url}`);
    console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
    console.log(`   User ID: ${qr.user_id}`);
    console.log(`   Active: ${qr.is_active}`);
    console.log(`   Created: ${qr.created_at}\n`);
    
    // Check playlist 43
    if (qr.playlist_id) {
      const playlist = await pool.query(
        `SELECT id, name, user_id FROM playlists WHERE id = $1`,
        [qr.playlist_id]
      );
      
      if (playlist.rows.length > 0) {
        console.log('📋 Playlist Details:');
        console.log(`   ID: ${playlist.rows[0].id}`);
        console.log(`   Name: "${playlist.rows[0].name}"`);
        console.log(`   User ID: ${playlist.rows[0].user_id}\n`);
      }
    }
    
    // Test the analytics query logic
    console.log('🔍 Testing analytics query logic for QR Code 64:\n');
    
    const testQuery = await pool.query(
      `WITH qr_with_extracted_ids AS (
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
         WHERE q.id = 64
       )
       SELECT 
         qwe.id AS qr_code_id,
         qwe.name AS original_name,
         qwe.playlist_id,
         qwe.extracted_playlist_id,
         p1.name AS playlist_name_from_id,
         p2.name AS playlist_name_from_url,
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
         END AS display_name
       FROM qr_with_extracted_ids qwe
       LEFT JOIN playlists p1 ON qwe.playlist_id = p1.id AND p1.user_id = $1
       LEFT JOIN playlists p2 ON qwe.extracted_playlist_id = p2.id AND p2.user_id = $1`,
      [userId]
    );
    
    if (testQuery.rows.length > 0) {
      const result = testQuery.rows[0];
      console.log('📊 Query Result:');
      console.log(`   QR Code ID: ${result.qr_code_id}`);
      console.log(`   Original Name: "${result.original_name}"`);
      console.log(`   Playlist ID (set): ${result.playlist_id || 'null'}`);
      console.log(`   Playlist ID (from URL): ${result.extracted_playlist_id || 'null'}`);
      console.log(`   Playlist Name (from ID): ${result.playlist_name_from_id || 'null'}`);
      console.log(`   Playlist Name (from URL): ${result.playlist_name_from_url || 'null'}`);
      console.log(`   → Display Name: "${result.display_name}"\n`);
      
      if (result.display_name === 'Test') {
        console.log('❌ PROBLEM: Query is returning "Test" instead of playlist name!\n');
        console.log('🔍 Debugging why...\n');
        
        if (!result.playlist_id) {
          console.log('   Issue: playlist_id is NULL');
        }
        if (!result.playlist_name_from_id) {
          console.log('   Issue: Could not find playlist name from playlist_id');
        }
        if (!result.playlist_name_from_url) {
          console.log('   Issue: Could not find playlist name from URL');
        }
        
        // Check if playlist 43 exists and belongs to user 43
        const playlistCheck = await pool.query(
          `SELECT id, name, user_id FROM playlists WHERE id = 43`
        );
        
        if (playlistCheck.rows.length > 0) {
          const p = playlistCheck.rows[0];
          console.log(`\n   Playlist 43 exists:`);
          console.log(`   Name: "${p.name}"`);
          console.log(`   User ID: ${p.user_id}`);
          console.log(`   Query user ID: ${userId}`);
          console.log(`   Match: ${p.user_id === userId ? 'YES ✅' : 'NO ❌'}`);
        }
      } else {
        console.log('✅ Query is working correctly - showing playlist name!\n');
      }
    }
    
    // Check recent scans for QR Code 64
    console.log('📊 Recent scans for QR Code 64:\n');
    const scans = await pool.query(
      `SELECT id, scanned_at FROM qr_scans WHERE qr_code_id = 64 ORDER BY scanned_at DESC LIMIT 5`
    );
    
    console.log(`Found ${scans.rows.length} scans:\n`);
    scans.rows.forEach((scan, idx) => {
      console.log(`${idx + 1}. Scan ID: ${scan.id}, Time: ${scan.scanned_at}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
  } finally {
    await pool.end();
  }
}

checkQR64();

