/**
 * Check media table aggregate columns to see if plays are stored there
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkMediaAggregates() {
  try {
    console.log('🔍 Checking Media Table Aggregates...\n');

    // Check media table structure and aggregate columns
    const mediaStats = await pool.query(`
      SELECT 
        id,
        title,
        total_plays,
        unique_plays,
        file_type
      FROM media
      WHERE total_plays > 0 OR unique_plays > 0
      ORDER BY total_plays DESC
      LIMIT 20
    `);

    console.log(`📊 Media items with play counts: ${mediaStats.rows.length}\n`);
    
    if (mediaStats.rows.length > 0) {
      console.log('Media Items with Play Counts:');
      mediaStats.rows.forEach((row, index) => {
        console.log(`\n   ${index + 1}. ${row.title || 'Untitled'} (ID: ${row.id})`);
        console.log(`      Total Plays: ${row.total_plays}`);
        console.log(`      Unique Plays: ${row.unique_plays}`);
        console.log(`      Type: ${row.file_type}`);
      });
    } else {
      console.log('   No media items with play counts found.');
    }

    // Sum up total plays
    const totalSum = await pool.query(`
      SELECT 
        SUM(total_plays) as total_plays_sum,
        SUM(unique_plays) as unique_plays_sum,
        COUNT(*) FILTER (WHERE total_plays > 0) as media_with_plays
      FROM media
    `);

    console.log('\n📈 Aggregate Totals:');
    console.log(`   Sum of total_plays across all media: ${totalSum.rows[0].total_plays_sum || 0}`);
    console.log(`   Sum of unique_plays across all media: ${totalSum.rows[0].unique_plays_sum || 0}`);
    console.log(`   Media items with plays: ${totalSum.rows[0].media_with_plays}`);

  } catch (error) {
    console.error('❌ Error checking aggregates:', error);
  } finally {
    await pool.end();
  }
}

checkMediaAggregates();

