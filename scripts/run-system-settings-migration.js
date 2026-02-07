const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSystemSettingsMigration() {
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
    const migrationPath = path.join(__dirname, '../database/migrations/031_create_system_settings.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Running migration: 031_create_system_settings.sql');
    console.log('   Creating system_settings table...');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('📊 Created:');
    console.log('   - system_settings table');
    console.log('   - Initial signups_enabled setting (default: true)');
    
    // Verify the migration
    const verifyResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key = 'signups_enabled'"
    );
    
    if (verifyResult.rows.length > 0) {
      console.log(`\n✅ Verified: signups_enabled = ${verifyResult.rows[0].setting_value}`);
    } else {
      console.log('\n⚠️  Warning: Could not verify migration');
    }
    
  } catch (error) {
    // If table already exists, that's okay
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log('⏭️  Migration already applied (table exists)');
      console.log('✅ System is ready!');
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
  runSystemSettingsMigration()
    .then(() => {
      console.log('\n🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runSystemSettingsMigration };
