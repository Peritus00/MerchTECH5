#!/usr/bin/env node
/**
 * Run migration 034_add_playlist_require_phone_for_preview.sql
 * Adds require_phone_for_preview column to playlists table for per-playlist preview gate
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/034_add_playlist_require_phone_for_preview.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 034_add_playlist_require_phone_for_preview.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
    const verify = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'playlists' AND column_name = 'require_phone_for_preview'
    `);
    if (verify.rows.length > 0) {
      console.log('   Column require_phone_for_preview added to playlists');
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
