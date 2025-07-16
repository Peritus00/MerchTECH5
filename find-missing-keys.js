const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function findMissingS3Keys() {
  const client = await pool.connect();
  try {
    console.log('Searching for media files with missing s3_key...');

    const res = await client.query(
      `SELECT id, title, filename, url FROM media WHERE s3_key IS NULL OR s3_key = ''`
    );

    if (res.rows.length === 0) {
      console.log('No media files with missing S3 keys found. Your database is clean!');
      return;
    }

    console.log(`Found ${res.rows.length} records with missing s3_key:`);
    console.table(res.rows);

  } catch (e) {
    console.error('Failed to find missing S3 keys.', e);
  } finally {
    client.release();
    pool.end();
  }
}

findMissingS3Keys(); 