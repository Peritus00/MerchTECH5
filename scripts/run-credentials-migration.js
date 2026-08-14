#!/usr/bin/env node
/**
 * Run migration 049_credentials.sql
 * Creates credential_templates, credentials, and photo_deletion_audit tables.
 * Also adds credential_template_id FK to access_levels.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/049_credentials.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 049_credentials.sql');
    await pool.query(sql);
    console.log('✅ Migration 049 completed successfully');

    const tables = ['credential_templates', 'credentials', 'photo_deletion_audit'];
    for (const table of tables) {
      const check = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [table]);
      console.log(`   ${check.rows.length > 0 ? '✓' : '✗'} Table ${table}`);
    }

    const colCheck = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='access_levels' AND column_name='credential_template_id'
    `);
    console.log(`   ${colCheck.rows.length > 0 ? '✓' : '✗'} Column access_levels.credential_template_id`);
  } catch (err) {
    console.error('❌ Migration 049 failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
