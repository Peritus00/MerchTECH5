#!/usr/bin/env node
/**
 * Run missing migrations for qr_scans table
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const migrationsToRun = [
    '012_add_qr_scan_fields.sql',
    '013_analytics_hardening.sql',
    '015_user_provided_location.sql',
    '016_browser_geo.sql'
  ];

  try {
    console.log('🚀 Running missing migrations for qr_scans table...\n');

    for (const migrationFile of migrationsToRun) {
      const migrationPath = path.join(__dirname, '../database/migrations', migrationFile);
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`⚠️  Skipping ${migrationFile} - file not found`);
        continue;
      }

      console.log(`📝 Running ${migrationFile}...`);
      
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await pool.query(sql);
        console.log(`   ✅ Successfully applied ${migrationFile}`);
      } catch (error) {
        // If error is about column already existing, that's okay
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`   ⏭️  Skipped ${migrationFile} (already applied)`);
        } else {
          console.error(`   ❌ Error applying ${migrationFile}:`, error.message);
          // Continue with other migrations
        }
      }
    }

    console.log('\n✅ Migration process completed!');
    console.log('\nVerifying schema...\n');

    // Verify the columns now exist
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'qr_scans' 
      ORDER BY ordinal_position
    `);

    const columns = result.rows.map(r => r.column_name);
    const requiredColumns = [
      'city', 'region', 'visitor_id', 'user_provided_city', 
      'user_provided_state', 'location_source', 'geo_lat', 'geo_lng'
    ];

    console.log('📋 Verification:');
    requiredColumns.forEach(col => {
      const exists = columns.includes(col);
      console.log(`  ${exists ? '✅' : '❌'} ${col}`);
    });

    // Check if we have the unique constraint for deduplication
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'qr_scans' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%dedupe%'
    `);

    if (constraintCheck.rows.length > 0) {
      console.log('\n✅ Deduplication constraint exists:', constraintCheck.rows[0].constraint_name);
    } else {
      console.log('\n⚠️  Deduplication constraint not found - duplicate scans may occur');
    }

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();

