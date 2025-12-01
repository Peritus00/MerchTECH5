/**
 * Script to check and update admin status for djjetfuel@gmail.com
 * Run with: node check-admin-status.js
 */

const { Pool } = require('pg');

// Database connection - update with your Neon connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function checkAndUpdateAdmin() {
  try {
    console.log('🔍 Checking admin status for djjetfuel@gmail.com...\n');
    
    // Check current status
    const checkResult = await pool.query(
      'SELECT id, email, username, is_admin FROM users WHERE LOWER(email) = LOWER($1)',
      ['djjetfuel@gmail.com']
    );
    
    if (checkResult.rows.length === 0) {
      console.log('❌ User not found: djjetfuel@gmail.com');
      process.exit(1);
    }
    
    const user = checkResult.rows[0];
    console.log('📋 Current user data:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   is_admin: ${user.is_admin}`);
    console.log('');
    
    if (user.is_admin === true) {
      console.log('✅ User is already an admin. No changes needed.');
    } else {
      console.log('⚠️  User is NOT an admin. Updating...');
      
      // Update admin status
      const updateResult = await pool.query(
        'UPDATE users SET is_admin = true WHERE id = $1 RETURNING id, email, is_admin',
        [user.id]
      );
      
      console.log('✅ Admin status updated successfully!');
      console.log(`   Updated user: ${updateResult.rows[0].email}`);
      console.log(`   is_admin: ${updateResult.rows[0].is_admin}`);
    }
    
    await pool.end();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkAndUpdateAdmin();

