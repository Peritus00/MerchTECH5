/**
 * Check if demographics are being saved correctly
 * Run: node scripts/check-demographics-data.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkDemographics() {
  console.log('🔍 Checking demographics data in qr_scans...\n');
  
  try {
    // Check recent scans with demographics
    const recentScans = await pool.query(`
      SELECT 
        id,
        qr_code_id,
        scanned_at,
        user_provided_age_range,
        user_provided_gender,
        visitor_id,
        qr_visitor_id
      FROM qr_scans
      WHERE scanned_at >= NOW() - INTERVAL '24 hours'
      ORDER BY scanned_at DESC
      LIMIT 20
    `);
    
    console.log(`📊 Found ${recentScans.rows.length} scans in last 24 hours:\n`);
    
    const withAge = recentScans.rows.filter(s => s.user_provided_age_range);
    const withGender = recentScans.rows.filter(s => s.user_provided_gender);
    const withBoth = recentScans.rows.filter(s => s.user_provided_age_range && s.user_provided_gender);
    
    console.log(`   Scans with age: ${withAge.length}`);
    console.log(`   Scans with gender: ${withGender.length}`);
    console.log(`   Scans with both: ${withBoth.length}\n`);
    
    if (recentScans.rows.length > 0) {
      console.log('Recent scans (last 10):');
      recentScans.rows.slice(0, 10).forEach((scan, idx) => {
        console.log(`   ${idx + 1}. Scan ID ${scan.id}, QR ${scan.qr_code_id}`);
        console.log(`      Time: ${scan.scanned_at}`);
        console.log(`      Age: ${scan.user_provided_age_range || 'NULL'}`);
        console.log(`      Gender: ${scan.user_provided_gender || 'NULL'}`);
        console.log(`      Visitor: ${scan.qr_visitor_id?.substring(0, 8) || scan.visitor_id?.substring(0, 8) || 'NULL'}...`);
        console.log('');
      });
    }
    
    // Check total demographics counts
    const demographicsCounts = await pool.query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(user_provided_age_range) as scans_with_age,
        COUNT(user_provided_gender) as scans_with_gender,
        COUNT(CASE WHEN user_provided_age_range IS NOT NULL AND user_provided_gender IS NOT NULL THEN 1 END) as scans_with_both
      FROM qr_scans
      WHERE scanned_at >= NOW() - INTERVAL '7 days'
    `);
    
    const counts = demographicsCounts.rows[0];
    console.log('📈 Demographics Statistics (last 7 days):');
    console.log(`   Total scans: ${counts.total_scans}`);
    console.log(`   With age: ${counts.scans_with_age} (${Math.round(counts.scans_with_age / counts.total_scans * 100)}%)`);
    console.log(`   With gender: ${counts.scans_with_gender} (${Math.round(counts.scans_with_gender / counts.total_scans * 100)}%)`);
    console.log(`   With both: ${counts.scans_with_both} (${Math.round(counts.scans_with_both / counts.total_scans * 100)}%)\n`);
    
    // Check age distribution
    const ageDist = await pool.query(`
      SELECT 
        user_provided_age_range,
        COUNT(*) as count
      FROM qr_scans
      WHERE user_provided_age_range IS NOT NULL
        AND scanned_at >= NOW() - INTERVAL '7 days'
      GROUP BY user_provided_age_range
      ORDER BY count DESC
    `);
    
    if (ageDist.rows.length > 0) {
      console.log('📊 Age Distribution:');
      ageDist.rows.forEach(row => {
        console.log(`   ${row.user_provided_age_range}: ${row.count} scans`);
      });
      console.log('');
    }
    
    // Check gender distribution
    const genderDist = await pool.query(`
      SELECT 
        user_provided_gender,
        COUNT(*) as count
      FROM qr_scans
      WHERE user_provided_gender IS NOT NULL
        AND scanned_at >= NOW() - INTERVAL '7 days'
      GROUP BY user_provided_gender
      ORDER BY count DESC
    `);
    
    if (genderDist.rows.length > 0) {
      console.log('📊 Gender Distribution:');
      genderDist.rows.forEach(row => {
        console.log(`   ${row.user_provided_gender}: ${row.count} scans`);
      });
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error checking demographics:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkDemographics().catch(console.error);

