const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function testLookup() {
  try {
    console.log('🔍 Testing QR code lookup for playlist-access/43...\n');
    
    const playlistId = 43;
    
    // Simulate the lookup logic from /api/playlist-access/:id
    let qrId = null;
    
    // Primary: link by playlist_id when available
    try {
      const qrRes = await pool.query(
        'SELECT id, name FROM qr_codes WHERE playlist_id = $1 ORDER BY created_at DESC LIMIT 1',
        [playlistId]
      );
      if (qrRes.rows.length > 0) {
        qrId = qrRes.rows[0].id;
        console.log(`✅ Found by playlist_id: QR Code ID ${qrId}, Name: "${qrRes.rows[0].name}"`);
      } else {
        console.log('❌ No QR code found by playlist_id');
      }
    } catch (e) {
      console.log('❌ Error checking playlist_id:', e.message);
    }
    
    // Fallback 1: URL matching
    if (!qrId) {
      const rawFrontend = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://www.merchtrader.org';
      const frontend = rawFrontend.replace(/\/$/, '');
      const candidates = [
        `${frontend}/playlist-access/${playlistId}`,
        `${frontend.replace('https://www.', 'https://')}/playlist-access/${playlistId}`,
        `${frontend.replace('https://', 'https://www.')}/playlist-access/${playlistId}`,
      ];
      console.log('\n🔍 Trying URL matching with candidates:');
      candidates.forEach(c => console.log(`   - ${c}`));
      
      const qrByUrl = await pool.query(
        `SELECT id, name, url FROM qr_codes 
         WHERE is_active = true AND (
           regexp_replace(url, '\\?.*$', '') IN ($1, $2, $3)
           OR regexp_replace(url, '/+$', '') IN ($1, $2, $3)
         )
         ORDER BY created_at DESC LIMIT 1`,
        candidates
      );
      if (qrByUrl.rows.length > 0) {
        qrId = qrByUrl.rows[0].id;
        console.log(`✅ Found by URL: QR Code ID ${qrId}, Name: "${qrByUrl.rows[0].name}", URL: ${qrByUrl.rows[0].url}`);
      } else {
        console.log('❌ No QR code found by URL matching');
      }
    }
    
    // Fallback 2: path matching
    if (!qrId) {
      const pathPattern = `/playlist-access/${playlistId}`;
      console.log(`\n🔍 Trying path matching with pattern: ${pathPattern}`);
      
      const qrByPath = await pool.query(
        `SELECT id, name, url FROM qr_codes
         WHERE is_active = true AND (
           POSITION($1 in url) > 0 OR POSITION($2 in url) > 0
         )
         ORDER BY created_at DESC LIMIT 1`,
        [pathPattern, `${pathPattern}?`]
      );
      if (qrByPath.rows.length > 0) {
        qrId = qrByPath.rows[0].id;
        console.log(`✅ Found by path: QR Code ID ${qrId}, Name: "${qrByPath.rows[0].name}", URL: ${qrByPath.rows[0].url}`);
      } else {
        console.log('❌ No QR code found by path matching');
      }
    }
    
    // Fallback 3: normalized path
    if (!qrId) {
      const normalizedPath = `/playlist-access/${playlistId}`;
      console.log(`\n🔍 Trying normalized path: ${normalizedPath}`);
      
      const qrByNormalizedPath = await pool.query(
        `SELECT id, name, url FROM qr_codes
         WHERE is_active = true AND 
           regexp_replace(
             regexp_replace(url, '^https?://[^/]+', ''),
             '/+$', ''
           ) = $1`,
        [normalizedPath]
      );
      if (qrByNormalizedPath.rows.length > 0) {
        qrId = qrByNormalizedPath.rows[0].id;
        console.log(`✅ Found by normalized path: QR Code ID ${qrId}, Name: "${qrByNormalizedPath.rows[0].name}", URL: ${qrByNormalizedPath.rows[0].url}`);
      } else {
        console.log('❌ No QR code found by normalized path');
      }
    }
    
    console.log(`\n📊 Final result: ${qrId ? `QR Code ID ${qrId}` : 'NO QR CODE FOUND'}`);
    
    if (qrId) {
      const qrDetails = await pool.query('SELECT id, name, url, playlist_id FROM qr_codes WHERE id = $1', [qrId]);
      if (qrDetails.rows.length > 0) {
        console.log(`\n📱 QR Code Details:`);
        console.log(`   ID: ${qrDetails.rows[0].id}`);
        console.log(`   Name: "${qrDetails.rows[0].name}"`);
        console.log(`   URL: ${qrDetails.rows[0].url}`);
        console.log(`   Playlist ID: ${qrDetails.rows[0].playlist_id || 'null'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

testLookup();

