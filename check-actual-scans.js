const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkActualScans() {
  try {
    const userId = 43; // DJKINGCAKE
    
    console.log('🔍 Checking actual scan records to see what QR codes they\'re linked to...\n');
    
    // Get ALL recent scans for this user, ordered by most recent
    const allScans = await pool.query(
      `SELECT 
        s.id as scan_id,
        s.scanned_at,
        s.qr_code_id,
        q.name as qr_name,
        q.url as qr_url,
        q.playlist_id,
        q.user_id as qr_user_id
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
      ORDER BY s.scanned_at DESC
      LIMIT 20`,
      [userId]
    );
    
    console.log(`📊 Most recent ${allScans.rows.length} scans:\n`);
    allScans.rows.forEach((scan, idx) => {
      const matches43 = scan.qr_url?.includes('playlist-access/43');
      console.log(`${idx + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   Time: ${scan.scanned_at}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   QR Name: "${scan.qr_name}"`);
      console.log(`   QR URL: ${scan.qr_url}`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      if (matches43) {
        console.log(`   ⭐ THIS SCAN POINTS TO PLAYLIST 43!`);
      }
      console.log('');
    });
    
    // Check if there are ANY QR codes that point to playlist 43, regardless of user
    console.log('🔍 Checking ALL QR codes pointing to playlist-access/43 (any user):\n');
    const allQRsFor43 = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.user_id,
        u.email as user_email,
        u.username,
        q.created_at,
        q.is_active,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      LEFT JOIN users u ON q.user_id = u.id
      WHERE (
        q.url LIKE '%playlist-access/43%'
        OR q.url LIKE '%playlist-access/43'
        OR q.playlist_id = 43
      )
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, u.email, u.username, q.created_at, q.is_active
      ORDER BY q.created_at DESC`
    );
    
    if (allQRsFor43.rows.length > 0) {
      console.log(`✅ Found ${allQRsFor43.rows.length} QR code(s) pointing to playlist-access/43:\n`);
      allQRsFor43.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   User ID: ${qr.user_id}`);
        console.log(`   User Email: ${qr.user_email || 'null'}`);
        console.log(`   Username: ${qr.username || 'null'}`);
        console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
        console.log(`   Active: ${qr.is_active}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scans: ${qr.scan_count}`);
        console.log('');
      });
    } else {
      console.log('❌ No QR codes found pointing to playlist-access/43\n');
    }
    
    // Check playlist 43 itself
    console.log('🔍 Checking if playlist 43 exists:\n');
    const playlist43 = await pool.query(
      `SELECT id, name, user_id, created_at
       FROM playlists
       WHERE id = 43`
    );
    
    if (playlist43.rows.length > 0) {
      const p = playlist43.rows[0];
      console.log(`✅ Playlist 43 exists:`);
      console.log(`   Name: "${p.name}"`);
      console.log(`   User ID: ${p.user_id}`);
      console.log(`   Created: ${p.created_at}`);
      
      // Get user info for playlist 43
      const playlistUser = await pool.query(
        `SELECT id, email, username FROM users WHERE id = $1`,
        [p.user_id]
      );
      if (playlistUser.rows.length > 0) {
        console.log(`   Owner: ${playlistUser.rows[0].email} (${playlistUser.rows[0].username || 'no username'})`);
      }
    } else {
      console.log('❌ Playlist 43 does not exist\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkActualScans();

