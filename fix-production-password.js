const bcrypt = require('bcryptjs'); // Use bcryptjs to match server
const { Pool } = require('pg');
require('dotenv').config();

// This script fixes the password for perrie.benton@gmail.com in production
// Make sure DATABASE_URL points to production before running

async function fixProductionPassword() {
  const email = 'perrie.benton@gmail.com';
  const newPassword = 'Kerrie321$';
  
  console.log('🔧 Fixing Production Password');
  console.log('==============================\n');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    return;
  }
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  
  try {
    // Get user
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = userResult.rows[0];
    console.log(`✅ Found user: ID ${user.id}, Email: ${user.email}`);
    console.log('');
    
    // Hash new password
    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    console.log(`   Hash length: ${hashedPassword.length}`);
    console.log(`   Hash prefix: ${hashedPassword.substring(0, 20)}...`);
    console.log('');
    
    // Update password
    console.log('💾 Updating password in database...');
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, user.id]
    );
    console.log('✅ Password updated');
    console.log('');
    
    // Verify
    console.log('🧪 Verifying password...');
    const verifyResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.id]
    );
    const storedHash = verifyResult.rows[0].password_hash;
    const isValid = await bcrypt.compare(newPassword, storedHash);
    
    if (isValid) {
      console.log('✅ Verification: Password works correctly!');
      console.log('');
      console.log('📝 Summary:');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${newPassword}`);
      console.log(`   Status: Ready for login`);
    } else {
      console.log('❌ Verification failed - something went wrong');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixProductionPassword();

