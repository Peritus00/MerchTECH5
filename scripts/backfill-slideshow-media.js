#!/usr/bin/env node
/**
 * Backfill media rows for existing slideshows.
 * Creates media entries with type=slideshow so they appear in media library and can be added to playlists.
 * Run after migration 036.
 *
 * Usage: node scripts/backfill-slideshow-media.js
 *        DRY_RUN=true node scripts/backfill-slideshow-media.js  (preview only)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dryRun = process.env.DRY_RUN === 'true';
  if (dryRun) console.log('🔍 DRY RUN - no changes will be made\n');

  try {
    // Check slideshow_id column exists
    const colCheck = await pool.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'media' AND column_name = 'slideshow_id'
    `);
    if (colCheck.rows.length === 0) {
      console.error('❌ Run migration 036 first: npm run db:migrate-slideshow-media');
      process.exit(1);
    }

    const slideshows = await pool.query(
      `SELECT id, user_id, name FROM slideshows WHERE deleted_at IS NULL`
    );
    console.log(`Found ${slideshows.rows.length} slideshows\n`);

    let created = 0;
    let skipped = 0;

    for (const s of slideshows.rows) {
      const existing = await pool.query(
        'SELECT id FROM media WHERE slideshow_id = $1',
        [s.id]
      );
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await pool.query(
          `INSERT INTO media (user_id, title, url, file_type, content_type, slideshow_id) 
           VALUES ($1, $2, $3, 'slideshow', 'application/slideshow', $4)`,
          [s.user_id, s.name, `slideshow:${s.id}`, s.id]
        );
      }
      created++;
      console.log(`  ${dryRun ? '[DRY] ' : ''}Created media for slideshow "${s.name}" (id=${s.id})`);
    }

    console.log(`\n✅ Done. Created: ${created}, Skipped (already linked): ${skipped}`);
  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
