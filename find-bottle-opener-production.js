const { Pool } = require('pg');
require('dotenv').config();

// Use the production database connection string
const productionDbUrl = 'postgresql://neondb_owner:npg_NGOT3izWBC7u@ep-weathered-leaf-ahn82u26-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: productionDbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function findBottleOpener() {
  try {
    console.log('🔍 Searching PRODUCTION Neon database for "Bottle Opener" QR code...\n');
    console.log('📊 Database: ep-weathered-leaf-ahn82u26\n');
    
    // First, verify the user
    const user = await pool.query(
      `SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1)`,
      ['djkingcake@gmail.com']
    );
    
    if (user.rows.length === 0) {
      console.log('❌ User djkingcake@gmail.com not found\n');
      await pool.end();
      return;
    }
    
    const userId = user.rows[0].id;
    console.log(`✅ User found: ID ${userId}, Email: ${user.rows[0].email}, Username: ${user.rows[0].username || 'null'}\n`);
    
    // Search for "Bottle Opener" - exact match
    console.log('📱 Searching for QR code named "Bottle Opener"...\n');
    const exactMatch = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.slideshow_id,
        q.user_id,
        q.created_at,
        q.updated_at,
        q.is_active,
        COUNT(s.id) as scan_count,
        MAX(s.scanned_at) as last_scan
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      WHERE q.user_id = $1
        AND q.name = $2
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.slideshow_id, q.user_id, q.created_at, q.updated_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId, 'Bottle Opener']
    );
    
    if (exactMatch.rows.length > 0) {
      console.log(`✅ FOUND "Bottle Opener" QR code!\n`);
      exactMatch.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. QR Code ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
        console.log(`   Slideshow ID: ${qr.slideshow_id || 'null'}`);
        console.log(`   User ID: ${qr.user_id}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Updated: ${qr.updated_at}`);
        console.log(`   Active: ${qr.is_active}`);
        console.log(`   Scan Count: ${qr.scan_count}`);
        console.log(`   Last Scan: ${qr.last_scan || 'Never'}`);
        console.log('');
      });
    } else {
      console.log('❌ No exact match found. Searching case-insensitive...\n');
      
      // Case-insensitive search
      const caseInsensitive = await pool.query(
        `SELECT 
          q.id,
          q.name,
          q.url,
          q.playlist_id,
          q.created_at,
          q.is_active,
          COUNT(s.id) as scan_count
        FROM qr_codes q
        LEFT JOIN qr_scans s ON q.id = s.qr_code_id
        WHERE q.user_id = $1
          AND LOWER(q.name) = LOWER($2)
        GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
        ORDER BY q.created_at DESC`,
        [userId, 'Bottle Opener']
      );
      
      if (caseInsensitive.rows.length > 0) {
        console.log(`✅ Found ${caseInsensitive.rows.length} QR code(s) case-insensitive:\n`);
        caseInsensitive.rows.forEach((qr, idx) => {
          console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", URL: ${qr.url}, Scans: ${qr.scan_count}`);
        });
      } else {
        console.log('❌ Still not found. Searching for QR codes pointing to playlist-access/43...\n');
        
        // Search by URL
        const urlMatch = await pool.query(
          `SELECT 
            q.id,
            q.name,
            q.url,
            q.playlist_id,
            q.created_at,
            q.is_active,
            COUNT(s.id) as scan_count
          FROM qr_codes q
          LEFT JOIN qr_scans s ON q.id = s.qr_code_id
          WHERE q.user_id = $1
            AND q.url LIKE '%playlist-access/43%'
          GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
          ORDER BY q.created_at DESC`,
          [userId]
        );
        
        if (urlMatch.rows.length > 0) {
          console.log(`✅ Found ${urlMatch.rows.length} QR code(s) pointing to playlist-access/43:\n`);
          urlMatch.rows.forEach((qr, idx) => {
            console.log(`${idx + 1}. ID: ${qr.id}`);
            console.log(`   Name: "${qr.name}"`);
            console.log(`   URL: ${qr.url}`);
            console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
            console.log(`   Created: ${qr.created_at}`);
            console.log(`   Active: ${qr.is_active}`);
            console.log(`   Scans: ${qr.scan_count}`);
            console.log('');
          });
        } else {
          console.log('❌ No QR codes found pointing to playlist-access/43\n');
          
          // Show all QR codes for this user
          console.log('📱 Showing ALL QR codes for this user:\n');
          const allQRs = await pool.query(
            `SELECT 
              q.id,
              q.name,
              q.url,
              q.playlist_id,
              q.created_at,
              q.is_active,
              COUNT(s.id) as scan_count
            FROM qr_codes q
            LEFT JOIN qr_scans s ON q.id = s.qr_code_id
            WHERE q.user_id = $1
            GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
            ORDER BY q.created_at DESC
            LIMIT 20`,
            [userId]
          );
          
          console.log(`Found ${allQRs.rows.length} QR codes:\n`);
          allQRs.rows.forEach((qr, idx) => {
            const matches = qr.name?.toLowerCase().includes('bottle') || qr.url?.includes('playlist-access/43');
            console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", URL: ${qr.url?.substring(0, 50)}..., Scans: ${qr.scan_count}${matches ? ' ⭐' : ''}`);
          });
        }
      }
    }
    
    // Check playlist 43
    console.log('\n🔍 Checking if playlist 43 exists:\n');
    const playlist43 = await pool.query('SELECT id, name, user_id, created_at FROM playlists WHERE id = 43');
    
    if (playlist43.rows.length > 0) {
      const p = playlist43.rows[0];
      console.log(`✅ Playlist 43 exists:`);
      console.log(`   Name: "${p.name}"`);
      console.log(`   User ID: ${p.user_id}`);
      console.log(`   Created: ${p.created_at}`);
    } else {
      console.log('❌ Playlist 43 does not exist');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack?.split('\n')[0]);
  } finally {
    await pool.end();
  }
}

findBottleOpener();

