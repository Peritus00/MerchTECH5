#!/usr/bin/env node
/**
 * Run migration 039_add_playlist_media_schedule.sql
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/039_add_playlist_media_schedule.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 039_add_playlist_media_schedule.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
    const verify = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'playlist_media'
        AND column_name IN (
          'schedule_enabled',
          'schedule_start_date',
          'schedule_end_date',
          'schedule_exact_dates',
          'schedule_recurring_rules'
        )
      ORDER BY column_name
    `);
    console.log('   Columns present:', verify.rows.map((r) => r.column_name).join(', '));
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
