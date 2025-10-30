#!/usr/bin/env node

/**
 * Quick Scan Count Checker
 * 
 * Checks if scans are being counted correctly for a specific QR code.
 * Useful for manual verification after scanning.
 * 
 * Usage:
 *   node scripts/check-scan-count.js [qrCodeId] [timeWindowMinutes]
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkScanCount() {
  const qrCodeId = process.argv[2] ? parseInt(process.argv[2]) : null;
  const timeWindowMinutes = process.argv[3] ? parseInt(process.argv[3]) : 5;
  const timeWindowSeconds = timeWindowMinutes * 60;
  
  try {
    if (!qrCodeId) {
      console.log('Usage: node scripts/check-scan-count.js [qrCodeId] [timeWindowMinutes]');
      console.log('\nExample: node scripts/check-scan-count.js 40 5');
      console.log('  (Check QR code 40 for scans in last 5 minutes)\n');
      
      // Show recent QR codes
      const recentQr = await pool.query(
        `SELECT id, name, url, 
                (SELECT COUNT(*) FROM qr_scans WHERE qr_code_id = qr_codes.id AND scanned_at >= NOW() - INTERVAL '24 hours') as scans_24h
         FROM qr_codes 
         WHERE is_active = true 
         ORDER BY created_at DESC 
         LIMIT 10`
      );
      
      if (recentQr.rows.length > 0) {
        console.log('📱 Recent QR Codes:');
        recentQr.rows.forEach(qr => {
          console.log(`   ID: ${qr.id} | ${qr.name || 'Unnamed'} | ${qr.scans_24h} scans (24h)`);
        });
      }
      
      process.exit(0);
    }
    
    // Get QR code info
    const qrInfo = await pool.query(
      'SELECT id, name, url FROM qr_codes WHERE id = $1',
      [qrCodeId]
    );
    
    if (qrInfo.rows.length === 0) {
      console.error(`❌ QR code ${qrCodeId} not found`);
      process.exit(1);
    }
    
    const qr = qrInfo.rows[0];
    console.log(`📱 QR Code: ${qr.name || 'Unnamed'} (ID: ${qr.id})`);
    console.log(`🔗 URL: ${qr.url}\n`);
    
    // Get scan count
    const scanCount = await pool.query(
      `SELECT COUNT(*) as count
       FROM qr_scans
       WHERE qr_code_id = $1
         AND scanned_at >= NOW() - INTERVAL '1 second' * $2`,
      [qrCodeId, timeWindowSeconds]
    );
    
    const count = parseInt(scanCount.rows[0].count);
    console.log(`📊 Scans in last ${timeWindowMinutes} minute(s): ${count}`);
    
    // Get scan details
    const scans = await pool.query(
      `SELECT 
         id,
         scanned_at,
         visitor_id,
         qr_visitor_id,
         user_provided_age_range,
         user_provided_gender,
         device_type,
         browser_name
       FROM qr_scans
       WHERE qr_code_id = $1
         AND scanned_at >= NOW() - INTERVAL '1 second' * $2
       ORDER BY scanned_at DESC
       LIMIT 20`,
      [qrCodeId, timeWindowSeconds]
    );
    
    if (scans.rows.length > 0) {
      console.log(`\n📋 Recent Scans (showing up to 20):\n`);
      scans.rows.forEach((scan, idx) => {
        const visitorId = scan.qr_visitor_id || scan.visitor_id?.substring(0, 8) || 'N/A';
        const demographics = scan.user_provided_age_range || scan.user_provided_gender 
          ? ` | Demographics: ${scan.user_provided_age_range || 'N/A'}, ${scan.user_provided_gender || 'N/A'}`
          : '';
        console.log(`   ${idx + 1}. Scan ID ${scan.id} | ${scan.scanned_at.toISOString()} | Visitor: ${visitorId}${demographics}`);
      });
      
      // Check for duplicates (same visitor ID within deduplication window)
      const duplicates = await pool.query(
        `SELECT 
           COALESCE(qr_visitor_id, visitor_id::text) as visitor_id,
           COUNT(*) as count
         FROM qr_scans
         WHERE qr_code_id = $1
           AND scanned_at >= NOW() - INTERVAL '1 second' * $2
         GROUP BY COALESCE(qr_visitor_id, visitor_id::text)
         HAVING COUNT(*) > 1
         ORDER BY count DESC`,
        [qrCodeId, timeWindowSeconds]
      );
      
      if (duplicates.rows.length > 0) {
        console.log(`\n⚠️  Potential Duplicates Found:\n`);
        duplicates.rows.forEach(dup => {
          console.log(`   Visitor ${dup.visitor_id.substring(0, 8)}... has ${dup.count} scans`);
        });
        console.log('\n   Note: If scans are within 60 seconds, they should be deduplicated.');
      } else {
        console.log('\n✅ No duplicate scans detected (deduplication working correctly)');
      }
    } else {
      console.log('\n   No scans found in the specified time window.');
    }
    
    // Get total scan count
    const totalScans = await pool.query(
      'SELECT COUNT(*) as count FROM qr_scans WHERE qr_code_id = $1',
      [qrCodeId]
    );
    console.log(`\n📈 Total scans (all time): ${totalScans.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkScanCount();

