/**
 * Investigate scan count discrepancy for specific QR code
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function investigate() {
  try {
    const userId = 43;
    const qrName = 'JINGLE BEAR BLUE MERRY CHRISTMAS';
    
    console.log(`🔍 Investigating scan counts for: "${qrName}"\n`);

    // Get QR code ID
    const qrResult = await pool.query(
      `SELECT id, name FROM qr_codes WHERE user_id = $1 AND name = $2`,
      [userId, qrName]
    );

    if (qrResult.rows.length === 0) {
      console.log('❌ QR code not found');
      return;
    }

    const qrId = qrResult.rows[0].id;
    console.log(`📱 QR Code ID: ${qrId}\n`);

    // 1. Raw count (what detail page currently shows)
    const rawCount = await pool.query(
      `SELECT COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.id = $1
       GROUP BY qr.id`,
      [qrId]
    );

    console.log('1️⃣ Raw Count (Detail Page - CURRENT):');
    console.log(`   Scan Count: ${rawCount.rows[0]?.scan_count || 0}`);

    // 2. Deduplicated count (what analytics should show)
    const dedupCount = await pool.query(
      `WITH dedup_scans AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id
        FROM qr_scans s
        WHERE s.qr_code_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT COUNT(*) as scan_count FROM dedup_scans`,
      [qrId]
    );

    console.log('\n2️⃣ Deduplicated Count (Analytics - SHOULD BE):');
    console.log(`   Scan Count: ${dedupCount.rows[0]?.scan_count || 0}`);

    // 3. Show breakdown of raw scans
    const rawScans = await pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(DISTINCT COALESCE(qr_visitor_id, visitor_id::text, ip_address::text)) as unique_visitors,
         MIN(scanned_at) as first_scan,
         MAX(scanned_at) as last_scan
       FROM qr_scans
       WHERE qr_code_id = $1`,
      [qrId]
    );

    console.log('\n3️⃣ Raw Scan Breakdown:');
    console.log(`   Total Raw Scans: ${rawScans.rows[0]?.total || 0}`);
    console.log(`   Unique Visitors: ${rawScans.rows[0]?.unique_visitors || 0}`);
    console.log(`   First Scan: ${rawScans.rows[0]?.first_scan}`);
    console.log(`   Last Scan: ${rawScans.rows[0]?.last_scan}`);

    // 4. Check what most popular query returns
    const mostPopular = await pool.query(
      `WITH dedup_all AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.qr_code_id
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT 
        q.id as qr_code_id,
        q.name as qr_name,
        COUNT(*) as scan_count
      FROM dedup_all d
      JOIN qr_codes q ON d.qr_code_id = q.id
      WHERE q.id = $2
      GROUP BY q.id, q.name`,
      [userId, qrId]
    );

    console.log('\n4️⃣ Most Popular Query Result:');
    if (mostPopular.rows.length > 0) {
      console.log(`   QR Name: ${mostPopular.rows[0].qr_name}`);
      console.log(`   Scan Count: ${mostPopular.rows[0].scan_count}`);
    } else {
      console.log('   Not found in most popular query');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

investigate();

