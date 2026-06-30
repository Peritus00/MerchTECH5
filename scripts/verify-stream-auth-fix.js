#!/usr/bin/env node
/**
 * Verify stream auth for playlist 84 shared-track case.
 * Before fix: media 68 often returns 403 while played from open playlist 84.
 * After fix: all playlist tracks should return 200/206.
 */
const API_BASE = process.env.API_BASE || 'https://merchtech5-production.up.railway.app';
const PLAYLIST_ID = process.env.PLAYLIST_ID || '84';

async function main() {
  const playlistRes = await fetch(`${API_BASE}/api/playlist-access/${PLAYLIST_ID}`);
  if (!playlistRes.ok) {
    console.error('Failed to load playlist:', playlistRes.status);
    process.exit(1);
  }

  const playlist = await playlistRes.json();
  const mediaIds = (playlist.mediaFiles || []).map((item) => item.id).filter(Boolean);
  console.log(`Playlist ${PLAYLIST_ID}: checking ${mediaIds.length} stream URLs`);

  const results = [];
  for (const id of mediaIds) {
    const res = await fetch(`${API_BASE}/api/media/${id}/stream`, {
      headers: { Range: 'bytes=0-1023' },
    });
    results.push({ id, status: res.status });
  }

  const failures = results.filter((r) => r.status === 403 || r.status >= 500);
  for (const row of results) {
    console.log(`  media ${row.id}: ${row.status}`);
  }

  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} stream(s) returned 403/5xx`);
    process.exit(1);
  }

  console.log('\nPASS: all streams returned 200/206');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
