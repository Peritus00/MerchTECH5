const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function verifyConnection() {
  try {
    console.log('🔍 Verifying database connection...\n');
    
    // Get database info
    const dbInfo = await pool.query(`
      SELECT 
        current_database() as database_name,
        version() as postgres_version,
        current_user as current_user
    `);
    
    console.log('📊 Database Information:');
    console.log(`   Database Name: ${dbInfo.rows[0].database_name}`);
    console.log(`   PostgreSQL Version: ${dbInfo.rows[0].postgres_version.split(',')[0]}`);
    console.log(`   Current User: ${dbInfo.rows[0].current_user}`);
    
    // Check connection string (masked)
    const dbUrl = process.env.DATABASE_URL || '';
    const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('ep-');
    console.log(`\n🔗 Connection Details:`);
    console.log(`   Is Neon Database: ${isNeon ? 'YES ✅' : 'NO ❌'}`);
    if (dbUrl) {
      const hostMatch = dbUrl.match(/@([^:/]+)/);
      const host = hostMatch ? hostMatch[1] : 'unknown';
      console.log(`   Host: ${host}`);
    }
    
    // Count total QR codes
    const qrCount = await pool.query('SELECT COUNT(*) as count FROM qr_codes');
    console.log(`\n📱 Total QR codes in database: ${qrCount.rows[0].count}`);
    
    // Count QR codes for user 43
    const user43Count = await pool.query('SELECT COUNT(*) as count FROM qr_codes WHERE user_id = 43');
    console.log(`   QR codes for user ID 43: ${user43Count.rows[0].count}`);
    
    // Check if "Bottle Opener" exists
    const bottleOpener = await pool.query(
      `SELECT COUNT(*) as count FROM qr_codes WHERE LOWER(name) = LOWER($1)`,
      ['Bottle Opener']
    );
    console.log(`   QR codes named "Bottle Opener": ${bottleOpener.rows[0].count}`);
    
    // Check if playlist 43 exists
    const playlist43 = await pool.query('SELECT COUNT(*) as count FROM playlists WHERE id = 43');
    console.log(`   Playlists with ID 43: ${playlist43.rows[0].count}`);
    
    // Get the most recent QR code created
    const recentQR = await pool.query(`
      SELECT id, name, url, created_at, user_id
      FROM qr_codes
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (recentQR.rows.length > 0) {
      console.log(`\n📅 Most recent QR code:`);
      console.log(`   ID: ${recentQR.rows[0].id}`);
      console.log(`   Name: "${recentQR.rows[0].name}"`);
      console.log(`   URL: ${recentQR.rows[0].url}`);
      console.log(`   User ID: ${recentQR.rows[0].user_id}`);
      console.log(`   Created: ${recentQR.rows[0].created_at}`);
    }
    
    // Check if there are any QR codes created after Oct 29, 2025
    const recentQRs = await pool.query(`
      SELECT id, name, url, created_at, user_id
      FROM qr_codes
      WHERE created_at > '2025-10-29'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (recentQRs.rows.length > 0) {
      console.log(`\n📅 QR codes created after Oct 29, 2025:`);
      recentQRs.rows.forEach((qr, idx) => {
        console.log(`   ${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", Created: ${qr.created_at}, User: ${qr.user_id}`);
      });
    } else {
      console.log(`\n📅 No QR codes found created after Oct 29, 2025`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyConnection();

