const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function populateMissingS3Keys() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Searching for media files with missing s3_key...');

    const res = await client.query(
      `SELECT id, url FROM media WHERE (s3_key IS NULL OR s3_key = '') AND url LIKE '%amazonaws.com%'`
    );

    if (res.rows.length === 0) {
      console.log('No records to fix.');
      return;
    }

    console.log(`Found ${res.rows.length} records to fix.`);

    for (const row of res.rows) {
      const url = row.url;
      const keyMatch = url.match(/amazonaws.com\/(.*)/);
      if (keyMatch && keyMatch[1]) {
        const extractedKey = keyMatch[1];
        console.log(`Fixing ID ${row.id}: Found key "${extractedKey}"`);
        await client.query(
          'UPDATE media SET s3_key = $1 WHERE id = $2',
          [extractedKey, row.id]
        );
      } else {
        console.warn(`Could not extract key for ID ${row.id} from URL: ${url}`);
      }
    }

    await client.query('COMMIT');
    console.log('Successfully updated all records.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to populate S3 keys. Rolled back changes.', e);
  } finally {
    client.release();
    pool.end();
  }
}

populateMissingS3Keys(); 