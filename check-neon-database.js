const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000, // 30 second timeout
  query_timeout: 30000
});

async function checkNeon() {
  try {
    console.log('🔍 Connecting to Neon database...\n');
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to database\n');
    
    // Get database info
    const dbInfo = await client.query(`
      SELECT 
        current_database() as database_name,
        version() as postgres_version
    `);
    
    console.log('📊 Database Information:');
    console.log(`   Database: ${dbInfo.rows[0].database_name}`);
    console.log(`   Version: ${dbInfo.rows[0].postgres_version.split(',')[0]}\n`);
    
    // Check connection string
    const dbUrl = process.env.DATABASE_URL || '';
    const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('ep-');
    console.log(`🔗 Connection Type: ${isNeon ? 'Neon Database ✅' : 'Other Database'}`);
    
    if (dbUrl) {
      const hostMatch = dbUrl.match(/@([^:/]+)/);
      const host = hostMatch ? hostMatch[1] : 'unknown';
      console.log(`   Host: ${host.substring(0, 50)}...`);
    }
    
    // Now search for Bottle Opener
    console.log('\n🔍 Searching for "Bottle Opener" QR code...\n');
    
    // First, verify user
    const user = await client.query(
      `SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)`,
      ['djkingcake@gmail.com']
    );
    
    if (user.rows.length === 0) {
      console.log('❌ User djkingcake@gmail.com not found\n');
      client.release();
      await pool.end();
      return;
    }
    
    const userId = user.rows[0].id;
    console.log(`✅ User found: ID ${userId}, Email: ${user.rows[0].email}\n`);
    
    // Search for Bottle Opener
    const bottleOpener = await client.query(
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
    
    if (bottleOpener.rows.length > 0) {
      console.log(`✅ FOUND "Bottle Opener" QR code!\n`);
      bottleOpener.rows.forEach((qr, idx) => {
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
      console.log('❌ "Bottle Opener" QR code NOT found in Neon database\n');
      
      // Show all QR codes for this user
      const allQRs = await client.query(
        `SELECT id, name, url, created_at, is_active
         FROM qr_codes
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      );
      
      console.log(`📱 Most recent QR codes for this user:\n`);
      allQRs.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", Created: ${qr.created_at}`);
      });
    }
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack?.split('\n')[0]);
    await pool.end();
  }
}

checkNeon();

