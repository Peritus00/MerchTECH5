const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔄 Running database migrations...');
    
    // Run migrations in order
    const migrations = [
      '001_create_tables.sql',
      '002_add_slideshow_fields.sql'
    ];
    
    for (const migrationFile of migrations) {
      console.log(`📝 Running migration: ${migrationFile}`);
      const migrationPath = path.join(__dirname, '../database/migrations', migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      await pool.query(migrationSQL);
      console.log(`✅ Completed: ${migrationFile}`);
    }
    
    console.log('✅ All database migrations completed successfully!');
    console.log('📊 Tables and columns updated:');
    console.log('  - users');
    console.log('  - qr_codes');
    console.log('  - qr_scans');
    console.log('  - products');
    console.log('  - slideshows (with autoplay_interval, transition, requires_activation_code)');
    console.log('  - slideshow_images');
    console.log('  - fanmail');
    console.log('  - achievement_levels');
    console.log('  - user_achievements');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
