// Backfill anonymized visitor_id for recent qr_scans using deterministic hash of UA+ip where available
// Usage: node scripts/backfill-qr-visitor-id.js [--days=30] [--limit=1000]

const { Pool } = require('pg');
const crypto = require('crypto');

function getArg(name, def) {
  const match = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!match) return def;
  const v = match.split('=')[1];
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

async function main() {
  const days = getArg('days', 30);
  const limit = Math.min(getArg('limit', 5000), 20000);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const client = await pool.connect();
  try {
    console.log(`Backfilling visitor_id for last ${days} days, up to ${limit} rows...`);

    const sel = await client.query(
      `SELECT id, browser_name, operating_system, device_type, ip_address, scanned_at
         FROM qr_scans
        WHERE visitor_id IS NULL AND scanned_at >= NOW() - ($1 || ' days')::interval
        ORDER BY scanned_at DESC
        LIMIT $2`,
      [days, limit]
    );
    let updated = 0;
    for (const r of sel.rows) {
      const basis = `${r.browser_name||''}|${r.operating_system||''}|${r.device_type||''}|${r.ip_address||''}`;
      if (!basis.trim()) continue;
      const uuid = crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
      // Cast 32-hex into UUID v4-like format
      const v = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20,32)}000000000000`;
      await client.query('UPDATE qr_scans SET visitor_id = $2 WHERE id = $1', [r.id, v]);
      updated++;
    }
    console.log(`Updated ${updated} rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});


