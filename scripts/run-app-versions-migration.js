#!/usr/bin/env node
/**
 * Run migration for app_versions table
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not found');
    process.exit(1);
  }

  console.log('🔍 Connecting to database...');
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/024_create_app_versions_table.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Running migration: 024_create_app_versions_table.sql');
    console.log('   Creating app_versions table...');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Created:');
    console.log('   - app_versions table');
    console.log('   - Indexes for platform and version lookups');
    console.log('   - Trigger for updated_at timestamp');
    
    // Verify the table was created
    const verifyResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'app_versions'
      ORDER BY ordinal_position
    `);
    
    console.log('\n✅ Verification - Table columns:');
    verifyResult.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    
  } catch (error) {
    // If table already exists, that's okay
    if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
      console.log('⚠️  Table already exists - migration may have been run already');
      console.log('   This is okay, continuing...');
    } else {
      console.error('❌ Migration failed:', error.message);
      console.error('   Full error:', error);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { runMigration };

