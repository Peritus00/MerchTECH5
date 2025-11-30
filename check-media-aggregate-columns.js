/**
 * Check if media table has aggregate columns with values
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkMediaAggregates() {
  try {
    console.log('🔍 Checking media table aggregate columns...\n');

    // Check media table for aggregate values
    const mediaWithAggregates = await pool.query(`
      SELECT 
        id,
        title,
        total_plays,
        unique_plays,
        created_at
      FROM media
      WHERE total_plays > 0 OR unique_plays > 0
      ORDER BY total_plays DESC
      LIMIT 10
    `);

    console.log('📊 Media items with non-zero aggregate values:');
    if (mediaWithAggregates.rows.length === 0) {
      console.log('   None found - all are 0');
    } else {
      mediaWithAggregates.rows.forEach((row) => {
        console.log(`   ${row.title || 'Untitled'} (ID: ${row.id})`);
        console.log(`     total_plays: ${row.total_plays}`);
        console.log(`     unique_plays: ${row.unique_plays}`);
        console.log(`     created_at: ${row.created_at}`);
        console.log('');
      });
    }

    // Check all media to see what values they have
    const allMedia = await pool.query(`
      SELECT 
        id,
        title,
        total_plays,
        unique_plays
      FROM media
      ORDER BY id DESC
      LIMIT 10
    `);

    console.log('\n📋 Sample of all media:');
    allMedia.rows.forEach((row) => {
      console.log(`   ${row.title || 'Untitled'} (ID: ${row.id})`);
      console.log(`     total_plays: ${row.total_plays}, unique_plays: ${row.unique_plays}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkMediaAggregates();

