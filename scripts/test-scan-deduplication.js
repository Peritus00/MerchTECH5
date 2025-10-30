#!/usr/bin/env node

/**
 * QR Scan Deduplication Test
 * 
 * This script tests that QR code scans are only counted once
 * even when multiple tracking calls are made.
 * 
 * Usage:
 *   node scripts/test-scan-deduplication.js [qrCodeId]
 * 
 * If qrCodeId is not provided, it will use the first active QR code found.
 */

const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const API_BASE_URL = process.env.API_BASE_URL || 'https://merchtech5-production.up.railway.app/api';

// Generate a unique visitor ID for testing
function generateVisitorId() {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Simulate a QR scan tracking call
async function simulateScanTracking(qrCodeId, visitorId, options = {}) {
  const { userAge, userGender, userLocation } = options;
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/analytics/track-scan`,
      {
        qrCodeId,
        deviceType: 'Desktop',
        browserName: 'Test Browser',
        operatingSystem: 'Test OS',
        userAge,
        userGender,
        userLocation,
      },
      {
        headers: {
          'Cookie': `qr_vid=${visitorId}`,
          'User-Agent': 'Mozilla/5.0 (Test)',
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('❌ Scan tracking failed:', error.response?.data || error.message);
    throw error;
  }
}

// Get scan count for a QR code
async function getScanCount(qrCodeId, timeWindowSeconds = 60) {
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM qr_scans
     WHERE qr_code_id = $1
       AND scanned_at >= NOW() - INTERVAL '1 second' * $2`,
    [qrCodeId, timeWindowSeconds]
  );
  return parseInt(result.rows[0].count);
}

// Get scan details
async function getScanDetails(qrCodeId, timeWindowSeconds = 60) {
  const result = await pool.query(
    `SELECT 
       id,
       qr_code_id,
       scanned_at,
       visitor_id,
       qr_visitor_id,
       user_provided_age_range,
       user_provided_gender
     FROM qr_scans
     WHERE qr_code_id = $1
       AND scanned_at >= NOW() - INTERVAL '1 second' * $2
     ORDER BY scanned_at DESC`,
    [qrCodeId, timeWindowSeconds]
  );
  return result.rows;
}

// Test: Multiple rapid scans with same visitor ID
async function testRapidScans(qrCodeId, visitorId) {
  console.log('\n📊 Test 1: Multiple rapid scans (same visitor ID)');
  console.log('   Should only count as 1 scan due to deduplication...\n');
  
  const beforeCount = await getScanCount(qrCodeId, 60);
  console.log(`   Initial scan count: ${beforeCount}`);
  
  // Send 5 rapid scan requests
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(simulateScanTracking(qrCodeId, visitorId));
  }
  
  await Promise.all(promises);
  
  // Wait a moment for database to update
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const afterCount = await getScanCount(qrCodeId, 60);
  const scansAdded = afterCount - beforeCount;
  
  console.log(`   Final scan count: ${afterCount}`);
  console.log(`   Scans added: ${scansAdded}`);
  
  if (scansAdded === 1) {
    console.log('   ✅ PASS: Only 1 scan recorded (deduplication working)');
    return true;
  } else {
    console.log(`   ❌ FAIL: ${scansAdded} scans recorded (expected 1)`);
    return false;
  }
}

