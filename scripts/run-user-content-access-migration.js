#!/usr/bin/env node
/**
 * Run migration 046_user_content_access.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sqlPath = path.join(
    __dirname,
    '../database/migrations/046_user_content_access.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('📝 Running migration: 046_user_content_access.sql');
  await pool.query(sql);
  console.log('✅ Migration complete');
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
