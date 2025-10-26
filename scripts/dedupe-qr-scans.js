const { Pool } = require('pg');
require('dotenv').config();

// One-off script to collapse rapid duplicate scans within 60s per qr_code_id + visitor
// Usage: node scripts/dedupe-qr-scans.js [--apply] [--days 30]

async function main() {
  const apply = process.argv.includes('--apply');
  const daysArgIndex = process.argv.indexOf('--days');
  const days = daysArgIndex > -1 ? parseInt(process.argv[daysArgIndex + 1] || '30', 10) : 30;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  console.log(`\n🔎 DEDUPE: Scanning last ${days} days (apply=${apply})...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sel = await client.query(
      `WITH ordered AS (
         SELECT id, qr_code_id,
                COALESCE(qr_visitor_id, visitor_id::text) AS v,
                scanned_at,
                LAG(scanned_at) OVER (
                  PARTITION BY qr_code_id, COALESCE(qr_visitor_id, visitor_id::text)
                  ORDER BY scanned_at
                ) AS prev_at
         FROM qr_scans
         WHERE scanned_at >= NOW() - ($1 || ' days')::INTERVAL
       )
       SELECT id
       FROM ordered
       WHERE prev_at IS NOT NULL
         AND EXTRACT(EPOCH FROM (scanned_at - prev_at)) < 60`,
      [days]
    );

    console.log(`📊 DEDUPE: Found ${sel.rowCount} duplicate rows in window.`);

    if (apply && sel.rowCount > 0) {
      const ids = sel.rows.map(r => r.id);
      const del = await client.query('DELETE FROM qr_scans WHERE id = ANY($1)', [ids]);
      console.log(`🗑️  DEDUPE: Deleted ${del.rowCount} rows.`);
    } else if (!apply) {
      console.log('💡 Run with --apply to delete these rows. No changes made.');
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ DEDUPE failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


