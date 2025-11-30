/**
 * Script to check if we have actual data in media_plays table
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkMediaPlaysData() {
  try {
    console.log('🔍 Checking media_plays table data...\n');

    // Check total count
    const totalCount = await pool.query('SELECT COUNT(*) as count FROM media_plays');
    console.log(`Total records in media_plays: ${totalCount.rows[0].count}`);

    // Check plays per media item
    const playsPerMedia = await pool.query(`
      SELECT 
        m.id,
        m.title,
        COUNT(mp.id) as play_count,
        COUNT(DISTINCT COALESCE(mp.user_id::text, mp.session_id)) as unique_plays
      FROM media m
      LEFT JOIN media_plays mp ON m.id = mp.media_id
      GROUP BY m.id, m.title
      ORDER BY play_count DESC
      LIMIT 10
    `);

    console.log('\n📊 Plays per media item:');
    playsPerMedia.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.title || 'Untitled'} (ID: ${row.id})`);
      console.log(`   Total Plays: ${row.play_count}`);
      console.log(`   Unique Plays: ${row.unique_plays}`);
      console.log('');
    });

    // Check sample of actual play records
    const samplePlays = await pool.query(`
      SELECT 
        mp.id,
        mp.media_id,
        m.title,
        mp.session_id,
        mp.play_duration,
        mp.played_at
      FROM media_plays mp
      JOIN media m ON mp.media_id = m.id
      ORDER BY mp.played_at DESC
      LIMIT 5
    `);

    console.log('📝 Sample play records:');
    if (samplePlays.rows.length === 0) {
      console.log('   ⚠️  NO PLAY RECORDS FOUND!');
      console.log('   This means media plays are not being tracked.');
    } else {
      samplePlays.rows.forEach((row) => {
        console.log(`   - Media: ${row.title} (ID: ${row.media_id})`);
        console.log(`     Session: ${row.session_id}`);
        console.log(`     Duration: ${row.play_duration}s`);
        console.log(`     Played at: ${row.played_at}`);
        console.log('');
      });
    }

    // Check if aggregate columns match actual counts
    const aggregateCheck = await pool.query(`
      SELECT 
        m.id,
        m.title,
        m.total_plays as aggregate_total,
        m.unique_plays as aggregate_unique,
        COUNT(mp.id) as actual_total,
        COUNT(DISTINCT COALESCE(mp.user_id::text, mp.session_id)) as actual_unique
      FROM media m
      LEFT JOIN media_plays mp ON m.id = mp.media_id
      GROUP BY m.id, m.title, m.total_plays, m.unique_plays
      HAVING m.total_plays != COUNT(mp.id) OR m.unique_plays != COUNT(DISTINCT COALESCE(mp.user_id::text, mp.session_id))
      LIMIT 5
    `);

    if (aggregateCheck.rows.length > 0) {
      console.log('⚠️  Mismatch between aggregate columns and actual counts:');
      aggregateCheck.rows.forEach((row) => {
        console.log(`   Media: ${row.title}`);
        console.log(`     Aggregate total: ${row.aggregate_total}, Actual: ${row.actual_total}`);
        console.log(`     Aggregate unique: ${row.aggregate_unique}, Actual: ${row.actual_unique}`);
      });
    } else {
      console.log('✅ Aggregate columns match actual counts (or no data)');
    }

  } catch (error) {
    console.error('❌ Error checking data:', error);
  } finally {
    await pool.end();
  }
}

checkMediaPlaysData();

