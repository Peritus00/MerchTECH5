const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkRecentScans() {
  try {
    console.log('🔍 Detailed analysis of recent scans...\n');
    
    // Get the most recent scans with full details
    const recentScans = await pool.query(`
      SELECT 
        s.id as scan_id,
        s.scanned_at,
        s.qr_code_id,
        s.qr_visitor_id,
        s.visitor_id,
        s.ip_address,
        q.id as qr_id,
        q.name as qr_name,
        q.url as qr_url,
        q.playlist_id,
        q.user_id as qr_user_id,
        u.email as user_email
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      JOIN users u ON q.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
      ORDER BY s.scanned_at DESC
      LIMIT 5
    `);
    
    console.log(`📊 Most recent ${recentScans.rows.length} scans:\n`);
    recentScans.rows.forEach((scan, idx) => {
      console.log(`${idx + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   Time: ${scan.scanned_at}`);
      console.log(`   QR Code ID (from scan): ${scan.qr_code_id}`);
      console.log(`   QR Code ID (from join): ${scan.qr_id}`);
      console.log(`   QR Name: "${scan.qr_name}"`);
      console.log(`   QR URL: ${scan.qr_url}`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      console.log(`   Visitor ID: ${scan.qr_visitor_id || scan.visitor_id || 'null'}`);
      console.log('');
    });
    
    // Check if QR Code ID 6 is being used incorrectly
    console.log('🔍 Checking QR Code ID 6 details:\n');
    const qr6 = await pool.query(`
      SELECT id, name, url, playlist_id, user_id, created_at
      FROM qr_codes
      WHERE id = 6
    `);
    
    if (qr6.rows.length > 0) {
      const qr = qr6.rows[0];
      console.log(`QR Code ID 6:`);
      console.log(`   Name: "${qr.name}"`);
      console.log(`   URL: ${qr.url}`);
      console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
      console.log(`   User ID: ${qr.user_id}`);
      console.log(`   Created: ${qr.created_at}`);
      
      // Check scans for this QR code
      const scansFor6 = await pool.query(`
        SELECT COUNT(*) as count, MAX(scanned_at) as last_scan
        FROM qr_scans
        WHERE qr_code_id = 6
      `);
      console.log(`   Total Scans: ${scansFor6.rows[0].count}`);
      console.log(`   Last Scan: ${scansFor6.rows[0].last_scan || 'Never'}`);
    }
    
    // Check if there are any QR codes created very recently that might be "Bottle Opener"
    console.log('\n🔍 Checking for recently created QR codes (last 7 days):\n');
    const recentQRs = await pool.query(`
      SELECT id, name, url, playlist_id, created_at
      FROM qr_codes q
      JOIN users u ON q.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
        AND q.created_at > NOW() - INTERVAL '7 days'
      ORDER BY q.created_at DESC
    `);
    
    if (recentQRs.rows.length > 0) {
      console.log(`Found ${recentQRs.rows.length} QR codes created in last 7 days:\n`);
      recentQRs.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", URL: ${qr.url?.substring(0, 60)}...`);
      });
    } else {
      console.log('No QR codes created in the last 7 days.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkRecentScans();

