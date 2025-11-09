#!/usr/bin/env node
/**
 * Diagnostic script to investigate why media plays aren't showing up
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function diagnose() {
  try {
    console.log('🔍 Diagnosing media plays issue...\n');

    // 1. Check if constraint still exists
    console.log('1️⃣ Checking if play_duration constraint exists...');
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'media_plays' 
      AND constraint_name = 'media_plays_duration_check'
    `);
    
    if (constraintCheck.rows.length > 0) {
      console.log('   ❌ CONSTRAINT STILL EXISTS! This is blocking plays < 30 seconds.');
      console.log('   ⚠️  You need to run the migration: node scripts/remove-play-duration-constraint.js');
    } else {
      console.log('   ✅ Constraint has been removed');
    }

    // 2. Check total plays count
    console.log('\n2️⃣ Checking media_plays table...');
    const totalCount = await pool.query('SELECT COUNT(*) as count FROM media_plays');
    console.log(`   Total play records: ${totalCount.rows[0].count}`);

    // 3. Find the specific media item "icedoutbass"
    console.log('\n3️⃣ Searching for "icedoutbass" media item...');
    const mediaSearch = await pool.query(`
      SELECT id, title, filename, user_id, total_plays, unique_plays
      FROM media 
      WHERE LOWER(title) LIKE '%icedout%' 
         OR LOWER(filename) LIKE '%icedout%'
         OR LOWER(title) LIKE '%iced%'
      ORDER BY id DESC
    `);
    
    if (mediaSearch.rows.length === 0) {
      console.log('   ⚠️  No media item found matching "icedoutbass"');
      console.log('   Let me check all media items...');
      const allMedia = await pool.query(`
        SELECT id, title, filename, user_id 
        FROM media 
        ORDER BY id DESC 
        LIMIT 10
      `);
      console.log('   Recent media items:');
      allMedia.rows.forEach(m => {
        console.log(`      - ID: ${m.id}, Title: ${m.title || 'Untitled'}, Filename: ${m.filename || 'N/A'}`);
      });
    } else {
      mediaSearch.rows.forEach(media => {
        console.log(`   ✅ Found: "${media.title || media.filename}" (ID: ${media.id}, User: ${media.user_id})`);
        console.log(`      Aggregate stats - Total: ${media.total_plays || 0}, Unique: ${media.unique_plays || 0}`);
      });
    }

    // 4. Check plays for the found media item(s)
    if (mediaSearch.rows.length > 0) {
      console.log('\n4️⃣ Checking actual play records...');
      for (const media of mediaSearch.rows) {
        const plays = await pool.query(`
          SELECT 
            mp.id,
            mp.play_duration,
            mp.played_at,
            mp.session_id,
            mp.user_id
          FROM media_plays mp
          WHERE mp.media_id = $1
          ORDER BY mp.played_at DESC
          LIMIT 10
        `, [media.id]);

        console.log(`   Media ID ${media.id} ("${media.title || media.filename}"):`);
        if (plays.rows.length === 0) {
          console.log('      ⚠️  NO PLAY RECORDS FOUND!');
          console.log('      This means plays are not being tracked for this media item.');
        } else {
          console.log(`      Found ${plays.rows.length} play record(s):`);
          plays.rows.forEach(play => {
            console.log(`         - Duration: ${play.play_duration}s, Played at: ${play.played_at}, Session: ${play.session_id?.substring(0, 20)}...`);
          });
        }

        // Check actual count vs aggregate
        const actualCounts = await pool.query(`
          SELECT 
            COUNT(mp.id) as total_plays,
            COUNT(DISTINCT CASE 
              WHEN mp.play_duration > 30 
              THEN mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id) 
            END) as unique_plays
          FROM media_plays mp
          WHERE mp.media_id = $1
        `, [media.id]);
        
        const actualTotal = parseInt(actualCounts.rows[0]?.total_plays || 0);
        const actualUnique = parseInt(actualCounts.rows[0]?.unique_plays || 0);
        
        console.log(`      Actual counts - Total: ${actualTotal}, Unique: ${actualUnique}`);
        console.log(`      Aggregate counts - Total: ${media.total_plays || 0}, Unique: ${media.unique_plays || 0}`);
        
        if (actualTotal !== (media.total_plays || 0)) {
          console.log(`      ⚠️  MISMATCH: Aggregate total_plays doesn't match actual count!`);
        }
      }
    }

    // 5. Check recent plays across all media
    console.log('\n5️⃣ Checking most recent plays (all media)...');
    const recentPlays = await pool.query(`
      SELECT 
        mp.id,
        mp.media_id,
        m.title,
        mp.play_duration,
        mp.played_at,
        mp.session_id
      FROM media_plays mp
      JOIN media m ON mp.media_id = m.id
      ORDER BY mp.played_at DESC
      LIMIT 5
    `);

    if (recentPlays.rows.length === 0) {
      console.log('   ⚠️  NO RECENT PLAYS FOUND AT ALL!');
      console.log('   This suggests plays are not being tracked at all.');
    } else {
      console.log('   Recent plays:');
      recentPlays.rows.forEach(play => {
        console.log(`      - "${play.title || 'Untitled'}" (ID: ${play.media_id}): ${play.play_duration}s at ${play.played_at}`);
      });
    }

    // 6. Check for constraint violations in logs (if we had access)
    console.log('\n6️⃣ Recommendations:');
    if (constraintCheck.rows.length > 0) {
      console.log('   ❌ CRITICAL: Run migration to remove constraint:');
      console.log('      node scripts/remove-play-duration-constraint.js');
    }
    if (totalCount.rows[0].count === 0) {
      console.log('   ⚠️  No plays recorded at all. Check:');
      console.log('      - Is MediaPlayer component calling trackMediaPlay()?');
      console.log('      - Are there any errors in server logs?');
      console.log('      - Is the tracking endpoint accessible?');
    }
    if (mediaSearch.rows.length > 0 && recentPlays.rows.length === 0) {
      console.log('   ⚠️  Media item exists but no plays recorded. Check:');
      console.log('      - Browser console for tracking errors');
      console.log('      - Server logs for API errors');
      console.log('      - Network tab to see if /api/analytics/track-media-play is being called');
    }

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
  } finally {
    await pool.end();
  }
}

diagnose();

