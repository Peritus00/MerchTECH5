
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function fixS3Keys() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Searching for media files with incorrect "att." prefix in s3_key...');

    const res = await client.query(
      `SELECT id, s3_key FROM media WHERE s3_key LIKE 'att.%'`
    );

    if (res.rows.length === 0) {
      console.log('No incorrect S3 keys found. Your database is clean!');
      return;
    }

    console.log(`Found ${res.rows.length} records to fix.`);

    for (const row of res.rows) {
      const originalKey = row.s3_key;
      const correctedKey = originalKey.replace(/^att\./, '');
      console.log(`Fixing ID ${row.id}: "${originalKey}" -> "${correctedKey}"`);
      await client.query(
        'UPDATE media SET s3_key = $1 WHERE id = $2',
        [correctedKey, row.id]
      );
    }

    await client.query('COMMIT');
    console.log('Successfully updated all incorrect S3 keys.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to fix S3 keys. Rolled back changes.', e);
  } finally {
    client.release();
    pool.end();
  }
}

fixS3Keys(); 