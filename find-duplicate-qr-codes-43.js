const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findDuplicateQRs() {
  try {
    // Get user ID for djjetfuel@gmail.com
    const userRes = await pool.query(
      "SELECT id FROM users WHERE email = 'djjetfuel@gmail.com'"
    );
    
    if (userRes.rows.length === 0) {
      console.log('❌ User not found\n');
      return;
    }
    
    const userId = userRes.rows[0].id;
    console.log(`✅ Found user ID: ${userId}\n`);
    
    // Find all QR codes pointing to playlist 43
    console.log('🔍 Finding all QR codes pointing to playlist-access/43...\n');
    
    const qrsFor43 = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.created_at,
        q.is_active,
        q.description,
        COUNT(s.id) as scan_count,
        MAX(s.scanned_at) as last_scan
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      WHERE q.user_id = $1
        AND (
          q.url LIKE '%playlist-access/43%'
          OR q.url LIKE '%playlist-access/43'
          OR q.playlist_id = 43
        )
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active, q.description
      ORDER BY q.created_at DESC`,
      [userId]
    );
    
    if (qrsFor43.rows.length === 0) {
      console.log('❌ No QR codes found pointing to playlist-access/43\n');
      return;
    }
    
    console.log(`✅ Found ${qrsFor43.rows.length} QR code(s) pointing to playlist-access/43:\n`);
    qrsFor43.rows.forEach((qr, idx) => {
      console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
      console.log(`   Name: "${qr.name}"`);
      console.log(`   Description: ${qr.description || '(none)'}`);
      console.log(`   URL: ${qr.url}`);
      console.log(`   Playlist ID (set): ${qr.playlist_id || 'null'}`);
      console.log(`   Active: ${qr.is_active}`);
      console.log(`   Created: ${qr.created_at}`);
      console.log(`   Scan Count: ${qr.scan_count}`);
      console.log(`   Last Scan: ${qr.last_scan || 'Never'}`);
      console.log('');
    });
    
    // Check which one has scans
    const withScans = qrsFor43.rows.filter(qr => qr.scan_count > 0);
    const withoutScans = qrsFor43.rows.filter(qr => qr.scan_count === 0);
    
    if (withScans.length > 0) {
      console.log('📊 QR codes WITH scans:\n');
      withScans.forEach((qr, idx) => {
        console.log(`   ${idx + 1}. ID ${qr.id}: "${qr.name}" (${qr.scan_count} scans)`);
      });
      console.log('');
    }
    
    if (withoutScans.length > 0) {
      console.log('📊 QR codes WITHOUT scans:\n');
      withoutScans.forEach((qr, idx) => {
        console.log(`   ${idx + 1}. ID ${qr.id}: "${qr.name}"`);
      });
      console.log('');
    }
    
    // Find the "Test" one
    const testQR = qrsFor43.rows.find(qr => 
      qr.name.toLowerCase().includes('test') || 
      qr.name.toLowerCase() === 'test'
    );
    
    if (testQR) {
      console.log('⚠️  Found QR code with "Test" in name:\n');
      console.log(`   ID: ${testQR.id}`);
      console.log(`   Name: "${testQR.name}"`);
      console.log(`   Scans: ${testQR.scan_count}`);
      console.log('');
      console.log('💡 Recommendation:');
      if (testQR.scan_count === 0) {
        console.log('   This QR code has no scans. You can safely delete it or rename it.');
      } else {
        console.log('   This QR code has scans. Consider renaming it to match the playlist name.');
        console.log('   Or set playlist_id = 43 so analytics shows the playlist name instead.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

findDuplicateQRs();

