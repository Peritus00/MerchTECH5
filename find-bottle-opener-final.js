const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findBottleOpenerFinal() {
  try {
    const userId = 43; // DJKINGCAKE
    
    console.log('🔍 Final comprehensive search for "Bottle Opener" QR code...\n');
    
    // Search with various case patterns
    const searches = [
      { pattern: '%bottle%opener%', desc: 'Contains "bottle opener"' },
      { pattern: '%Bottle%Opener%', desc: 'Contains "Bottle Opener"' },
      { pattern: 'Bottle Opener', desc: 'Exact match "Bottle Opener"' },
      { pattern: 'bottle opener', desc: 'Lowercase "bottle opener"' },
    ];
    
    for (const search of searches) {
      console.log(`📱 Searching: ${search.desc}...`);
      const results = await pool.query(
        `SELECT 
          q.id,
          q.name,
          q.url,
          q.playlist_id,
          q.user_id,
          q.created_at,
          q.is_active,
          COUNT(s.id) as scan_count
        FROM qr_codes q
        LEFT JOIN qr_scans s ON q.id = s.qr_code_id
        WHERE q.user_id = $1
          AND q.name LIKE $2
        GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, q.created_at, q.is_active
        ORDER BY q.created_at DESC`,
        [userId, search.pattern]
      );
      
      if (results.rows.length > 0) {
        console.log(`   ✅ Found ${results.rows.length} QR code(s):\n`);
        results.rows.forEach((qr, idx) => {
          console.log(`   ${idx + 1}. ID: ${qr.id}`);
          console.log(`      Name: "${qr.name}"`);
          console.log(`      URL: ${qr.url}`);
          console.log(`      Playlist ID: ${qr.playlist_id || 'null'}`);
          console.log(`      Active: ${qr.is_active}`);
          console.log(`      Created: ${qr.created_at}`);
          console.log(`      Scans: ${qr.scan_count}`);
          console.log('');
        });
      } else {
        console.log(`   ❌ No matches\n`);
      }
    }
    
    // Search for QR codes pointing to playlist-access/43
    console.log('📱 Searching for QR codes pointing to playlist-access/43...\n');
    const qrsFor43 = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.user_id,
        q.created_at,
        q.is_active,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      WHERE q.user_id = $1
        AND (
          q.url LIKE '%playlist-access/43%'
          OR q.url LIKE '%playlist-access/43'
          OR q.playlist_id = 43
        )
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId]
    );
    
    if (qrsFor43.rows.length > 0) {
      console.log(`✅ Found ${qrsFor43.rows.length} QR code(s) pointing to playlist-access/43:\n`);
      qrsFor43.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
        console.log(`   Active: ${qr.is_active}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scans: ${qr.scan_count}`);
        console.log('');
      });
    } else {
      console.log('❌ No QR codes found pointing to playlist-access/43\n');
    }
    
    // Check ALL QR codes created on or after 11/04/2025
    console.log('📱 Checking QR codes created on or after 11/04/2025...\n');
    const recentQRs = await pool.query(
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
        AND q.created_at >= '2025-11-04'
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId]
    );
    
    if (recentQRs.rows.length > 0) {
      console.log(`Found ${recentQRs.rows.length} QR code(s) created on/after 11/04/2025:\n`);
      recentQRs.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scans: ${qr.scan_count}`);
        console.log('');
      });
    } else {
      console.log('❌ No QR codes found created on/after 11/04/2025\n');
    }
    
    // Check if there are any QR codes with exactly 4 scans
    console.log('📱 Checking QR codes with exactly 4 scans...\n');
    const qrsWith4Scans = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.created_at,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      WHERE q.user_id = $1
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at
      HAVING COUNT(s.id) = 4
      ORDER BY q.created_at DESC`,
      [userId]
    );
    
    if (qrsWith4Scans.rows.length > 0) {
      console.log(`Found ${qrsWith4Scans.rows.length} QR code(s) with exactly 4 scans:\n`);
      qrsWith4Scans.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log('');
      });
    } else {
      console.log('❌ No QR codes found with exactly 4 scans\n');
    }
    
    // Get the most recent QR codes regardless of name
    console.log('📱 Most recent 10 QR codes for this user:\n');
    const mostRecent = await pool.query(
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
      LIMIT 10`,
      [userId]
    );
    
    mostRecent.rows.forEach((qr, idx) => {
      console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", URL: ${qr.url?.substring(0, 50)}..., Scans: ${qr.scan_count}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

findBottleOpenerFinal();

