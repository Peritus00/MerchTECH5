#!/usr/bin/env node
/**
 * Backfill geographic fields (city, state) on media_plays, playlist_plays, and slideshow_plays
 * where ip_address is present and location is null.
 * 
 * Safe to run multiple times (idempotent). Uses geoip-lite locally.
 */

require('dotenv').config();
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

async function backfillMediaPlays(limit = 500) {
  const client = await pool.connect();
  try {
    const sel = await client.query(
      `SELECT id, ip_address FROM media_plays
       WHERE ip_address IS NOT NULL
         AND user_provided_city IS NULL
       ORDER BY id ASC
       LIMIT $1`,
      [limit]
    );

    if (sel.rowCount === 0) return 0;

    let updated = 0;
    for (const row of sel.rows) {
      const ip = row.ip_address;
      const r = ip ? geoip.lookup(ip) : null;
      const region = r?.region || null;
      const city = r?.city || null;
      if (!region && !city) continue;
      
      await client.query(
        `UPDATE media_plays
         SET user_provided_city = COALESCE(user_provided_city, $2),
             user_provided_state = COALESCE(user_provided_state, $3),
             location_source = COALESCE(location_source, 'auto')
         WHERE id = $1
           AND user_provided_city IS NULL`,
        [row.id, city, region]
      );
      updated++;
    }
    return updated;
  } finally {
    client.release();
  }
}

async function backfillPlaylistPlays(limit = 500) {
  const client = await pool.connect();
  try {
    const sel = await client.query(
      `SELECT id, ip_address FROM playlist_plays
       WHERE ip_address IS NOT NULL
         AND user_provided_city IS NULL
       ORDER BY id ASC
       LIMIT $1`,
      [limit]
    );

    if (sel.rowCount === 0) return 0;

    let updated = 0;
    for (const row of sel.rows) {
      const ip = row.ip_address;
      const r = ip ? geoip.lookup(ip) : null;
      const region = r?.region || null;
      const city = r?.city || null;
      if (!region && !city) continue;
      
      await client.query(
        `UPDATE playlist_plays
         SET user_provided_city = COALESCE(user_provided_city, $2),
             user_provided_state = COALESCE(user_provided_state, $3),
             location_source = COALESCE(location_source, 'auto')
         WHERE id = $1
           AND user_provided_city IS NULL`,
        [row.id, city, region]
      );
      updated++;
    }
    return updated;
  } finally {
    client.release();
  }
}

async function backfillSlideshowPlays(limit = 500) {
  const client = await pool.connect();
  try {
    const sel = await client.query(
      `SELECT id, ip_address FROM slideshow_plays
       WHERE ip_address IS NOT NULL
         AND user_provided_city IS NULL
       ORDER BY id ASC
       LIMIT $1`,
      [limit]
    );

    if (sel.rowCount === 0) return 0;

    let updated = 0;
    for (const row of sel.rows) {
      const ip = row.ip_address;
      const r = ip ? geoip.lookup(ip) : null;
      const region = r?.region || null;
      const city = r?.city || null;
      if (!region && !city) continue;
      
      await client.query(
        `UPDATE slideshow_plays
         SET user_provided_city = COALESCE(user_provided_city, $2),
             user_provided_state = COALESCE(user_provided_state, $3),
             location_source = COALESCE(location_source, 'auto')
         WHERE id = $1
           AND user_provided_city IS NULL`,
        [row.id, city, region]
      );
      updated++;
    }
    return updated;
  } finally {
    client.release();
  }
}

(async () => {
  console.log('🌍 Starting media plays geo backfill...');
  
  // Backfill media_plays
  console.log('\n📊 Backfilling media_plays...');
  let totalMedia = 0;
  while (true) {
    const n = await backfillMediaPlays(500);
    if (n === 0) break;
    totalMedia += n;
    console.log(`✅ Updated ${n} media_plays rows (cumulative ${totalMedia})...`);
  }
  
  // Backfill playlist_plays
  console.log('\n📊 Backfilling playlist_plays...');
  let totalPlaylist = 0;
  while (true) {
    const n = await backfillPlaylistPlays(500);
    if (n === 0) break;
    totalPlaylist += n;
    console.log(`✅ Updated ${n} playlist_plays rows (cumulative ${totalPlaylist})...`);
  }
  
  // Backfill slideshow_plays
  console.log('\n📊 Backfilling slideshow_plays...');
  let totalSlideshow = 0;
  while (true) {
    const n = await backfillSlideshowPlays(500);
    if (n === 0) break;
    totalSlideshow += n;
    console.log(`✅ Updated ${n} slideshow_plays rows (cumulative ${totalSlideshow})...`);
  }
  
  console.log(`\n🎉 Backfill complete!`);
  console.log(`   - media_plays: ${totalMedia} rows`);
  console.log(`   - playlist_plays: ${totalPlaylist} rows`);
  console.log(`   - slideshow_plays: ${totalSlideshow} rows`);
  console.log(`   - Total: ${totalMedia + totalPlaylist + totalSlideshow} rows`);
  
  await pool.end();
})().catch(async (e) => {
  console.error('❌ Backfill failed:', e);
  await pool.end();
  process.exit(1);
});

