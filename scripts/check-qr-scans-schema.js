#!/usr/bin/env node
/**
 * Check qr_scans table schema to see which columns exist
 */

require('dotenv').config();
const { Pool } = require('pg');

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Checking qr_scans table schema...\n');

    // Get column information
    const result = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'qr_scans' 
      ORDER BY ordinal_position
    `);

    if (result.rows.length === 0) {
      console.error('❌ qr_scans table not found!');
      process.exit(1);
    }

    console.log('✅ Current qr_scans columns:');
    console.log('─'.repeat(80));
    result.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const type = col.character_maximum_length 
        ? `${col.data_type}(${col.character_maximum_length})`
        : col.data_type;
      console.log(`  ${col.column_name.padEnd(25)} ${type.padEnd(20)} ${nullable}`);
    });
    console.log('─'.repeat(80));

    // Check for required columns
    const columnNames = result.rows.map(r => r.column_name);
    const requiredColumns = {
      'city': 'Migration 012',
      'region': 'Migration 012',
      'visitor_id': 'Migration 012',
      'user_provided_city': 'Migration 015',
      'user_provided_state': 'Migration 015',
      'user_provided_zip': 'Migration 015',
      'location_source': 'Migration 015',
      'geo_lat': 'Migration 016',
      'geo_lng': 'Migration 016',
      'geo_accuracy_m': 'Migration 016',
      'geo_consent': 'Migration 016',
      'qr_visitor_id': 'Migration 015',
      'utm_source': 'Migration 012',
      'utm_medium': 'Migration 012',
      'utm_campaign': 'Migration 012'
    };

    console.log('\n📋 Required columns status:');
    console.log('─'.repeat(80));
    
    const missing = [];
    for (const [col, migration] of Object.entries(requiredColumns)) {
      const exists = columnNames.includes(col);
      const status = exists ? '✅' : '❌';
      console.log(`  ${status} ${col.padEnd(25)} ${migration}`);
      if (!exists) missing.push({ col, migration });
    }
    console.log('─'.repeat(80));

    if (missing.length > 0) {
      console.log('\n⚠️  Missing columns detected!');
      console.log('   Need to run these migrations:');
      const migrations = [...new Set(missing.map(m => m.migration))];
      migrations.forEach(m => console.log(`   - ${m}`));
      console.log('\n   Run: node scripts/run-missing-migrations.js');
    } else {
      console.log('\n✅ All required columns exist!');
    }

    // Check for sample data with city info
    const sampleData = await pool.query(`
      SELECT 
        id,
        city,
        region,
        country_code,
        user_provided_city,
        user_provided_state,
        location_source,
        scanned_at
      FROM qr_scans 
      ORDER BY scanned_at DESC 
      LIMIT 5
    `);

    if (sampleData.rows.length > 0) {
      console.log('\n📊 Sample recent scans:');
      console.log('─'.repeat(80));
      sampleData.rows.forEach(row => {
        const city = row.user_provided_city || row.city || 'Unknown';
        const region = row.user_provided_state || row.region || '';
        const location = `${city}${region ? ', ' + region : ''}`;
        console.log(`  ID ${row.id}: ${location.padEnd(30)} [${row.location_source || 'unknown'}] ${row.country_code || ''}`);
      });
      console.log('─'.repeat(80));
    }

  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkSchema();

