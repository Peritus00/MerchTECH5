const { Pool } = require('pg');
require('dotenv').config();

const productionDbUrl = 'postgresql://neondb_owner:npg_NGOT3izWBC7u@ep-weathered-leaf-ahn82u26-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: productionDbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function renameQRCode() {
  try {
    console.log('🔧 Renaming QR Code ID 64 from "Test" to "Bottle Opener"...\n');
    
    // First, check current state
    const current = await pool.query(
      `SELECT id, name, url, playlist_id FROM qr_codes WHERE id = 64`
    );
    
    if (current.rows.length === 0) {
      console.log('❌ QR Code ID 64 not found\n');
      await pool.end();
      return;
    }
    
    const qr = current.rows[0];
    console.log('📱 Current QR Code:');
    console.log(`   ID: ${qr.id}`);
    console.log(`   Current Name: "${qr.name}"`);
    console.log(`   URL: ${qr.url}`);
    console.log(`   Playlist ID: ${qr.playlist_id}\n`);
    
    if (qr.name === 'Bottle Opener') {
      console.log('✅ QR Code is already named "Bottle Opener"\n');
      await pool.end();
      return;
    }
    
    // Get playlist name to use
    const playlist = await pool.query(
      `SELECT name FROM playlists WHERE id = $1`,
      [qr.playlist_id]
    );
    
    const newName = playlist.rows.length > 0 ? playlist.rows[0].name : 'Bottle Opener';
    
    // Rename the QR code
    console.log(`🔄 Renaming to "${newName}"...\n`);
    const update = await pool.query(
      `UPDATE qr_codes 
       SET name = $1, updated_at = NOW()
       WHERE id = 64
       RETURNING id, name, updated_at`,
      [newName]
    );
    
    if (update.rows.length > 0) {
      console.log('✅ QR Code renamed successfully!');
      console.log(`   ID: ${update.rows[0].id}`);
      console.log(`   New Name: "${update.rows[0].name}"`);
      console.log(`   Updated: ${update.rows[0].updated_at}\n`);
      
      // Verify
      const verify = await pool.query(
        `SELECT id, name FROM qr_codes WHERE id = 64`
      );
      console.log('✅ Verification:');
      console.log(`   QR Code ID 64 is now named: "${verify.rows[0].name}"\n`);
      
      console.log('💡 Future scans will now show "Bottle Opener" instead of "Test"');
    } else {
      console.log('❌ Failed to rename QR code\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
  } finally {
    await pool.end();
  }
}

renameQRCode();

