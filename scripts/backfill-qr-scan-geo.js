#!/usr/bin/env node
/**
 * Backfill geo fields (country_code, region, city) on qr_scans
 * where ip_address is present and geo is null.
 *
 * Safe to run multiple times (idempotent). Uses geoip-lite locally.
 */

const { Pool } = require('pg');
let geoip;
try { geoip = require('geoip-lite'); } catch (_) { geoip = null; }

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Aborting.');
  process.exit(1);
}

if (!geoip) {
  console.error('❌ geoip-lite not installed. Run: npm install geoip-lite');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function backfillBatch(limit = 500) {
  const client = await pool.connect();
  try {
    const sel = await client.query(
      `SELECT id, ip_address FROM qr_scans
       WHERE ip_address IS NOT NULL
         AND (country_code IS NULL OR country_code = '')
         AND (city IS NULL OR city = '')
       ORDER BY id ASC
       LIMIT $1`,
      [limit]
    );

    if (sel.rowCount === 0) return 0;

    let updated = 0;
    for (const row of sel.rows) {
      const ip = row.ip_address;
      const r = ip ? geoip.lookup(ip) : null;
      const country = r?.country || null;
      const region = r?.region || null;
      const city = r?.city || null;
      if (!country && !region && !city) continue;
      await client.query(
        `UPDATE qr_scans
         SET country_code = COALESCE($2, country_code),
             region = COALESCE($3, region),
             city = COALESCE($4, city)
         WHERE id = $1`,
        [row.id, country, region, city]
      );
      updated++;
    }
    return updated;
  } finally {
    client.release();
  }
}

(async () => {
  console.log('🌍 Starting QR scan geo backfill...');
  let total = 0;
  while (true) {
    const n = await backfillBatch(500);
    if (n === 0) break;
    total += n;
    console.log(`✅ Updated ${n} rows (cumulative ${total})...`);
  }
  console.log(`🎉 Backfill complete. Total rows updated: ${total}`);
  await pool.end();
})().catch(async (e) => {
  console.error('❌ Backfill failed:', e);
  await pool.end();
  process.exit(1);
});