// Test: Scan with demographics update
async function testDemographicsUpdate(qrCodeId, visitorId) {
  console.log('\n📊 Test 2: Scan with demographics update');
  console.log('   Should update existing scan, not create duplicate...\n');
  
  const beforeCount = await getScanCount(qrCodeId, 3600);
  console.log(`   Initial scan count (1 hour window): ${beforeCount}`);
  
  // First scan without demographics
  await simulateScanTracking(qrCodeId, visitorId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const afterFirstScan = await getScanCount(qrCodeId, 3600);
  console.log(`   After first scan: ${afterFirstScan}`);
  
  // Second scan with demographics (should update, not insert)
  await simulateScanTracking(qrCodeId, visitorId, {
    userAge: '25-34',
    userGender: 'Male'
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const afterSecondScan = await getScanCount(qrCodeId, 3600);
  const scansAdded = afterSecondScan - beforeCount;
  
  console.log(`   After second scan (with demographics): ${afterSecondScan}`);
  console.log(`   Total scans added: ${scansAdded}`);
  
  // Check if demographics were saved
  const scans = await getScanDetails(qrCodeId, 3600);
  const latestScan = scans[0];
  
  if (scansAdded === 1 && latestScan.user_provided_age_range === '25-34' && latestScan.user_provided_gender === 'Male') {
    console.log('   ✅ PASS: Scan updated with demographics (no duplicate)');
    return true;
  } else {
    console.log(`   ❌ FAIL: Expected 1 scan with demographics, got ${scansAdded} scans`);
    if (scans.length > 0) {
      console.log(`   Latest scan demographics: age=${latestScan.user_provided_age_range}, gender=${latestScan.user_provided_gender}`);
    }
    return false;
  }
}

// Test: Different visitor IDs (should create separate scans)
async function testDifferentVisitors(qrCodeId) {
  console.log('\n📊 Test 3: Different visitor IDs');
  console.log('   Should create separate scans for different visitors...\n');
  
  const beforeCount = await getScanCount(qrCodeId, 60);
  console.log(`   Initial scan count: ${beforeCount}`);
  
  // Send scans from 3 different visitors
  const visitorIds = [
    generateVisitorId(),
    generateVisitorId(),
    generateVisitorId()
  ];
  
  for (const visitorId of visitorIds) {
    await simulateScanTracking(qrCodeId, visitorId);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const afterCount = await getScanCount(qrCodeId, 60);
  const scansAdded = afterCount - beforeCount;
  
  console.log(`   Final scan count: ${afterCount}`);
  console.log(`   Scans added: ${scansAdded}`);
  
  if (scansAdded === 3) {
    console.log('   ✅ PASS: 3 separate scans recorded (different visitors)');
    return true;
  } else {
    console.log(`   ❌ FAIL: Expected 3 scans, got ${scansAdded}`);
    return false;
  }
}

// Test: Scan after deduplication window expires
async function testWindowExpiration(qrCodeId, visitorId) {
  console.log('\n📊 Test 4: Scan after deduplication window expires');
  console.log('   Should create new scan after window expires...\n');
  
  const beforeCount = await getScanCount(qrCodeId, 120);
  console.log(`   Initial scan count (2 minute window): ${beforeCount}`);
  
  // First scan
  await simulateScanTracking(qrCodeId, visitorId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const afterFirstScan = await getScanCount(qrCodeId, 120);
  console.log(`   After first scan: ${afterFirstScan}`);
  
  // Wait for deduplication window to expire (65 seconds for regular scans)
  console.log('   Waiting 65 seconds for deduplication window to expire...');
  await new Promise(resolve => setTimeout(resolve, 65000));
  
  // Second scan after window expires
  await simulateScanTracking(qrCodeId, visitorId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const afterSecondScan = await getScanCount(qrCodeId, 120);
  const scansAdded = afterSecondScan - beforeCount;
  
  console.log(`   After second scan (after window): ${afterSecondScan}`);
  console.log(`   Total scans added: ${scansAdded}`);
  
  if (scansAdded === 2) {
    console.log('   ✅ PASS: 2 scans recorded (window expired)');
    return true;
  } else {
    console.log(`   ❌ FAIL: Expected 2 scans, got ${scansAdded}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  let qrCodeId = process.argv[2];
  
  try {
    console.log('🧪 QR Scan Deduplication Test Suite\n');
    console.log(`API Base URL: ${API_BASE_URL}\n`);
    
    // Get QR code ID if not provided
    if (!qrCodeId) {
      console.log('🔍 Finding active QR code...');
      const result = await pool.query(
        'SELECT id FROM qr_codes WHERE is_active = true LIMIT 1'
      );
      
      if (result.rows.length === 0) {
        console.error('❌ No active QR codes found. Please provide a QR code ID or create one.');
        process.exit(1);
      }
      
      qrCodeId = result.rows[0].id;
      console.log(`✅ Using QR code ID: ${qrCodeId}\n`);
    } else {
      qrCodeId = parseInt(qrCodeId);
      console.log(`✅ Using provided QR code ID: ${qrCodeId}\n`);
    }
    
    // Verify QR code exists
    const qrCheck = await pool.query(
      'SELECT id, name, url FROM qr_codes WHERE id = $1 AND is_active = true',
      [qrCodeId]
    );
    
    if (qrCheck.rows.length === 0) {
      console.error(`❌ QR code ${qrCodeId} not found or not active`);
      process.exit(1);
    }
    
    const qrInfo = qrCheck.rows[0];
    console.log(`📱 QR Code: ${qrInfo.name || 'Unnamed'}`);
    console.log(`🔗 URL: ${qrInfo.url}\n`);
    
    const results = [];
    
    // Run tests
    const visitorId1 = generateVisitorId();
    const visitorId2 = generateVisitorId();
    
    results.push(await testRapidScans(qrCodeId, visitorId1));
    results.push(await testDemographicsUpdate(qrCodeId, visitorId2));
    results.push(await testDifferentVisitors(qrCodeId));
    
    // Skip window expiration test by default (takes 65 seconds)
    if (process.argv.includes('--full')) {
      const visitorId3 = generateVisitorId();
      results.push(await testWindowExpiration(qrCodeId, visitorId3));
    } else {
      console.log('\n⏭️  Skipping window expiration test (use --full to run all tests)');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    const passed = results.filter(r => r === true).length;
    const total = results.length;
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${total - passed}/${total}`);
    
    if (passed === total) {
      console.log('\n🎉 All tests passed! Scan deduplication is working correctly.');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Please review the output above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run tests
runTests();

