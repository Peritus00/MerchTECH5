const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findBottleOpener() {
  try {
    console.log('🔍 Searching for "Bottle Opener" QR code...\n');
    
    // Search for QR codes with "bottle opener" in name (case insensitive)
    const bottleOpenerQRs = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.slideshow_id,
        q.created_at,
        q.is_active,
        COUNT(s.id) as scan_count,
        MAX(s.scanned_at) as last_scan
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      JOIN users u ON q.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
        AND (
          LOWER(q.name) LIKE '%bottle%opener%'
          OR LOWER(q.name) LIKE '%bottle opener%'
        )
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.slideshow_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC
    `);
    
    console.log(`📱 QR codes with "bottle opener" in name:\n`);
    if (bottleOpenerQRs.rows.length === 0) {
      console.log('   ❌ No QR codes found with "bottle opener" in name\n');
    } else {
      bottleOpenerQRs.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
        console.log(`   Slideshow ID: ${qr.slideshow_id || 'null'}`);
        console.log(`   Active: ${qr.is_active}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scan Count: ${qr.scan_count}`);
        console.log(`   Last Scan: ${qr.last_scan || 'Never'}`);
        console.log('');
      });
    }
    
    // Get ALL QR codes to see what exists
    console.log('🔍 All QR codes for this user:\n');
    
    const allQRs = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.created_at,
        q.is_active,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      JOIN users u ON q.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC
    `);
    
    console.log(`Found ${allQRs.rows.length} total QR codes:\n`);
    allQRs.rows.forEach((qr, idx) => {
      console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", URL: ${qr.url?.substring(0, 60)}...`);
    });
    
    // Check playlist 43
    console.log('\n🔍 Checking playlist 43:\n');
    
    const playlist43 = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.created_at
      FROM playlists p
      JOIN users u ON p.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
        AND p.id = 43
    `);
    
    if (playlist43.rows.length > 0) {
      console.log(`Playlist 43 exists:`);
      console.log(`   Name: "${playlist43.rows[0].name}"`);
      console.log(`   Created: ${playlist43.rows[0].created_at}`);
    } else {
      console.log('   ❌ Playlist 43 does not exist');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

findBottleOpener();

