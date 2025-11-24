const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function fixQR64Description() {
  try {
    console.log('🔧 Fixing QR Code 64 description...\n');
    
    // Get current QR code details
    const current = await pool.query(`
      SELECT id, name, description, url, playlist_id
      FROM qr_codes
      WHERE id = 64
    `);
    
    if (current.rows.length === 0) {
      console.log('❌ QR Code 64 not found\n');
      return;
    }
    
    const qr = current.rows[0];
    console.log('📱 Current QR Code 64:');
    console.log(`   Name: "${qr.name}"`);
    console.log(`   Description: "${qr.description || '(none)'}"`);
    console.log(`   URL: ${qr.url}`);
    console.log(`   Playlist ID: ${qr.playlist_id || 'null'}`);
    console.log('');
    
    // Update description from "Test" to something more descriptive
    if (qr.description === 'Test' || qr.description?.toLowerCase() === 'test') {
      console.log('🔄 Updating description from "Test" to "Bottle Opener (no logo)"...\n');
      
      await pool.query(`
        UPDATE qr_codes
        SET description = 'Bottle Opener (no logo)',
            updated_at = NOW()
        WHERE id = 64
      `);
      
      // Verify the update
      const updated = await pool.query(`
        SELECT id, name, description
        FROM qr_codes
        WHERE id = 64
      `);
      
      console.log('✅ QR Code 64 updated successfully!');
      console.log(`   Name: "${updated.rows[0].name}"`);
      console.log(`   Description: "${updated.rows[0].description}"`);
      console.log('');
      console.log('💡 Note: Since both QR codes have playlist_id = 43 set,');
      console.log('   analytics should show the playlist name, not "Test".');
      console.log('   If you\'re still seeing "Test", it might be from old scans');
      console.log('   recorded before playlist_id was set.\n');
    } else {
      console.log('ℹ️  Description is already updated or not "Test"\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

fixQR64Description();

