#!/usr/bin/env node

/**
 * Run Demographics Migrations
 * Adds user_provided_age_range and user_provided_gender columns to qr_scans
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runMigrations() {
  try {
    console.log('🚀 Running demographics migrations...\n');
    
    const migrations = [
      {
        file: '017_add_user_age_range.sql',
        name: 'Add user_provided_age_range column'
      },
      {
        file: '018_add_user_gender.sql',
        name: 'Add user_provided_gender column'
      }
    ];
    
    for (const migration of migrations) {
      console.log(`📝 Running: ${migration.name}`);
      const migrationPath = path.join(__dirname, '..', 'database', 'migrations', migration.file);
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`   ⚠️  File not found: ${migrationPath}`);
        continue;
      }
      
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await pool.query(sql);
        console.log(`   ✅ Success!`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`   ℹ️  Already applied (skipped)`);
        } else {
          console.error(`   ❌ Error:`, error.message);
          // Continue with other migrations
        }
      }
      console.log('');
    }
    
    // Verify columns exist
    console.log('🔍 Verifying columns...\n');
    const columns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'qr_scans' 
        AND column_name IN ('user_provided_age_range', 'user_provided_gender')
      ORDER BY column_name
    `);
    
    if (columns.rows.length === 2) {
      console.log('✅ All demographics columns exist!');
      columns.rows.forEach(col => console.log(`   - ${col.column_name}`));
    } else {
      console.log('⚠️  Missing columns:');
      const existing = columns.rows.map(r => r.column_name);
      if (!existing.includes('user_provided_age_range')) {
        console.log('   ❌ user_provided_age_range');
      }
      if (!existing.includes('user_provided_gender')) {
        console.log('   ❌ user_provided_gender');
      }
    }
    
    console.log('\n✅ Migration check complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigrations().catch(console.error);

