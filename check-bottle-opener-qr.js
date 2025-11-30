const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkBottleOpenerQR() {
  try {
    console.log('🔍 Investigating "Bottle Opener" QR code issue...\n');
    
    // Find QR codes that point to playlist-access/43
    const qrCodesForPlaylist43 = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.created_at,
        q.is_active,
        COUNT(s.id) as scan_count,
        MAX(s.scanned_at) as last_scan
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      JOIN users u ON q.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
        AND (
          q.playlist_id = 43
          OR q.url LIKE '%/playlist-access/43%'
          OR q.url LIKE '%playlist-access/43'
        )
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC
    `);
    
    console.log(`📱 QR codes pointing to playlist-access/43:\n`);
    qrCodesForPlaylist43.rows.forEach((qr, idx) => {
      console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
      console.log(`   Name: "${qr.name}"`);
      console.log(`   URL: ${qr.url}`);
      console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
      console.log(`   Active: ${qr.is_active}`);
      console.log(`   Created: ${qr.created_at}`);
      console.log(`   Scan Count: ${qr.scan_count}`);
      console.log(`   Last Scan: ${qr.last_scan || 'Never'}`);
      console.log('');
    });
    
    // Check recent scans and which QR code they're linked to
    console.log('🔍 Recent scans (last 10) and their QR codes:\n');
    
    const recentScans = await pool.query(`
      SELECT 
        s.id as scan_id,
        s.scanned_at,
        s.qr_code_id,
        q.name as qr_name,
        q.url as qr_url,
        q.playlist_id
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      JOIN users u ON q.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `);
    
    recentScans.rows.forEach((scan, idx) => {
      console.log(`${idx + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   Time: ${scan.scanned_at}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   QR Name: "${scan.qr_name}"`);
      console.log(`   QR URL: ${scan.qr_url}`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      console.log('');
    });
    
    // Check if there are multiple QR codes that could match playlist 43
    console.log('🔍 All QR codes that might match playlist-access/43:\n');
    
    const allMatchingQRs = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.created_at
      FROM qr_codes q
      JOIN users u ON q.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
        AND q.is_active = true
        AND (
          q.url LIKE '%playlist-access%'
          OR q.playlist_id IS NOT NULL
        )
      ORDER BY q.created_at DESC
    `);
    
    console.log(`Found ${allMatchingQRs.rows.length} QR codes with playlist URLs:\n`);
    allMatchingQRs.rows.forEach((qr, idx) => {
      const matches43 = qr.url?.includes('/playlist-access/43') || qr.playlist_id === 43;
      console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
      console.log(`   Name: "${qr.name}"`);
      console.log(`   URL: ${qr.url}`);
      console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
      console.log(`   Matches playlist 43: ${matches43 ? '✅ YES' : '❌ NO'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkBottleOpenerQR();

