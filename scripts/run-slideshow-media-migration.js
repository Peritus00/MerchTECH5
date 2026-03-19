#!/usr/bin/env node
/**
 * Run migration 036_add_slideshow_media_link.sql
 * Adds slideshow_id to media table for slideshow-as-media-item support
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/036_add_slideshow_media_link.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 036_add_slideshow_media_link.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
    const verify = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'media' AND column_name = 'slideshow_id'
    `);
    if (verify.rows.length > 0) {
      console.log('   Column slideshow_id added to media');
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
