#!/usr/bin/env node

/**
 * Run Demographics Migrations on Neon Database
 * This script runs migrations 017, 018, and 019 to add demographics support
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.production' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  console.error('Make sure .env.production exists with DATABASE_URL');
  process.exit(1);
}

console.log('🔗 Connecting to database...');
console.log('Database:', DATABASE_URL.split('@')[1]?.split('/')[0] || 'hidden');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const migrations = [
  {
    name: '017_add_user_age_range.sql',
    description: 'Add user_provided_age_range to qr_scans table'
  },
  {
    name: '018_add_user_gender.sql',
    description: 'Add user_provided_gender to qr_scans table'
  },
  {
    name: '019_add_user_demographics.sql',
    description: 'Add age_range and gender to users table'
  }
];

async function runMigrations() {
  try {
    console.log('\n🚀 Starting demographics migrations...\n');
    
    for (const migration of migrations) {
      console.log(`📄 Running: ${migration.name}`);
      console.log(`   ${migration.description}`);
      
      const migrationPath = path.join(__dirname, 'database', 'migrations', migration.name);
      
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
          throw error;
        }
      }
      
      console.log('');
    }
    
    console.log('✅ All demographics migrations completed!\n');
    
    // Verify columns exist
    console.log('🔍 Verifying columns...\n');
    
    const checks = [
      {
        query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'qr_scans' AND column_name = 'user_provided_age_range'",
        name: 'qr_scans.user_provided_age_range'
      },
      {
        query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'qr_scans' AND column_name = 'user_provided_gender'",
        name: 'qr_scans.user_provided_gender'
      },
      {
        query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'age_range'",
        name: 'users.age_range'
      },
      {
        query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'gender'",
        name: 'users.gender'
      }
    ];
    
    for (const check of checks) {
      const result = await pool.query(check.query);
      if (result.rows.length > 0) {
        console.log(`✅ ${check.name} exists`);
      } else {
        console.log(`❌ ${check.name} NOT FOUND`);
      }
    }
    
    console.log('\n🎉 Migration verification complete!');
    console.log('\n📊 You can now test the demographics survey and analytics.');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();

