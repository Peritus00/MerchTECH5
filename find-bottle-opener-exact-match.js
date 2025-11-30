const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findExactMatch() {
  try {
    console.log('🔍 Searching for "Bottle Opener" QR code with exact details...\n');
    
    // First, verify the user
    console.log('👤 Finding user djkingcake@gmail.com...\n');
    const user = await pool.query(
      `SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1)`,
      ['djkingcake@gmail.com']
    );
    
    if (user.rows.length === 0) {
      console.log('❌ User not found!\n');
      return;
    }
    
    const userId = user.rows[0].id;
    console.log(`✅ User found: ID ${userId}, Email: ${user.rows[0].email}, Username: ${user.rows[0].username || 'null'}\n`);
    
    // Search for "Bottle Opener" with exact case
    console.log('📱 Searching for QR code named "Bottle Opener"...\n');
    const exactName = await pool.query(
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
        AND q.name = $2
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId, 'Bottle Opener']
    );
    
    if (exactName.rows.length > 0) {
      console.log(`✅ Found ${exactName.rows.length} QR code(s) with exact name:\n`);
      exactName.rows.forEach((qr, idx) => {
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
      console.log('❌ No QR code found with exact name "Bottle Opener"\n');
    }
    
    // Search case-insensitive
    console.log('📱 Searching case-insensitive for "bottle opener"...\n');
    const caseInsensitive = await pool.query(
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
        AND LOWER(q.name) = LOWER($2)
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId, 'Bottle Opener']
    );
    
    if (caseInsensitive.rows.length > 0) {
      console.log(`✅ Found ${caseInsensitive.rows.length} QR code(s) case-insensitive:\n`);
      caseInsensitive.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scans: ${qr.scan_count}`);
        console.log('');
      });
    } else {
      console.log('❌ No QR code found case-insensitive\n');
    }
    
    // Search for URL match
    console.log('📱 Searching for QR code with URL containing "playlist-access/43"...\n');
    const urlMatch = await pool.query(
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
        AND q.url LIKE '%playlist-access/43%'
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.user_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId]
    );
    
    if (urlMatch.rows.length > 0) {
      console.log(`✅ Found ${urlMatch.rows.length} QR code(s) with URL match:\n`);
      urlMatch.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scans: ${qr.scan_count}`);
        console.log('');
      });
    } else {
      console.log('❌ No QR code found with URL containing "playlist-access/43"\n');
    }
    
    // Check date range - 11/04/2025 could be Nov 4 or Apr 11 depending on format
    console.log('📱 Checking QR codes created around 11/04/2025...\n');
    console.log('   (Checking both Nov 4, 2025 and Apr 11, 2025)\n');
    
    const dateRanges = [
      { start: '2025-11-04', end: '2025-11-05', desc: 'November 4, 2025' },
      { start: '2025-04-11', end: '2025-04-12', desc: 'April 11, 2025' },
    ];
    
    for (const range of dateRanges) {
      const dateMatch = await pool.query(
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
          AND q.created_at >= $2
          AND q.created_at < $3
        GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
        ORDER BY q.created_at DESC`,
        [userId, range.start, range.end]
      );
      
      if (dateMatch.rows.length > 0) {
        console.log(`✅ Found ${dateMatch.rows.length} QR code(s) created on ${range.desc}:\n`);
        dateMatch.rows.forEach((qr, idx) => {
          console.log(`${idx + 1}. ID: ${qr.id}`);
          console.log(`   Name: "${qr.name}"`);
          console.log(`   URL: ${qr.url}`);
          console.log(`   Created: ${qr.created_at}`);
          console.log(`   Scans: ${qr.scan_count}`);
          console.log('');
        });
      } else {
        console.log(`❌ No QR codes found created on ${range.desc}\n`);
      }
    }
    
    // Get ALL QR codes for this user to see what we're missing
    console.log('📱 ALL QR codes for this user (to see what exists):\n');
    const allQRs = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.created_at,
        q.is_active,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      WHERE q.user_id = $1
      GROUP BY q.id, q.name, q.url, q.created_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId]
    );
    
    console.log(`Total: ${allQRs.rows.length} QR codes\n`);
    console.log('Recent QR codes:\n');
    allQRs.rows.slice(0, 10).forEach((qr, idx) => {
      console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", Created: ${qr.created_at}, Scans: ${qr.scan_count}`);
    });
    
    // Check if maybe the QR code exists but with a different user_id somehow
    console.log('\n📱 Checking if "Bottle Opener" exists for ANY user:\n');
    const anyUser = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.user_id,
        u.email,
        q.created_at,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      LEFT JOIN users u ON q.user_id = u.id
      WHERE LOWER(q.name) = LOWER($1)
      GROUP BY q.id, q.name, q.url, q.user_id, u.email, q.created_at
      ORDER BY q.created_at DESC`,
      ['Bottle Opener']
    );
    
    if (anyUser.rows.length > 0) {
      console.log(`✅ Found ${anyUser.rows.length} QR code(s) named "Bottle Opener" for any user:\n`);
      anyUser.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}`);
        console.log(`   Name: "${qr.name}"`);
        console.log(`   URL: ${qr.url}`);
        console.log(`   User ID: ${qr.user_id}`);
        console.log(`   User Email: ${qr.email || 'null'}`);
        console.log(`   Created: ${qr.created_at}`);
        console.log(`   Scans: ${qr.scan_count}`);
        console.log('');
      });
    } else {
      console.log('❌ No QR code named "Bottle Opener" found for any user\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

findExactMatch();

