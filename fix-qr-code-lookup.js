const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function fixQRCodeLookup() {
  try {
    console.log('🔍 Checking if "Bottle Opener" QR code needs to be created...\n');
    
    // Check if playlist 43 exists (maybe with a different name)
    const playlists = await pool.query(`
      SELECT id, name, created_at
      FROM playlists p
      JOIN users u ON p.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
        AND (p.id = 43 OR LOWER(p.name) LIKE '%bottle%opener%')
      ORDER BY p.created_at DESC
    `);
    
    console.log(`📋 Playlists matching criteria:\n`);
    if (playlists.rows.length === 0) {
      console.log('   ❌ No playlist found with ID 43 or name containing "bottle opener"\n');
    } else {
      playlists.rows.forEach((p, idx) => {
        console.log(`${idx + 1}. Playlist ID: ${p.id}, Name: "${p.name}", Created: ${p.created_at}`);
      });
    }
    
    // Check all playlists to see what exists
    console.log('\n🔍 All playlists for this user:\n');
    const allPlaylists = await pool.query(`
      SELECT id, name, created_at
      FROM playlists p
      JOIN users u ON p.user_id = u.id
      WHERE u.email = 'djjetfuel@gmail.com'
      ORDER BY p.created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${allPlaylists.rows.length} playlists:\n`);
    allPlaylists.rows.forEach((p, idx) => {
      console.log(`${idx + 1}. ID: ${p.id}, Name: "${p.name}"`);
    });
    
    console.log('\n💡 Solution:');
    console.log('   1. The "Bottle Opener" QR code needs to be created in the database');
    console.log('   2. It should point to the correct playlist (ID 43 or the playlist named "Bottle Opener")');
    console.log('   3. The playlist_id should be set correctly so the lookup finds it');
    console.log('   4. Once created, future scans will show "Bottle Opener" instead of "Test"');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

fixQRCodeLookup();

