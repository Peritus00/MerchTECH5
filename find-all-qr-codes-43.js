const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findAllQRsFor43() {
  try {
    console.log('🔍 Searching for ALL QR codes pointing to playlist-access/43 (any user)...\n');
    
    // Find all QR codes pointing to playlist 43, regardless of user
    const allQRs = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.user_id,
        q.created_at,
        q.is_active,
        q.description,
        u.email as user_email,
        COUNT(s.id) as scan_count,
        MAX(s.scanned_at) as last_scan
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      LEFT JOIN users u ON q.user_id = u.id
      WHERE (
        q.url LIKE '%playlist-access/43%'
        OR q.url LIKE '%playlist-access/43'
        OR q.playlist_id = 43
      )
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, q.created_at, q.is_active, q.description, u.email
      ORDER BY q.created_at DESC`,
      []
    );
    
    if (allQRs.rows.length === 0) {
      console.log('❌ No QR codes found pointing to playlist-access/43\n');
      console.log('💡 This might mean:');
      console.log('   1. The QR codes are in a different database (production vs local)');
      console.log('   2. The QR codes use a different URL format');
      console.log('   3. The playlist_id is not set\n');
      
      // Check what QR codes exist at all
      const anyQRs = await pool.query(`
        SELECT COUNT(*) as count FROM qr_codes
      `);
      console.log(`📊 Total QR codes in database: ${anyQRs.rows[0].count}\n`);
      
      // Check for any QR codes with "bottle" in name
      const bottleQRs = await pool.query(`
        SELECT id, name, url, playlist_id, user_id
        FROM qr_codes
        WHERE LOWER(name) LIKE '%bottle%'
        ORDER BY created_at DESC
        LIMIT 5
      `);
      
      if (bottleQRs.rows.length > 0) {
        console.log(`📱 Found ${bottleQRs.rows.length} QR code(s) with "bottle" in name:\n`);
        bottleQRs.rows.forEach((qr, idx) => {
          console.log(`   ${idx + 1}. ID: ${qr.id}, Name: "${qr.name}"`);
          console.log(`      URL: ${qr.url}`);
          console.log(`      Playlist ID: ${qr.playlist_id || 'null'}`);
          console.log(`      User ID: ${qr.user_id}`);
          console.log('');
        });
      }
      
      return;
    }
    
    console.log(`✅ Found ${allQRs.rows.length} QR code(s) pointing to playlist-access/43:\n`);
    allQRs.rows.forEach((qr, idx) => {
      console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
      console.log(`   Name: "${qr.name}"`);
      console.log(`   Description: ${qr.description || '(none)'}`);
      console.log(`   URL: ${qr.url}`);
      console.log(`   Playlist ID (set): ${qr.playlist_id || 'null'}`);
      console.log(`   User: ${qr.user_email || `ID ${qr.user_id}`}`);
      console.log(`   Active: ${qr.is_active}`);
      console.log(`   Created: ${qr.created_at}`);
      console.log(`   Scan Count: ${qr.scan_count}`);
      console.log(`   Last Scan: ${qr.last_scan || 'Never'}`);
      console.log('');
    });
    
    // Identify duplicates
    const testQRs = allQRs.rows.filter(qr => 
      qr.name.toLowerCase().includes('test') || 
      qr.name.toLowerCase() === 'test'
    );
    
    const bottleQRs = allQRs.rows.filter(qr => 
      qr.name.toLowerCase().includes('bottle')
    );
    
    if (testQRs.length > 0) {
      console.log('⚠️  QR codes with "Test" in name:\n');
      testQRs.forEach((qr, idx) => {
        console.log(`   ${idx + 1}. ID ${qr.id}: "${qr.name}" (${qr.scan_count} scans)`);
      });
      console.log('');
    }
    
    if (bottleQRs.length > 0) {
      console.log('✅ QR codes with "Bottle" in name:\n');
      bottleQRs.forEach((qr, idx) => {
        console.log(`   ${idx + 1}. ID ${qr.id}: "${qr.name}" (${qr.scan_count} scans)`);
      });
      console.log('');
    }
    
    if (testQRs.length > 0 && bottleQRs.length > 0) {
      console.log('💡 SOLUTION:');
      console.log('   You have duplicate QR codes pointing to the same playlist.');
      console.log('   To fix analytics showing "Test":');
      console.log('   1. Rename the "Test" QR code to match the playlist name, OR');
      console.log('   2. Set playlist_id = 43 on the "Test" QR code so analytics shows playlist name, OR');
      console.log('   3. Delete the "Test" QR code if it has no scans\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

findAllQRsFor43();

