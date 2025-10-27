#!/usr/bin/env node
/**
 * Fix remaining schema issues
 */

require('dotenv').config();
const { Pool } = require('pg');

async function fixSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Fixing remaining schema issues...\n');

    // Add qr_visitor_id column
    console.log('📝 Adding qr_visitor_id column...');
    await pool.query(`
      ALTER TABLE qr_scans 
      ADD COLUMN IF NOT EXISTS qr_visitor_id TEXT
    `);
    console.log('   ✅ Added qr_visitor_id column');

    // Create deduplication constraint (alternative approach that works on all PG versions)
    console.log('\n📝 Creating deduplication constraint...');
    try {
      // First check if constraint exists
      const checkConstraint = await pool.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'qr_scans' 
          AND constraint_name = 'uq_qr_scans_minute_dedupe'
      `);

      if (checkConstraint.rows.length === 0) {
        // Try creating unique index for deduplication
        // Use a simpler approach that doesn't require immutable functions
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_scans_minute_dedupe_simple
          ON qr_scans (qr_code_id, visitor_id, 
                       EXTRACT(YEAR FROM scanned_at)::int, 
                       EXTRACT(MONTH FROM scanned_at)::int, 
                       EXTRACT(DAY FROM scanned_at)::int,
                       EXTRACT(HOUR FROM scanned_at)::int,
                       EXTRACT(MINUTE FROM scanned_at)::int)
          WHERE visitor_id IS NOT NULL
        `);
        console.log('   ✅ Created deduplication index (minute-level)');
      } else {
        console.log('   ⏭️  Deduplication constraint already exists');
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⏭️  Deduplication index already exists');
      } else {
        console.log('   ⚠️  Could not create deduplication constraint:', error.message);
        console.log('   📝 This is not critical - the app will handle deduplication in code');
      }
    }

    // Update existing records to have location_source
    console.log('\n📝 Updating existing records...');
    const updateResult = await pool.query(`
      UPDATE qr_scans 
      SET location_source = CASE
        WHEN user_provided_city IS NOT NULL THEN 'user'
        WHEN city IS NOT NULL OR country_code IS NOT NULL THEN 'auto'
        ELSE 'unknown'
      END
      WHERE location_source IS NULL
    `);
    console.log(`   ✅ Updated ${updateResult.rowCount} records with location_source`);

    // Create helpful indexes
    console.log('\n📝 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_qr_scans_city ON qr_scans(city) WHERE city IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_qr_scans_region ON qr_scans(region) WHERE region IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_qr_scans_location_source ON qr_scans(location_source)',
      'CREATE INDEX IF NOT EXISTS idx_qr_scans_country_code ON qr_scans(country_code) WHERE country_code IS NOT NULL'
    ];

    for (const indexSQL of indexes) {
      try {
        await pool.query(indexSQL);
        console.log('   ✅ Created index');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('   ⏭️  Index already exists');
        }
      }
    }

    console.log('\n✅ Schema fixes completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixSchema();

