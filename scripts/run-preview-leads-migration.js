#!/usr/bin/env node
/**
 * Run migration 040_preview_phone_leads_and_slideshow_phone_gate.sql
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(
      __dirname,
      '../database/migrations/040_preview_phone_leads_and_slideshow_phone_gate.sql'
    );
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 040_preview_phone_leads_and_slideshow_phone_gate.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
