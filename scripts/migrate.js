
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔄 Running database migrations...');
    
    const migrationPath = path.join(__dirname, '../database/migrations/001_create_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await pool.query(migrationSQL);
    
    console.log('✅ Database migrations completed successfully!');
    console.log('📊 Tables created:');
    console.log('  - users');
    console.log('  - qr_codes');
    console.log('  - qr_scans');
    console.log('  - products');
    console.log('  - slideshows');
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
