/**
 * Verify accuracy of location data in QR scan analytics
 * Checks for inconsistencies, data sources, and deduplication accuracy
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function verifyLocationAccuracy() {
  try {
    const userId = 43; // Update with actual user ID if needed
    
    console.log('🔍 Verifying Location Data Accuracy\n');
    console.log('='.repeat(60));

    // 1. Check raw scan data with location info
    console.log('\n1️⃣ RAW SCAN DATA SAMPLE (First 10 scans):');
    const rawScans = await pool.query(`
      SELECT 
        s.id,
        s.scanned_at,
        s.location,
        s.city,
        s.region,
        s.country_name,
        s.country_code,
        s.ip_address,
        s.user_provided_city,
        s.user_provided_state,
        s.location_source,
        s.qr_visitor_id,
        s.visitor_id,
        q.name as qr_name
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `, [userId]);

    rawScans.rows.forEach((scan, idx) => {
      console.log(`\n   Scan #${idx + 1}:`);
      console.log(`     Time: ${scan.scanned_at}`);
      console.log(`     QR: ${scan.qr_name}`);
      console.log(`     Location: ${scan.location || 'NULL'}`);
      console.log(`     City (auto): ${scan.city || 'NULL'}`);
      console.log(`     Region (auto): ${scan.region || 'NULL'}`);
      console.log(`     Country: ${scan.country_name || 'NULL'} (${scan.country_code || 'NULL'})`);
      console.log(`     IP: ${scan.ip_address || 'NULL'}`);
      console.log(`     User Provided City: ${scan.user_provided_city || 'NULL'}`);
      console.log(`     User Provided State: ${scan.user_provided_state || 'NULL'}`);
      console.log(`     Location Source: ${scan.location_source || 'NULL'}`);
      console.log(`     Visitor ID: ${scan.qr_visitor_id || scan.visitor_id || 'NULL'}`);
    });

    // 2. Check location data sources breakdown
    console.log('\n\n2️⃣ LOCATION DATA SOURCES BREAKDOWN:');
    const sourceBreakdown = await pool.query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(CASE WHEN city IS NOT NULL THEN 1 END) as has_city,
        COUNT(CASE WHEN region IS NOT NULL THEN 1 END) as has_region,
        COUNT(CASE WHEN country_name IS NOT NULL THEN 1 END) as has_country_name,
        COUNT(CASE WHEN user_provided_city IS NOT NULL THEN 1 END) as has_user_provided_city,
        COUNT(CASE WHEN user_provided_state IS NOT NULL THEN 1 END) as has_user_provided_state,
        COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as has_location_field,
        COUNT(CASE WHEN ip_address IS NOT NULL THEN 1 END) as has_ip,
        COUNT(CASE WHEN location_source = 'user' THEN 1 END) as user_source,
        COUNT(CASE WHEN location_source = 'auto' THEN 1 END) as auto_source,
        COUNT(CASE WHEN location_source = 'unknown' THEN 1 END) as unknown_source
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
    `, [userId]);

    const breakdown = sourceBreakdown.rows[0];
    console.log(`   Total Scans: ${breakdown.total_scans}`);
    console.log(`   Has City (auto): ${breakdown.has_city} (${((breakdown.has_city / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Has Region (auto): ${breakdown.has_region} (${((breakdown.has_region / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Has Country Name: ${breakdown.has_country_name} (${((breakdown.has_country_name / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Has User Provided City: ${breakdown.has_user_provided_city} (${((breakdown.has_user_provided_city / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Has User Provided State: ${breakdown.has_user_provided_state} (${((breakdown.has_user_provided_state / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Has Location Field: ${breakdown.has_location_field} (${((breakdown.has_location_field / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Has IP Address: ${breakdown.has_ip} (${((breakdown.has_ip / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Location Source - User: ${breakdown.user_source} (${((breakdown.user_source / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Location Source - Auto: ${breakdown.auto_source} (${((breakdown.auto_source / breakdown.total_scans) * 100).toFixed(1)}%)`);
    console.log(`   Location Source - Unknown: ${breakdown.unknown_source} (${((breakdown.unknown_source / breakdown.total_scans) * 100).toFixed(1)}%)`);

    // 3. Check top cities (raw vs deduplicated)
    console.log('\n\n3️⃣ TOP CITIES COMPARISON (Raw vs Deduplicated):');
    
    // Raw top cities
    const rawCities = await pool.query(`
      SELECT 
        COALESCE(s.user_provided_city, s.city, 'Unknown') as city,
        COALESCE(s.user_provided_state, s.region, '') as region,
        COALESCE(s.country_code, 'Unknown') as country,
        COUNT(*) as scan_count
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
      GROUP BY s.user_provided_city, s.user_provided_state, s.city, s.region, s.country_code
      ORDER BY scan_count DESC
      LIMIT 5
    `, [userId]);

    console.log('\n   RAW COUNTS (All Scans):');
    rawCities.rows.forEach((city, idx) => {
      console.log(`     ${idx + 1}. ${city.city}${city.region ? ', ' + city.region : ''} • ${city.country}: ${city.scan_count} scans`);
    });

    // Deduplicated top cities (matching analytics)
    const dedupCities = await pool.query(`
      WITH dedup AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id, s.user_provided_city, s.user_provided_state, s.city, s.region, s.country_code
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT 
        COALESCE(d.user_provided_city, d.city, 'Unknown') as city,
        COALESCE(d.user_provided_state, d.region, '') as region,
        COALESCE(d.country_code, 'Unknown') as country,
        COUNT(*) as scan_count
      FROM dedup d
      GROUP BY d.user_provided_city, d.user_provided_state, d.city, d.region, d.country_code
      ORDER BY scan_count DESC
      LIMIT 5
    `, [userId]);

    console.log('\n   DEDUPLICATED COUNTS (Unique Visitor/Minute):');
    dedupCities.rows.forEach((city, idx) => {
      console.log(`     ${idx + 1}. ${city.city}${city.region ? ', ' + city.region : ''} • ${city.country}: ${city.scan_count} scans`);
    });

    // 4. Check for "Unknown" locations
    console.log('\n\n4️⃣ UNKNOWN LOCATION ANALYSIS:');
    const unknownAnalysis = await pool.query(`
      SELECT 
        COUNT(*) as total_unknown,
        COUNT(CASE WHEN city IS NULL AND user_provided_city IS NULL THEN 1 END) as no_city_no_user,
        COUNT(CASE WHEN ip_address IS NULL THEN 1 END) as no_ip,
        COUNT(CASE WHEN city IS NULL AND ip_address IS NOT NULL THEN 1 END) as has_ip_no_city
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
        AND (city IS NULL OR city = 'Unknown')
        AND (user_provided_city IS NULL OR user_provided_city = '')
    `, [userId]);

    const unknown = unknownAnalysis.rows[0];
    console.log(`   Total Scans with Unknown/Null City: ${unknown.total_unknown}`);
    console.log(`   No City & No User Provided: ${unknown.no_city_no_user}`);
    console.log(`   No IP Address: ${unknown.no_ip}`);
    console.log(`   Has IP but No City: ${unknown.has_ip_no_city}`);

    // 5. Check user-provided vs IP geolocation conflicts
    console.log('\n\n5️⃣ USER-PROVIDED vs IP GEOLOCATION COMPARISON:');
    const comparison = await pool.query(`
      SELECT 
        s.id,
        s.user_provided_city,
        s.user_provided_state,
        s.city as ip_city,
        s.region as ip_region,
        s.country_code as ip_country,
        s.location_source,
        CASE 
          WHEN s.user_provided_city IS NOT NULL AND s.city IS NOT NULL 
            AND s.user_provided_city != s.city 
          THEN 'MISMATCH'
          WHEN s.user_provided_city IS NOT NULL AND s.city IS NULL
          THEN 'USER_ONLY'
          WHEN s.user_provided_city IS NULL AND s.city IS NOT NULL
          THEN 'IP_ONLY'
          ELSE 'UNKNOWN'
        END as source_type
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
        AND (s.user_provided_city IS NOT NULL OR s.city IS NOT NULL)
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `, [userId]);

    console.log('\n   Sample Scans with Location Data:');
    comparison.rows.forEach((scan, idx) => {
      console.log(`\n   Scan #${idx + 1}:`);
      console.log(`     User Provided: ${scan.user_provided_city || 'NULL'}${scan.user_provided_state ? ', ' + scan.user_provided_state : ''}`);
      console.log(`     IP Geolocation: ${scan.ip_city || 'NULL'}${scan.ip_region ? ', ' + scan.ip_region : ''} • ${scan.ip_country || 'NULL'}`);
      console.log(`     Location Source: ${scan.location_source || 'NULL'}`);
      console.log(`     Source Type: ${scan.source_type}`);
    });

    // 6. Verify deduplication is working correctly
    console.log('\n\n6️⃣ DEDUPLICATION VERIFICATION:');
    const dedupCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_raw_scans,
        COUNT(DISTINCT COALESCE(qr_visitor_id, visitor_id::text, ip_address::text)) as unique_visitors_raw,
        COUNT(DISTINCT qr_code_id || '|' || COALESCE(qr_visitor_id, visitor_id::text, ip_address::text, CONCAT(COALESCE(browser_name,'?'), '|', COALESCE(operating_system,'?'))) || '|' || date_trunc('minute', scanned_at)::text) as unique_visitor_minute_combos
      FROM qr_scans s
      JOIN qr_codes q ON s.qr_code_id = q.id
      WHERE q.user_id = $1
    `, [userId]);

    const dedup = dedupCheck.rows[0];
    console.log(`   Total Raw Scans: ${dedup.total_raw_scans}`);
    console.log(`   Unique Visitors (by ID/IP): ${dedup.unique_visitors_raw}`);
    console.log(`   Unique Visitor-Minute Combinations: ${dedup.unique_visitor_minute_combos}`);
    console.log(`   Deduplication Ratio: ${((dedup.unique_visitor_minute_combos / dedup.total_raw_scans) * 100).toFixed(1)}%`);

    // 7. Check what analytics endpoint actually returns
    console.log('\n\n7️⃣ ANALYTICS ENDPOINT OUTPUT SIMULATION:');
    const analyticsSim = await pool.query(`
      WITH dedup AS (
        SELECT DISTINCT ON (
          s.qr_code_id,
          COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))),
          date_trunc('minute', s.scanned_at)
        ) s.id, s.user_provided_city, s.user_provided_state, s.city, s.region, s.country_code
        FROM qr_scans s
        JOIN qr_codes q ON s.qr_code_id = q.id
        WHERE q.user_id = $1
        ORDER BY s.qr_code_id, COALESCE(s.qr_visitor_id, s.visitor_id::text, s.ip_address::text, CONCAT(COALESCE(s.browser_name,'?'), '|', COALESCE(s.operating_system,'?'))), date_trunc('minute', s.scanned_at), s.scanned_at ASC
      )
      SELECT 
        COALESCE(d.user_provided_city, d.city, 'Unknown') as city,
        COALESCE(d.user_provided_state, d.region, '') as region,
        COALESCE(d.country_code, 'Unknown') as country,
        COUNT(*) as scan_count
      FROM dedup d
      GROUP BY d.user_provided_city, d.user_provided_state, d.city, d.region, d.country_code
      ORDER BY scan_count DESC
      LIMIT 5
    `, [userId]);

    console.log('\n   Top 5 Cities (Analytics Format):');
    analyticsSim.rows.forEach((city, idx) => {
      console.log(`     ${idx + 1}. ${city.city}${city.region ? ', ' + city.region : ''} • ${city.country}: ${city.scan_count} scans`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Verification Complete!');
    console.log('\nKey Checks:');
    console.log('  - Compare raw vs deduplicated counts above');
    console.log('  - Verify location data sources match expectations');
    console.log('  - Check for data quality issues (missing IPs, unknown locations)');
    console.log('  - Review user-provided vs IP geolocation conflicts');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

verifyLocationAccuracy();

