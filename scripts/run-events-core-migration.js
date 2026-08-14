#!/usr/bin/env node
/**
 * Run migration 047_events_core.sql
 * Creates events, event_days, event_zones, access_levels, access_level_zone_tokens,
 * event_staff, and event_signing_keys tables.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/047_events_core.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 047_events_core.sql');
    await pool.query(sql);
    console.log('✅ Migration 047 completed successfully');

    const tables = ['events', 'event_days', 'event_zones', 'access_levels', 'access_level_zone_tokens', 'event_staff', 'event_signing_keys'];
    for (const table of tables) {
      const check = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [table]);
      console.log(`   ${check.rows.length > 0 ? '✓' : '✗'} Table ${table}`);
    }
  } catch (err) {
    console.error('❌ Migration 047 failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
