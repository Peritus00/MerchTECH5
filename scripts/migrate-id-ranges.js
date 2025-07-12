#!/usr/bin/env node

/**
 * Migration Script: Separate ID Ranges for Playlists and Slideshows
 * 
 * This script ensures that:
 * - Playlists use IDs 1-999,999
 * - Slideshows use IDs 1,000,000+
 * 
 * This prevents ID conflicts between content types.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../env.merchtech.production') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrateIdRanges() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting ID range migration...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Check current state
    console.log('📊 Checking current ID ranges...');
    
    const playlistStats = await client.query(
      'SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as count FROM playlists'
    );
    const slideshowStats = await client.query(
      'SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as count FROM slideshows'
    );
    
    console.log('Current Playlists:', playlistStats.rows[0]);
    console.log('Current Slideshows:', slideshowStats.rows[0]);
    
    // Check for conflicts
    const playlistMax = parseInt(playlistStats.rows[0].max_id) || 0;
    const slideshowMin = parseInt(slideshowStats.rows[0].min_id) || 0;
    const slideshowMax = parseInt(slideshowStats.rows[0].max_id) || 0;
    
    console.log('🔍 Analyzing potential conflicts...');
    
    // Check if any slideshows are in playlist range (< 1,000,000)
    const conflictingSlideshows = await client.query(
      'SELECT id, name FROM slideshows WHERE id < 1000000 ORDER BY id'
    );
    
    // Check if any playlists are in slideshow range (>= 1,000,000)
    const conflictingPlaylists = await client.query(
      'SELECT id, name FROM playlists WHERE id >= 1000000 ORDER BY id'
    );
    
    console.log(`Found ${conflictingSlideshows.rows.length} slideshows in playlist range`);
    console.log(`Found ${conflictingPlaylists.rows.length} playlists in slideshow range`);
    
    // If there are conflicts, we need to migrate them
    if (conflictingSlideshows.rows.length > 0) {
      console.log('🔄 Migrating slideshows to correct ID range...');
      
      for (const slideshow of conflictingSlideshows.rows) {
        const oldId = slideshow.id;
        const newId = oldId + 1000000;
        
        console.log(`  Migrating slideshow "${slideshow.name}" from ID ${oldId} to ${newId}`);
        
        // Update slideshow ID
        await client.query('UPDATE slideshows SET id = $1 WHERE id = $2', [newId, oldId]);
        
        // Update related tables
        await client.query('UPDATE slideshow_images SET slideshow_id = $1 WHERE slideshow_id = $2', [newId, oldId]);
        await client.query('UPDATE activation_codes SET slideshow_id = $1 WHERE slideshow_id = $2', [newId, oldId]);
        await client.query('UPDATE product_links SET slideshow_id = $1 WHERE slideshow_id = $2', [newId, oldId]);
        await client.query('UPDATE qr_codes SET slideshow_id = $1 WHERE slideshow_id = $2', [newId, oldId]);
        
        console.log(`  ✅ Successfully migrated slideshow ${oldId} → ${newId}`);
      }
    }
    
    if (conflictingPlaylists.rows.length > 0) {
      console.log('⚠️  WARNING: Found playlists in slideshow range - this requires manual intervention');
      console.log('Playlists in slideshow range:', conflictingPlaylists.rows);
      // Don't auto-migrate playlists as it's more complex
    }
    
    // Set sequence starting points
    console.log('🔧 Setting sequence starting points...');
    
    // Set slideshow sequence to start at 1,000,000
    const currentSlideshowMax = Math.max(slideshowMax + 1000000, 1000000);
    await client.query(`SELECT setval('slideshows_id_seq', $1, false)`, [currentSlideshowMax]);
    console.log(`Set slideshow sequence to start at ${currentSlideshowMax}`);
    
    // Ensure playlist sequence doesn't exceed 999,999
    if (playlistMax >= 999999) {
      throw new Error('Playlist IDs are approaching reserved slideshow range. Manual intervention required.');
    }
    
    // Add constraints to prevent future conflicts
    console.log('🔒 Adding ID range constraints...');
    
    try {
      await client.query('ALTER TABLE playlists ADD CONSTRAINT check_playlist_id_range CHECK (id < 1000000)');
      console.log('✅ Added playlist ID range constraint');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  Playlist ID range constraint already exists');
      } else {
        throw error;
      }
    }
    
    try {
      await client.query('ALTER TABLE slideshows ADD CONSTRAINT check_slideshow_id_range CHECK (id >= 1000000)');
      console.log('✅ Added slideshow ID range constraint');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  Slideshow ID range constraint already exists');
      } else {
        throw error;
      }
    }
    
    // Create helper function
    await client.query(`
      CREATE OR REPLACE FUNCTION get_content_type_by_id(content_id INTEGER)
      RETURNS TEXT AS $$
      BEGIN
        IF content_id < 1000000 THEN
          RETURN 'playlist';
        ELSE
          RETURN 'slideshow';
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created content type detection function');
    
    // Add table comments
    await client.query("COMMENT ON TABLE playlists IS 'Playlist table - IDs range from 1 to 999,999'");
    await client.query("COMMENT ON TABLE slideshows IS 'Slideshow table - IDs range from 1,000,000 and above'");
    
    // Final verification
    console.log('🔍 Final verification...');
    
    const finalPlaylistStats = await client.query(
      'SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as count FROM playlists'
    );
    const finalSlideshowStats = await client.query(
      'SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as count FROM slideshows'
    );
    
    console.log('Final Playlists:', finalPlaylistStats.rows[0]);
    console.log('Final Slideshows:', finalSlideshowStats.rows[0]);
    
    // Check sequences
    const playlistSeq = await client.query('SELECT last_value FROM playlists_id_seq');
    const slideshowSeq = await client.query('SELECT last_value FROM slideshows_id_seq');
    
    console.log('Playlist sequence last_value:', playlistSeq.rows[0].last_value);
    console.log('Slideshow sequence last_value:', slideshowSeq.rows[0].last_value);
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('✅ ID range migration completed successfully!');
    console.log('📋 Summary:');
    console.log('  - Playlists: IDs 1-999,999');
    console.log('  - Slideshows: IDs 1,000,000+');
    console.log('  - Constraints added to prevent future conflicts');
    console.log('  - Helper function created for content type detection');
    
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateIdRanges()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateIdRanges }; 