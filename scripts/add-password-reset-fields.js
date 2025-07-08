const { Pool } = require('pg');
require('dotenv').config();

async function addPasswordResetFields() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Adding password reset fields to users table...');
    
    // Add the new columns
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(500);
    `);
    
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
    `);
    
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
    `);
    
    // Add indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_reset_token_expires ON users(reset_token_expires);
    `);
    
    console.log('✅ Password reset fields added successfully!');
    
  } catch (error) {
    console.error('❌ Error adding password reset fields:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addPasswordResetFields(); 