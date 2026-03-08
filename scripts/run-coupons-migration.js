#!/usr/bin/env node
/**
 * Run migration 033_coupons_and_sms_gate.sql
 * Creates coupons, coupon_item_map, coupon_redemptions, marketing_sms_consents, marketing_sms_events, user_feature_settings, system_feature_settings
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/033_coupons_and_sms_gate.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 033_coupons_and_sms_gate.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
    const verify = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('coupons', 'marketing_sms_consents')`);
    console.log('   Tables created:', verify.rows.map(r => r.table_name).join(', '));
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
