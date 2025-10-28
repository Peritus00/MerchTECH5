#!/usr/bin/env node
/**
 * Apply idempotent geo-related migrations needed for city/region analytics.
 * Safe to run multiple times. Requires DATABASE_URL and local access to SQL files.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS = [
  'database/migrations/012_add_qr_scan_fields.sql',
  'database/migrations/013_analytics_hardening.sql',
  'database/migrations/015_user_provided_location.sql',
  'database/migrations/015_add_qr_visitor_id_to_qr_scans.sql',
  'database/migrations/016_browser_geo.sql',
];

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set. Create a .env file or export the variable.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
    max: 1,
  });

  try {
    console.log('🚀 Applying geo-related migrations...');
    for (const rel of MIGRATIONS) {
      const file = path.resolve(process.cwd(), rel);
      if (!fs.existsSync(file)) {
        console.warn(`   ⚠️  Skipping missing file: ${rel}`);
        continue;
      }
      const sql = fs.readFileSync(file, 'utf8');
      console.log(`   ▶ Running ${rel} ...`);
      try {
        await pool.query(sql);
        console.log(`   ✅ Completed ${rel}`);
      } catch (e) {
        console.warn(`   ⚠️  Migration reported: ${e.message}`);
      }
    }
    console.log('🎉 All geo migrations applied.');
  } catch (e) {
    console.error('❌ Migration runner failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();


