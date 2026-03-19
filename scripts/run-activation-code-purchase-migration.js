#!/usr/bin/env node
/**
 * Run migration 035_add_activation_code_purchase.sql
 * Adds price_cents to activation_codes and activation_code_purchases table for Stripe fulfillment
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/035_add_activation_code_purchase.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 035_add_activation_code_purchase.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
    const verify = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'activation_codes' AND column_name = 'price_cents'
    `);
    if (verify.rows.length > 0) {
      console.log('   Column price_cents added to activation_codes');
    }
    const tableCheck = await pool.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'activation_code_purchases'
    `);
    if (tableCheck.rows.length > 0) {
      console.log('   Table activation_code_purchases created');
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
