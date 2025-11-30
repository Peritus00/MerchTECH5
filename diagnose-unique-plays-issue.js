/**
 * Diagnostic script to investigate unique plays discrepancy
 * Checks actual data in media_plays table and identifies issues
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function diagnoseUniquePlaysIssue() {
  try {
    console.log('🔍 Diagnosing Unique Plays Issue...\n');

    // 1. Check total plays count
    const totalPlays = await pool.query('SELECT COUNT(*) as count FROM media_plays');
    console.log(`📊 Total records in media_plays: ${totalPlays.rows[0].count}\n`);

    // 2. Check plays by duration
    const playsByDuration = await pool.query(`
      SELECT 
        CASE 
          WHEN play_duration < 30 THEN '< 30s'
          WHEN play_duration = 30 THEN '= 30s'
          WHEN play_duration > 30 THEN '> 30s'
        END as duration_category,
        COUNT(*) as count
      FROM media_plays
      GROUP BY duration_category
      ORDER BY duration_category
    `);
    
    console.log('📈 Plays by Duration Category:');
    playsByDuration.rows.forEach(row => {
      console.log(`   ${row.duration_category}: ${row.count} plays`);
    });
    console.log('');

    // 3. Check all plays with their details
    const allPlays = await pool.query(`
      SELECT 
        mp.id,
        mp.media_id,
        m.title as media_title,
        mp.user_id,
        mp.session_id,
        mp.play_duration,
        mp.played_at,
        CASE 
          WHEN mp.play_duration >= 30 THEN 'YES'
          ELSE 'NO'
        END as should_be_unique,
        CASE 
          WHEN mp.play_duration > 30 THEN 'YES'
          ELSE 'NO'
        END as current_query_would_count
      FROM media_plays mp
      LEFT JOIN media m ON mp.media_id = m.id
      ORDER BY mp.played_at DESC
      LIMIT 20
    `);

    console.log('📝 Recent Play Records (last 20):');
    if (allPlays.rows.length === 0) {
      console.log('   ⚠️  NO PLAY RECORDS FOUND!');
    } else {
      allPlays.rows.forEach((row, index) => {
        console.log(`\n   ${index + 1}. Media: ${row.media_title || 'Unknown'} (ID: ${row.media_id})`);
        console.log(`      Duration: ${row.play_duration}s`);
        console.log(`      User ID: ${row.user_id || 'NULL'}`);
        console.log(`      Session ID: ${row.session_id?.substring(0, 20)}...`);
        console.log(`      Played at: ${row.played_at}`);
        console.log(`      Should be unique (>=30s): ${row.should_be_unique}`);
        console.log(`      Current query counts (>30s): ${row.current_query_would_count}`);
      });
    }
    console.log('');

    // 4. Check unique plays calculation with current logic (> 30)
    const currentUniquePlays = await pool.query(`
      SELECT COUNT(DISTINCT mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id)) as unique_plays
      FROM media_plays mp
      WHERE mp.play_duration > 30
    `);

    // 5. Check unique plays with >= 30 logic
    const fixedUniquePlays = await pool.query(`
      SELECT COUNT(DISTINCT mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id)) as unique_plays
      FROM media_plays mp
      WHERE mp.play_duration >= 30
    `);

    console.log('🔢 Unique Plays Calculation:');
    console.log(`   Current query (> 30s): ${currentUniquePlays.rows[0].unique_plays}`);
    console.log(`   Fixed query (>= 30s): ${fixedUniquePlays.rows[0].unique_plays}`);
    console.log(`   Difference: ${fixedUniquePlays.rows[0].unique_plays - currentUniquePlays.rows[0].unique_plays}`);
    console.log('');

    // 6. Check plays that are exactly 30 seconds
    const exactly30Plays = await pool.query(`
      SELECT 
        mp.id,
        mp.media_id,
        m.title,
        mp.user_id,
        mp.session_id,
        mp.play_duration,
        mp.played_at
      FROM media_plays mp
      LEFT JOIN media m ON mp.media_id = m.id
      WHERE mp.play_duration = 30
      ORDER BY mp.played_at DESC
    `);

    console.log(`🎯 Plays with exactly 30 seconds duration: ${exactly30Plays.rows.length}`);
    if (exactly30Plays.rows.length > 0) {
      console.log('   These plays are NOT being counted as unique with current query (> 30):');
      exactly30Plays.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.title || 'Unknown'} - Session: ${row.session_id?.substring(0, 20)}...`);
      });
    }
    console.log('');

    // 7. Check for user_id vs session_id consistency
    const userSessionCheck = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE user_id IS NOT NULL) as with_user_id,
        COUNT(*) FILTER (WHERE user_id IS NULL) as without_user_id,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_user_ids,
        COUNT(DISTINCT session_id) as unique_session_ids
      FROM media_plays
    `);

    console.log('👤 User ID vs Session ID Usage:');
    console.log(`   Plays with user_id: ${userSessionCheck.rows[0].with_user_id}`);
    console.log(`   Plays without user_id: ${userSessionCheck.rows[0].without_user_id}`);
    console.log(`   Unique user_ids: ${userSessionCheck.rows[0].unique_user_ids}`);
    console.log(`   Unique session_ids: ${userSessionCheck.rows[0].unique_session_ids}`);
    console.log('');

    // 8. Check per-media-item stats
    const mediaStats = await pool.query(`
      SELECT 
        m.id,
        m.title,
        COUNT(mp.id) as total_plays,
        COUNT(mp.id) FILTER (WHERE mp.play_duration >= 30) as plays_30plus,
        COUNT(mp.id) FILTER (WHERE mp.play_duration > 30) as plays_over_30,
        COUNT(DISTINCT CASE 
          WHEN mp.play_duration >= 30 
          THEN mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id) 
        END) as unique_plays_fixed,
        COUNT(DISTINCT CASE 
          WHEN mp.play_duration > 30 
          THEN mp.media_id || '|' || COALESCE(mp.user_id::text, mp.session_id) 
        END) as unique_plays_current
      FROM media m
      LEFT JOIN media_plays mp ON m.id = mp.media_id
      GROUP BY m.id, m.title
      HAVING COUNT(mp.id) > 0
      ORDER BY total_plays DESC
      LIMIT 10
    `);

    console.log('📊 Per-Media-Item Stats:');
    mediaStats.rows.forEach((row) => {
      console.log(`\n   ${row.title || 'Untitled'} (ID: ${row.id}):`);
      console.log(`      Total Plays: ${row.total_plays}`);
      console.log(`      Plays >= 30s: ${row.plays_30plus}`);
      console.log(`      Plays > 30s: ${row.plays_over_30}`);
      console.log(`      Unique Plays (>=30): ${row.unique_plays_fixed}`);
      console.log(`      Unique Plays (>30): ${row.unique_plays_current}`);
    });

  } catch (error) {
    console.error('❌ Error diagnosing issue:', error);
  } finally {
    await pool.end();
  }
}

diagnoseUniquePlaysIssue();

