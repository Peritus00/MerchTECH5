#!/usr/bin/env node
/**
 * Add the deduplication constraint that's missing in production
 */

require('dotenv').config();
const { Pool } = require('pg');

async function addConstraint() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Adding deduplication constraint...\n');

    // Check if constraint already exists
    const checkResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'qr_scans' 
        AND indexname LIKE '%dedupe%'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ Deduplication index already exists:');
      checkResult.rows.forEach(row => console.log(`   - ${row.indexname}`));
      await pool.end();
      return;
    }

    console.log('📝 Creating deduplication index...');
    
    // Use a simpler unique index that works on all Postgres versions
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_scans_minute_dedupe_simple
      ON qr_scans (
        qr_code_id, 
        visitor_id,
        EXTRACT(YEAR FROM scanned_at)::int,
        EXTRACT(MONTH FROM scanned_at)::int,
        EXTRACT(DAY FROM scanned_at)::int,
        EXTRACT(HOUR FROM scanned_at)::int,
        EXTRACT(MINUTE FROM scanned_at)::int
      )
      WHERE visitor_id IS NOT NULL
    `);

    console.log('✅ Deduplication index created successfully!');
    console.log('');
    console.log('This will prevent duplicate scans within the same minute.');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('   1. Scan a QR code again');
    console.log('   2. Run: node scripts/check-latest-scan.js');
    console.log('   3. City should now be captured!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nThis might be okay if the index already exists with a different name.');
    console.error('Check the error message above.');
  } finally {
    await pool.end();
  }
}

addConstraint();

