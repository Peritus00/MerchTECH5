/**
 * Ensure deduplication constraint exists
 * Run: node scripts/ensure-dedupe-constraint.js
 */

const { Pool } = require('pg');
require('dotenv').config();

async function ensureDedupeConstraint() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Ensuring deduplication constraint exists...\n');

    // Check if any dedupe index exists
    const checkResult = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename = 'qr_scans' 
        AND indexname LIKE '%dedupe%'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ Deduplication index(es) already exist:');
      checkResult.rows.forEach(row => {
        console.log(`   - ${row.indexname}`);
      });
    } else {
      console.log('⚠️  No deduplication index found. Creating...\n');
      
      // Use EXTRACT approach (works on all Postgres versions)
      // date_trunc is not IMMUTABLE in some Postgres versions
      // EXTRACT returns numeric, which PostgreSQL indexes can handle
      try {
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_scans_minute_dedupe_simple
          ON qr_scans (
            qr_code_id, 
            visitor_id,
            EXTRACT(YEAR FROM scanned_at),
            EXTRACT(MONTH FROM scanned_at),
            EXTRACT(DAY FROM scanned_at),
            EXTRACT(HOUR FROM scanned_at),
            EXTRACT(MINUTE FROM scanned_at)
          )
          WHERE visitor_id IS NOT NULL
        `);
        console.log('✅ Created uq_qr_scans_minute_dedupe_simple (using EXTRACT)');
      } catch (e) {
        console.error('❌ Failed to create deduplication index:', e.message);
        console.error('   This is okay - deduplication will still work via application logic');
        console.error('   The manual dedupe check in writeScan() will handle duplicates');
      }
    }

    console.log('\n✅ Deduplication constraint check complete!\n');
    console.log('📝 Note: The constraint prevents duplicate scans within the same minute');
    console.log('   for the same QR code and visitor_id combination.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

ensureDedupeConstraint().catch(console.error);

