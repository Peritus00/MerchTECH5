/**
 * Check scan count discrepancy between QR code list and analytics
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkDiscrepancy() {
  try {
    const userId = 43; // Update with actual user ID if needed
    const qrName = 'JINGLE BEAR BLUE MERRY CHRISTMAS';
    
    console.log(`🔍 Checking scan counts for QR: "${qrName}"\n`);

    // 1. Raw count (what QR code list shows)
    const rawCount = await pool.query(
      `SELECT qr.id, qr.name, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.user_id = $1 AND qr.name = $2
       GROUP BY qr.id, qr.name`,
      [userId, qrName]
    );

    console.log('1️⃣ Raw Count (QR Code List):');
    if (rawCount.rows.length > 0) {
      console.log(`   QR ID: ${rawCount.rows[0].id}`);
      console.log(`   Name: ${rawCount.rows[0].name}`);
      console.log(`   Scan Count: ${rawCount.rows[0].scan_count}`);
    } else {
      console.log('   QR code not found');
    }

    // 2. Deduplicated count (all time)
    const dedupCount = await pool.query(
      `WITH dedup_all AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id, s.qr_code_id
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1 AND q.name = $2
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT COUNT(*) as scan_count FROM dedup_all`,
      [userId, qrName]
    );

    console.log('\n2️⃣ Deduplicated Count (All Time):');
    console.log(`   Scan Count: ${dedupCount.rows[0]?.scan_count || 0}`);

    // 3. Deduplicated count (last 7 days)
    const dedup7Days = await pool.query(
      `WITH dedup AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id, s.qr_code_id
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1 AND q.name = $2
          AND s.scanned_at >= NOW() - INTERVAL '7 days'
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT COUNT(*) as scan_count FROM dedup`,
      [userId, qrName]
    );

    console.log('\n3️⃣ Deduplicated Count (Last 7 Days):');
    console.log(`   Scan Count: ${dedup7Days.rows[0]?.scan_count || 0}`);

    // 4. Show date range of scans
    const dateRange = await pool.query(
      `SELECT 
         MIN(s.scanned_at) as first_scan,
         MAX(s.scanned_at) as last_scan,
         COUNT(*) as total_scans
       FROM qr_scans s
       JOIN qr_codes q ON s.qr_code_id = q.id
       WHERE q.user_id = $1 AND q.name = $2`,
      [userId, qrName]
    );

    console.log('\n4️⃣ Scan Date Range:');
    if (dateRange.rows[0]?.total_scans > 0) {
      console.log(`   First Scan: ${dateRange.rows[0].first_scan}`);
      console.log(`   Last Scan: ${dateRange.rows[0].last_scan}`);
      console.log(`   Total Raw Scans: ${dateRange.rows[0].total_scans}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkDiscrepancy();

