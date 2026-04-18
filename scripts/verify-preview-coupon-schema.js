#!/usr/bin/env node
/**
 * Verify DB schema needed for preview coupons, coupon maps, and activation codes.
 *
 * Usage (from repo root):
 *   DATABASE_URL="postgresql://..." node scripts/verify-preview-coupon-schema.js
 *
 * Or rely on .env:
 *   node scripts/verify-preview-coupon-schema.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const REQUIRED_TABLES = [
  'activation_codes',
  'coupon_item_map',
  'coupons',
  'coupon_redemptions',
  'marketing_sms_consents',
  'marketing_sms_events',
  'user_feature_settings',
  'system_feature_settings',
  'preview_phone_leads',
  'preview_phone_lead_events',
];

const REQUIRED_COLUMNS = [
  ['activation_codes', 'deleted_at'],
  ['coupon_item_map', 'coupon_id'],
  ['coupon_item_map', 'product_id'],
  ['coupon_item_map', 'playlist_id'],
  ['coupon_item_map', 'slideshow_id'],
  ['coupons', 'starts_at'],
  ['playlists', 'preview_coupon_id'],
  ['playlists', 'require_phone_for_preview'],
  ['slideshows', 'preview_coupon_id'],
  ['slideshows', 'require_phone_for_preview'],
];

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Export it or add to .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  let failed = false;
  try {
    console.log('🔍 Verifying schema (public)…\n');

    for (const t of REQUIRED_TABLES) {
      const ok = await tableExists(client, t);
      const label = ok ? '✅' : '❌';
      console.log(`${label} table  public.${t}`);
      if (!ok) failed = true;
    }

    console.log('');
    for (const [table, col] of REQUIRED_COLUMNS) {
      const ok = await columnExists(client, table, col);
      const label = ok ? '✅' : '❌';
      console.log(`${label} column public.${table}.${col}`);
      if (!ok) failed = true;
    }

    console.log('');
    if (failed) {
      console.log('❌ Some checks failed. Fix with migrations under database/migrations/ (028, 033, 034, 037, 038) or repair ALTERs.');
      process.exitCode = 1;
    } else {
      console.log('✅ All preview/coupon schema checks passed.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
