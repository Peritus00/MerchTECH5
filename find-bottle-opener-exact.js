const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findExact() {
  try {
    const userId = 43; // DJKINGCAKE user ID
    
    console.log('🔍 Searching for QR codes for user DJKINGCAKE (ID: 43)...\n');
    
    // Get ALL QR codes for this user
    const allQRs = await pool.query(`
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
      WHERE q.user_id = $1
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.slideshow_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC
    `, [userId]);
    
    console.log(`📱 Found ${allQRs.rows.length} QR codes for DJKINGCAKE:\n`);
    allQRs.rows.forEach((qr, idx) => {
      const matches43 = qr.url?.includes('playlist-access/43') || qr.playlist_id === 43;
      const matchesBottle = qr.name?.toLowerCase().includes('bottle');
      console.log(`${idx + 1}. ID: ${qr.id}`);
      console.log(`   Name: "${qr.name}"`);
      console.log(`   URL: ${qr.url}`);
      console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
      console.log(`   Active: ${qr.is_active}`);
      console.log(`   Scans: ${qr.scan_count}`);
      console.log(`   Last Scan: ${qr.last_scan || 'Never'}`);
      if (matches43 || matchesBottle) {
        console.log(`   ⭐ MATCHES BOTTLE OPENER CRITERIA`);
      }
      console.log('');
    });
    
    // Check for QR codes with "43" in URL
    console.log('🔍 QR codes with "43" in URL or playlist_id:\n');
    const qrsWith43 = await pool.query(`
      SELECT id, name, url, playlist_id
      FROM qr_codes
      WHERE user_id = $1
        AND (
          url LIKE '%43%'
          OR playlist_id = 43
        )
      ORDER BY created_at DESC
    `, [userId]);
    
    if (qrsWith43.rows.length > 0) {
      qrsWith43.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", URL: ${qr.url}, Playlist ID: ${qr.playlist_id || 'null'}`);
      });
    } else {
      console.log('   ❌ No QR codes found with "43" in URL or playlist_id\n');
    }
    
    // Check playlist 43
    console.log('🔍 Checking playlist 43:\n');
    const playlist43 = await pool.query(`
      SELECT id, name, user_id, created_at
      FROM playlists
      WHERE id = 43
    `);
    
    if (playlist43.rows.length > 0) {
      const p = playlist43.rows[0];
      console.log(`Playlist 43 exists:`);
      console.log(`   Name: "${p.name}"`);
      console.log(`   User ID: ${p.user_id}`);
      console.log(`   Created: ${p.created_at}`);
      
      // Check if there's a QR code that should be linked
      const linkedQR = await pool.query(`
        SELECT id, name, url, playlist_id
        FROM qr_codes
        WHERE user_id = $1
          AND (playlist_id = 43 OR url LIKE '%playlist-access/43%')
        ORDER BY created_at DESC
        LIMIT 1
      `, [p.user_id]);
      
      if (linkedQR.rows.length > 0) {
        console.log(`\n   ✅ Found QR code that should be linked:`);
        console.log(`      ID: ${linkedQR.rows[0].id}`);
        console.log(`      Name: "${linkedQR.rows[0].name}"`);
        console.log(`      URL: ${linkedQR.rows[0].url}`);
        console.log(`      Playlist ID: ${linkedQR.rows[0].playlist_id || 'null'}`);
      } else {
        console.log(`\n   ❌ No QR code found linked to playlist 43`);
      }
    } else {
      console.log('   ❌ Playlist 43 does not exist\n');
    }
    
    // Check recent scans for playlist 43
    console.log('\n🔍 Recent scans that might be for playlist 43:\n');
    const scansFor43 = await pool.query(`
      SELECT 
        s.id,
        s.scanned_at,
        s.qr_code_id,
        q.name as qr_name,
        q.url as qr_url,
        q.playlist_id
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
        AND (q.url LIKE '%playlist-access/43%' OR q.playlist_id = 43)
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `, [userId]);
    
    if (scansFor43.rows.length > 0) {
      console.log(`Found ${scansFor43.rows.length} scans:\n`);
      scansFor43.rows.forEach((scan, idx) => {
        console.log(`${idx + 1}. Scan ID: ${scan.id}, Time: ${scan.scanned_at}`);
        console.log(`   QR Code ID: ${scan.qr_code_id}, Name: "${scan.qr_name}"`);
      });
    } else {
      console.log('   ❌ No scans found for playlist 43\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

findExact();

