#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixActivationCodeLinkage() {
  try {
    console.log('🔍 Investigating activation code KCCISPOYSQSB...');
    
    // 1. Check current activation code linkage
    const codeResult = await pool.query(
      'SELECT * FROM activation_codes WHERE code = $1',
      ['KCCISPOYSQSB']
    );
    
    if (codeResult.rows.length === 0) {
      console.log('❌ Activation code KCCISPOYSQSB not found');
      return;
    }
    
    const activationCode = codeResult.rows[0];
    console.log('🔑 Current activation code details:');
    console.log('  Code:', activationCode.code);
    console.log('  Slideshow ID:', activationCode.slideshow_id);
    console.log('  Playlist ID:', activationCode.playlist_id);
    console.log('  Max Uses:', activationCode.max_uses);
    console.log('  Uses Count:', activationCode.uses_count);
    
    // 2. Check what slideshow it's currently linked to
    if (activationCode.slideshow_id) {
      const currentSlideshowResult = await pool.query(
        'SELECT * FROM slideshows WHERE id = $1',
        [activationCode.slideshow_id]
      );
      
      if (currentSlideshowResult.rows.length > 0) {
        const currentSlideshow = currentSlideshowResult.rows[0];
        console.log('📽️ Currently linked to slideshow:');
        console.log('  ID:', currentSlideshow.id);
        console.log('  Name:', currentSlideshow.name);
        console.log('  User ID:', currentSlideshow.user_id);
        
        // Check images for current slideshow
        const currentImagesResult = await pool.query(
          'SELECT COUNT(*) as image_count FROM slideshow_images WHERE slideshow_id = $1',
          [currentSlideshow.id]
        );
        console.log('  Images:', currentImagesResult.rows[0].image_count);
      }
    }
    
    // 3. Find the "DJKINGCAKE CHAIN" slideshow
    const targetSlideshowResult = await pool.query(
      'SELECT * FROM slideshows WHERE name ILIKE $1',
      ['%DJKINGCAKE CHAIN%']
    );
    
    if (targetSlideshowResult.rows.length === 0) {
      console.log('❌ DJKINGCAKE CHAIN slideshow not found');
      return;
    }
    
    const targetSlideshow = targetSlideshowResult.rows[0];
    console.log('🎯 Target slideshow found:');
    console.log('  ID:', targetSlideshow.id);
    console.log('  Name:', targetSlideshow.name);
    console.log('  User ID:', targetSlideshow.user_id);
    
    // Check images for target slideshow
    const targetImagesResult = await pool.query(
      'SELECT COUNT(*) as image_count FROM slideshow_images WHERE slideshow_id = $1',
      [targetSlideshow.id]
    );
    console.log('  Images:', targetImagesResult.rows[0].image_count);
    
    // 4. Fix the linkage if needed
    if (activationCode.slideshow_id !== targetSlideshow.id) {
      console.log('🔧 Fixing activation code linkage...');
      console.log(`   Changing from slideshow ${activationCode.slideshow_id} to ${targetSlideshow.id}`);
      
      const updateResult = await pool.query(
        'UPDATE activation_codes SET slideshow_id = $1 WHERE code = $2 RETURNING *',
        [targetSlideshow.id, 'KCCISPOYSQSB']
      );
      
      if (updateResult.rows.length > 0) {
        console.log('✅ Activation code updated successfully!');
        console.log('🎉 Code KCCISPOYSQSB now points to:', targetSlideshow.name);
      } else {
        console.log('❌ Failed to update activation code');
      }
    } else {
      console.log('✅ Activation code is already linked to the correct slideshow');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  fixActivationCodeLinkage();
}

module.exports = { fixActivationCodeLinkage };
