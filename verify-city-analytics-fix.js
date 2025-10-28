/**
 * Verification script for city analytics fix
 * This tests if user-provided locations are being captured correctly
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') || process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function testGeoProviderConfiguration() {
  console.log('\n🔍 STEP 1: Checking Geolocation Provider Configuration\n');
  
  const hasProvider = process.env.GEO_PROVIDER;
  const hasApiKey = process.env.GEO_API_KEY;
  
  console.log('Configuration Status:');
  console.log(`  GEO_PROVIDER: ${hasProvider || '❌ Not configured'}`);
  console.log(`  GEO_API_KEY: ${hasApiKey ? '✅ Configured' : '❌ Not configured'}`);
  
  if (!hasProvider || !hasApiKey) {
    console.log('\n⚠️  Warning: No external geo provider configured.');
    console.log('   Auto-detected city data will be limited.');
    console.log('   Solution: Set GEO_PROVIDER and GEO_API_KEY in environment variables');
    console.log('   See GEO_LOCATION_FIX_GUIDE.md for instructions');
  } else {
    console.log('\n✅ External geo provider configured!');
  }
  
  return { hasProvider, hasApiKey };
}

async function checkDatabaseSchema() {
  console.log('\n🔍 STEP 2: Verifying Database Schema\n');
  
  const columnsResult = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'qr_scans'
    AND column_name IN (
      'city', 'region', 'country_code', 'country_name',
      'user_provided_city', 'user_provided_state', 'user_provided_zip',
      'location_source'
    )
    ORDER BY column_name
  `);
  
  const requiredColumns = [
    'city', 'region', 'user_provided_city', 
    'user_provided_state', 'location_source'
  ];
  
  const foundColumns = columnsResult.rows.map(r => r.column_name);
  const allPresent = requiredColumns.every(col => foundColumns.includes(col));
  
  console.log('Required Database Columns:');
  requiredColumns.forEach(col => {
    const found = foundColumns.includes(col);
    console.log(`  ${col}: ${found ? '✅' : '❌'}`);
  });
  
  if (allPresent) {
    console.log('\n✅ All required columns present!');
  } else {
    console.log('\n❌ Missing columns - migrations may not have run');
    console.log('   Solution: Run database migrations');
  }
  
  return allPresent;
}

async function analyzeRecentScans() {
  console.log('\n🔍 STEP 3: Analyzing Recent Scan Data\n');
  
  const scansResult = await pool.query(`
    SELECT 
      COUNT(*) as total_scans,
      COUNT(CASE WHEN country_code IS NOT NULL THEN 1 END) as scans_with_country,
      COUNT(CASE WHEN city IS NOT NULL AND city != '' THEN 1 END) as scans_with_auto_city,
      COUNT(CASE WHEN user_provided_city IS NOT NULL AND user_provided_city != '' THEN 1 END) as scans_with_user_city,
      COUNT(CASE WHEN 
        (city IS NOT NULL AND city != '') OR 
        (user_provided_city IS NOT NULL AND user_provided_city != '')
      THEN 1 END) as scans_with_any_city
    FROM qr_scans
    WHERE scanned_at >= NOW() - INTERVAL '7 days'
  `);
  
  const stats = scansResult.rows[0];
  
  console.log('Last 7 Days Scan Statistics:');
  console.log(`  Total Scans: ${stats.total_scans}`);
  console.log(`  With Country: ${stats.scans_with_country} (${Math.round(stats.scans_with_country/stats.total_scans*100)}%)`);
  console.log(`  With Auto-Detected City: ${stats.scans_with_auto_city} (${Math.round(stats.scans_with_auto_city/stats.total_scans*100)}%)`);
  console.log(`  With User-Provided City: ${stats.scans_with_user_city} (${Math.round(stats.scans_with_user_city/stats.total_scans*100)}%)`);
  console.log(`  With Any City Data: ${stats.scans_with_any_city} (${Math.round(stats.scans_with_any_city/stats.total_scans*100)}%)`);
  
  // Get breakdown by location source
  const sourceResult = await pool.query(`
    SELECT 
      location_source,
      COUNT(*) as count
    FROM qr_scans
    WHERE scanned_at >= NOW() - INTERVAL '7 days'
    GROUP BY location_source
    ORDER BY count DESC
  `);
  
  console.log('\nLocation Source Breakdown:');
  sourceResult.rows.forEach(row => {
    console.log(`  ${row.location_source || 'null'}: ${row.count} scans`);
  });
  
  return stats;
}

async function showTopCities() {
  console.log('\n🔍 STEP 4: Current Analytics - Top Cities\n');
  
  const citiesResult = await pool.query(`
    SELECT 
      COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown') AS city,
      COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), '') AS region,
      COALESCE(s.country_name, s.country_code, '') AS country,
      COUNT(*) as scan_count,
      SUM(CASE WHEN s.location_source = 'user' THEN 1 ELSE 0 END) as user_provided_count
    FROM qr_scans s
    WHERE s.scanned_at >= NOW() - INTERVAL '7 days'
    GROUP BY 
      COALESCE(NULLIF(TRIM(s.user_provided_city), ''), NULLIF(TRIM(s.city), ''), 'Unknown'),
      COALESCE(NULLIF(TRIM(s.user_provided_state), ''), NULLIF(TRIM(s.region), ''), ''),
      COALESCE(s.country_name, s.country_code, '')
    ORDER BY scan_count DESC
    LIMIT 10
  `);
  
  console.log('Top 10 Cities (Last 7 Days):');
  if (citiesResult.rows.length === 0) {
    console.log('  No scan data found');
  } else {
    citiesResult.rows.forEach((row, idx) => {
      const location = row.region ? `${row.city}, ${row.region}` : row.city;
      const userProvided = row.user_provided_count > 0 ? ` (${row.user_provided_count} user-provided)` : '';
      console.log(`  ${idx + 1}. ${location} ${row.country ? `(${row.country})` : ''}: ${row.scan_count} scans${userProvided}`);
    });
  }
  
  return citiesResult.rows;
}

async function checkCodeFix() {
  console.log('\n🔍 STEP 5: Verifying Code Fix\n');
  
  console.log('Checking if client-side code passes userLocation...');
  
  const fs = require('fs');
  const path = require('path');
  
  // Check if the fix is in place
  const playlistAccessPath = path.join(__dirname, 'app/(public)/playlist-access/[id].tsx');
  const slideshowAccessPath = path.join(__dirname, 'app/(public)/slideshow-access/[id].tsx');
  const analyticsServicePath = path.join(__dirname, 'services/analyticsService.ts');
  
  let allFixed = true;
  
  // Check playlist-access
  try {
    const playlistContent = fs.readFileSync(playlistAccessPath, 'utf8');
    if (playlistContent.includes('userLocation: userLoc')) {
      console.log('  ✅ playlist-access/[id].tsx: Passes userLocation');
    } else {
      console.log('  ❌ playlist-access/[id].tsx: NOT passing userLocation');
      allFixed = false;
    }
  } catch (e) {
    console.log('  ⚠️  Could not read playlist-access file');
  }
  
  // Check slideshow-access
  try {
    const slideshowContent = fs.readFileSync(slideshowAccessPath, 'utf8');
    if (slideshowContent.includes('userLocation: userLoc')) {
      console.log('  ✅ slideshow-access/[id].tsx: Passes userLocation');
    } else {
      console.log('  ❌ slideshow-access/[id].tsx: NOT passing userLocation');
      allFixed = false;
    }
  } catch (e) {
    console.log('  ⚠️  Could not read slideshow-access file');
  }
  
  // Check analyticsService
  try {
    const analyticsContent = fs.readFileSync(analyticsServicePath, 'utf8');
    if (analyticsContent.includes('userLocation?: { city: string')) {
      console.log('  ✅ analyticsService.ts: Accepts userLocation parameter');
    } else {
      console.log('  ❌ analyticsService.ts: NOT accepting userLocation');
      allFixed = false;
    }
  } catch (e) {
    console.log('  ⚠️  Could not read analyticsService file');
  }
  
  return allFixed;
}

async function showRecommendations(providerConfig, stats) {
  console.log('\n📋 RECOMMENDATIONS\n');
  
  const hasProvider = providerConfig.hasProvider && providerConfig.hasApiKey;
  const cityDataPercentage = stats.total_scans > 0 
    ? Math.round((stats.scans_with_any_city / stats.total_scans) * 100)
    : 0;
  
  if (!hasProvider) {
    console.log('🎯 Priority 1: Configure External Geolocation Provider');
    console.log('   Current: Auto-detected city data is limited');
    console.log('   Solution: Configure ipinfo.io or ipdata.co');
    console.log('   Steps:');
    console.log('     1. Sign up at https://ipinfo.io/signup (free tier: 50K requests/month)');
    console.log('     2. Get your API token');
    console.log('     3. Add to Railway environment variables:');
    console.log('        GEO_PROVIDER=ipinfo');
    console.log('        GEO_API_KEY=your_token_here');
    console.log('     4. Restart your Railway deployment');
    console.log('');
  }
  
  if (cityDataPercentage < 30) {
    console.log('🎯 Priority 2: Increase User-Provided Location Collection');
    console.log('   Current: Only ' + cityDataPercentage + '% of scans have city data');
    console.log('   Solution: Ensure location prompt is showing to users');
    console.log('   The app already has a location prompt - make sure it\'s enabled');
    console.log('');
  }
  
  console.log('📖 For detailed instructions, see:');
  console.log('   - GEO_LOCATION_FIX_GUIDE.md');
  console.log('   - env.example (lines 60-79)');
  console.log('');
  
  if (hasProvider && cityDataPercentage >= 30) {
    console.log('✅ Everything looks good! City data is being captured.');
    console.log('   Continue monitoring analytics to ensure accuracy.');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  City Analytics Fix Verification');
  console.log('═══════════════════════════════════════════════════════');
  
  try {
    const providerConfig = await testGeoProviderConfiguration();
    const schemaOk = await checkDatabaseSchema();
    const stats = await analyzeRecentScans();
    const cities = await showTopCities();
    const codeFixed = await checkCodeFix();
    
    await showRecommendations(providerConfig, stats);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Verification Complete');
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
  } finally {
    await pool.end();
  }
}

main();

