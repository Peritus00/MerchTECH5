/**
 * Diagnostic script to investigate duplicate QR scans
 * Run: node scripts/investigate-duplicate-scans.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function investigateDuplicates() {
  console.log('🔍 INVESTIGATING DUPLICATE QR SCANS\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Check for duplicate scans by qr_code_id and visitor_id
    console.log('\n1️⃣ Finding duplicate scans (same qr_code_id + visitor_id):');
    const dupes = await pool.query(`
      SELECT 
        qr_code_id, 
        visitor_id,
        COUNT(*) as scan_count, 
        MIN(scanned_at) as first_scan, 
        MAX(scanned_at) as last_scan,
        EXTRACT(EPOCH FROM (MAX(scanned_at) - MIN(scanned_at))) as seconds_between
      FROM qr_scans
      WHERE scanned_at >= NOW() - INTERVAL '7 days'
      GROUP BY qr_code_id, visitor_id
      HAVING COUNT(*) > 1
      ORDER BY scan_count DESC
      LIMIT 20
    `);
    
    if (dupes.rows.length === 0) {
      console.log('   ✅ No duplicates found in last 7 days');
    } else {
      console.log(`   ⚠️  Found ${dupes.rows.length} groups with duplicates:`);
      dupes.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. QR Code ${row.qr_code_id}, Visitor ${row.visitor_id?.substring(0, 8)}...`);
        console.log(`      Scans: ${row.scan_count}, Time span: ${Math.round(row.seconds_between)} seconds`);
      });
    }
    
    // 2. Check scans within 60 seconds (writeScan deduplication window)
    console.log('\n2️⃣ Checking scans within 60 seconds (writeScan dedupe window):');
    const recentScans = await pool.query(`
      SELECT 
        qr_code_id, 
        visitor_id, 
        scanned_at,
        EXTRACT(EPOCH FROM (scanned_at - LAG(scanned_at) OVER (
          PARTITION BY qr_code_id, visitor_id 
          ORDER BY scanned_at
        ))) as seconds_since_prev
      FROM qr_scans
      WHERE scanned_at >= NOW() - INTERVAL '7 days'
        AND visitor_id IS NOT NULL
      ORDER BY qr_code_id, visitor_id, scanned_at
    `);
    
    const within60s = recentScans.rows.filter(r => r.seconds_since_prev !== null && r.seconds_since_prev < 60);
    if (within60s.length === 0) {
      console.log('   ✅ No scans found within 60 seconds of previous scan');
    } else {
      console.log(`   ⚠️  Found ${within60s.length} scans within 60 seconds of previous scan:`);
      within60s.slice(0, 10).forEach((row, idx) => {
        console.log(`   ${idx + 1}. QR Code ${row.qr_code_id}, Visitor ${row.visitor_id?.substring(0, 8)}..., Time gap: ${Math.round(row.seconds_since_prev)}s`);
      });
    }
    
    // 3. Verify deduplication constraint exists
    console.log('\n3️⃣ Checking for deduplication constraints/indexes:');
    const constraints = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'qr_scans' 
      AND indexname LIKE '%dedupe%'
    `);
    
    if (constraints.rows.length === 0) {
      console.log('   ⚠️  No deduplication indexes found!');
      console.log('   This could be the root cause of duplicate scans.');
    } else {
      console.log(`   ✅ Found ${constraints.rows.length} deduplication index(es):`);
      constraints.rows.forEach(row => {
        console.log(`      - ${row.indexname}`);
        console.log(`        ${row.indexdef.substring(0, 100)}...`);
      });
    }
    
    // 4. Check recent scan patterns (last 24 hours)
    console.log('\n4️⃣ Recent scan patterns (last 24 hours):');
    const recentPattern = await pool.query(`
      SELECT 
        qr_code_id,
        COUNT(*) as total_scans,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        COUNT(*) FILTER (WHERE scanned_at >= NOW() - INTERVAL '1 minute') as scans_last_minute,
        COUNT(*) FILTER (WHERE scanned_at >= NOW() - INTERVAL '1 hour') as scans_last_hour
      FROM qr_scans
      WHERE scanned_at >= NOW() - INTERVAL '24 hours'
      GROUP BY qr_code_id
      ORDER BY total_scans DESC
      LIMIT 10
    `);
    
    console.log(`   Found ${recentPattern.rows.length} QR codes with scans in last 24h:`);
    recentPattern.rows.forEach((row, idx) => {
      const ratio = row.total_scans > 0 ? (row.total_scans / row.unique_visitors).toFixed(2) : '0';
      console.log(`   ${idx + 1}. QR Code ${row.qr_code_id}: ${row.total_scans} scans, ${row.unique_visitors} visitors (avg ${ratio}/visitor)`);
      if (row.scans_last_minute > 1) {
        console.log(`      ⚠️  ${row.scans_last_minute} scans in last minute!`);
      }
    });
    
    // 5. Check for scans without proper deduplication logic
    console.log('\n5️⃣ Analyzing scan insertion patterns:');
    const insertionPattern = await pool.query(`
      SELECT 
        DATE_TRUNC('minute', scanned_at) as minute_bucket,
        qr_code_id,
        visitor_id,
        COUNT(*) as scans_in_minute
      FROM qr_scans
      WHERE scanned_at >= NOW() - INTERVAL '7 days'
        AND visitor_id IS NOT NULL
      GROUP BY DATE_TRUNC('minute', scanned_at), qr_code_id, visitor_id
      HAVING COUNT(*) > 1
      ORDER BY scans_in_minute DESC, minute_bucket DESC
      LIMIT 20
    `);
    
    if (insertionPattern.rows.length === 0) {
      console.log('   ✅ No duplicate scans found within same minute per visitor');
    } else {
      console.log(`   ⚠️  Found ${insertionPattern.rows.length} cases with multiple scans in same minute:`);
      insertionPattern.rows.slice(0, 10).forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.minute_bucket} - QR ${row.qr_code_id}, Visitor ${row.visitor_id?.substring(0, 8)}..., ${row.scans_in_minute} scans`);
      });
    }
    
    // 6. Check analytics summary calculation vs raw counts
    console.log('\n6️⃣ Comparing analytics summary logic vs raw counts:');
    const userId = process.env.ADMIN_USER_ID || 1; // Default to user ID 1 if not set
    const rawCount = await pool.query(`
      SELECT COUNT(*) as total_scans
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
        AND s.scanned_at >= NOW() - INTERVAL '7 days'
    `, [userId]);
    
    // Simulate analytics summary deduplication logic
    const dedupedCount = await pool.query(`
      WITH dedup AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
          AND s.scanned_at >= NOW() - INTERVAL '7 days'
        ORDER BY s.qr_code_id, COALESCE(s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT COUNT(*) as total_scans FROM dedup
    `, [userId]);
    
    console.log(`   Raw scans (no deduplication): ${rawCount.rows[0].total_scans}`);
    console.log(`   Deduped scans (analytics logic): ${dedupedCount.rows[0].total_scans}`);
    const difference = parseInt(rawCount.rows[0].total_scans) - parseInt(dedupedCount.rows[0].total_scans);
    if (difference > 0) {
      console.log(`   ⚠️  Difference: ${difference} scans being deduplicated by analytics`);
    } else {
      console.log(`   ✅ Counts match`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Investigation complete');
    
  } catch (error) {
    console.error('❌ Error during investigation:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

investigateDuplicates().catch(console.error);

