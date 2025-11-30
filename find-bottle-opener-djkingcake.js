const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findBottleOpener() {
  try {
    console.log('🔍 Searching for "Bottle Opener" QR code created by Djkingcake...\n');
    
    // First, find the user Djkingcake
    const users = await pool.query(`
      SELECT id, email, username, first_name, last_name
      FROM users
      WHERE LOWER(username) LIKE '%djkingcake%'
         OR LOWER(email) LIKE '%djkingcake%'
         OR LOWER(first_name) LIKE '%djkingcake%'
         OR LOWER(last_name) LIKE '%djkingcake%'
    `);
    
    console.log(`👤 Users matching "Djkingcake":\n`);
    if (users.rows.length === 0) {
      console.log('   ❌ No user found\n');
    } else {
      users.rows.forEach((u, idx) => {
        console.log(`${idx + 1}. User ID: ${u.id}`);
        console.log(`   Email: ${u.email}`);
        console.log(`   Username: ${u.username || 'null'}`);
        console.log(`   Name: ${u.first_name || ''} ${u.last_name || ''}`);
        console.log('');
      });
    }
    
    // Now search for the Bottle Opener QR code
    console.log('🔍 Searching for "Bottle Opener" QR code...\n');
    
    const qrCodes = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.slideshow_id,
        q.user_id,
        q.created_at,
        q.is_active,
        u.email as user_email,
        u.username,
        COUNT(s.id) as scan_count,
        MAX(s.scanned_at) as last_scan
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      LEFT JOIN users u ON q.user_id = u.id
      WHERE (
        LOWER(q.name) LIKE '%bottle%opener%'
        OR q.url LIKE '%playlist-access/43%'
        OR q.playlist_id = 43
      )
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.slideshow_id, q.user_id, q.created_at, q.is_active, u.email, u.username
      ORDER BY q.created_at DESC
    `);
    
    console.log(`📱 QR codes matching "Bottle Opener" or playlist-access/43:\n`);
    if (qrCodes.rows.length === 0) {
      console.log('   ❌ No QR codes found\n');
    } else {
      qrCodes.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
        console.log(`   User ID: ${qr.user_id}`);
        console.log(`   User Email: ${qr.user_email || 'null'}`);
        console.log(`   Username: ${qr.username || 'null'}`);
        console.log(`   Active: ${qr.is_active}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scan Count: ${qr.scan_count}`);
        console.log(`   Last Scan: ${qr.last_scan || 'Never'}`);
        console.log('');
      });
    }
    
    // Get all QR codes for all users to see what exists
    console.log('🔍 All QR codes in database (last 20):\n');
    
    const allQRs = await pool.query(`
      SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.user_id,
        u.email as user_email,
        u.username,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      LEFT JOIN users u ON q.user_id = u.id
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, u.email, u.username
      ORDER BY q.created_at DESC
      LIMIT 20
    `);
    
    console.log(`Found ${allQRs.rows.length} QR codes:\n`);
    allQRs.rows.forEach((qr, idx) => {
      const matches = qr.name?.toLowerCase().includes('bottle') || qr.url?.includes('playlist-access/43');
      console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", User: ${qr.user_email || qr.username || qr.user_id}${matches ? ' ⭐ MATCHES' : ''}`);
    });
    
    // Check recent scans to see which QR code they're linked to
    console.log('\n🔍 Recent scans (last 5) and their QR codes:\n');
    
    const recentScans = await pool.query(`
      SELECT 
        s.id as scan_id,
        s.scanned_at,
        s.qr_code_id,
        q.name as qr_name,
        q.url as qr_url,
        q.playlist_id,
        u.email as user_email
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      LEFT JOIN users u ON q.user_id = u.id
      ORDER BY s.scanned_at DESC
      LIMIT 5
    `);
    
    recentScans.rows.forEach((scan, idx) => {
      console.log(`${idx + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   Time: ${scan.scanned_at}`);
      console.log(`   QR Code ID: ${scan.qr_code_id}`);
      console.log(`   QR Name: "${scan.qr_name}"`);
      console.log(`   QR URL: ${scan.qr_url}`);
      console.log(`   Playlist ID: ${scan.playlist_id || 'null'}`);
      console.log(`   User: ${scan.user_email || 'unknown'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

findBottleOpener();

