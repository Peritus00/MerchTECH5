#!/usr/bin/env node
/**
 * Schema checker for qr_scans
 * - Prints presence of critical columns for city/region analytics
 * - Exits with code 0 regardless (read-only health check)
 */

require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set. Create a .env file or export the variable.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
    max: 2,
  });

  const needed = [
    'city',
    'region',
    'user_provided_city',
    'user_provided_state',
    'user_provided_zip',
    'location_source',
    'visitor_id',
    'qr_visitor_id',
  ];

  try {
    console.log('🔎 Checking qr_scans schema...');
    const res = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_name = 'qr_scans'
          AND column_name = ANY($1::text[])
        ORDER BY column_name`,
      [needed]
    );

    const have = new Set(res.rows.map(r => r.column_name));
    const missing = needed.filter(n => !have.has(n));

    console.log('\n📋 Columns present:');
    for (const name of needed) {
      console.log(` - ${name}: ${have.has(name) ? '✅' : '❌'}`);
    }

    if (missing.length === 0) {
      console.log('\n✅ Schema looks good. City/region can be persisted.');
    } else {
      console.log('\n⚠️  Missing columns detected:', missing.join(', '));
      console.log('   Run: npm run db:geo-migrations');
    }
  } catch (e) {
    console.error('❌ Failed to check schema:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();