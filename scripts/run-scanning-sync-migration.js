#!/usr/bin/env node
/**
 * Run migration 050_scanning_and_sync.sql
 * Creates scanner_devices, scan_events, ticket_zone_state,
 * ticket_provider_connections, ticket_provider_type_map, and ticket_sync_runs tables.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/050_scanning_and_sync.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 050_scanning_and_sync.sql');
    await pool.query(sql);
    console.log('✅ Migration 050 completed successfully');

    const tables = ['scanner_devices', 'scan_events', 'ticket_zone_state', 'ticket_provider_connections', 'ticket_provider_type_map', 'ticket_sync_runs'];
    for (const table of tables) {
      const check = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [table]);
      console.log(`   ${check.rows.length > 0 ? '✓' : '✗'} Table ${table}`);
    }
  } catch (err) {
    console.error('❌ Migration 050 failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
