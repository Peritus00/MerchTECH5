const { Pool } = require('pg');
require('dotenv').config();

async function addLastUsedAtColumn() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Adding last_used_at column to activation_codes table...\n');
    
    // Add the missing column
    await pool.query(`
      ALTER TABLE activation_codes 
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP DEFAULT NULL;
    `);
    
    console.log('✅ Added last_used_at column to activation_codes table');
    
    // Add index for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_activation_codes_last_used_at ON activation_codes(last_used_at);
    `);
    
    console.log('✅ Added index for last_used_at column');
    
    // Verify the column was added
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'activation_codes' AND column_name = 'last_used_at';
    `);
    
    if (columns.rows.length > 0) {
      console.log('✅ Verified last_used_at column exists:', columns.rows[0]);
    } else {
      console.log('❌ Column was not added successfully');
    }
    
  } catch (error) {
    console.error('❌ Error adding last_used_at column:', error.message);
  } finally {
    await pool.end();
  }
}

addLastUsedAtColumn(); 