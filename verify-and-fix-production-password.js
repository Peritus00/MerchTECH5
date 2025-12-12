const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

/**
 * This script verifies and fixes the password for perrie.benton@gmail.com
 * It uses the DATABASE_URL from environment (should match Railway production)
 */

const email = 'perrie.benton@gmail.com';
const expectedPassword = 'Kerrie321$';

async function verifyAndFix() {
  console.log('🔧 Verify and Fix Production Password');
  console.log('====================================\n');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set in environment');
    console.error('   Please set DATABASE_URL to your production database');
    return;
  }
  
  // Extract database info
  const dbHost = dbUrl.includes('@') 
    ? dbUrl.split('@')[1]?.split('/')[0] || 'unknown'
    : 'unknown';
  console.log(`📊 Database Host: ${dbHost}`);
  console.log('');
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  
  try {
    // Get user
    console.log(`🔍 Looking up user: ${email}`);
    const userResult = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = userResult.rows[0];
    console.log(`✅ User found: ID ${user.id}, Email: ${user.email}`);
    console.log('');
    
    if (!user.password_hash) {
      console.log('❌ No password hash - user is social login only');
      console.log('🔧 Creating password hash...');
      const hashedPassword = await bcrypt.hash(expectedPassword, 12);
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [hashedPassword, user.id]
      );
      console.log('✅ Password hash created');
    } else {
      // Test current password
      console.log('🧪 Testing current password hash...');
      const isValid = await bcrypt.compare(expectedPassword, user.password_hash);
      
      if (isValid) {
        console.log('✅ Password hash is CORRECT');
        console.log('');
        console.log('📝 The password should work. If login still fails:');
        console.log('   1. Check Railway logs for detailed error messages');
        console.log('   2. Verify the production server is deployed with latest code');
        console.log('   3. Check if password is being modified during transmission');
        return;
      } else {
        console.log('❌ Password hash does NOT match expected password');
        console.log('🔧 Updating password hash...');
      }
    }
    
    // Update password
    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(expectedPassword, 12);
    
    console.log('💾 Updating password in database...');
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, user.id]
    );
    
    console.log('✅ Password updated');
    console.log('');
    
    // Verify
    console.log('🧪 Verifying updated password...');
    const verifyResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.id]
    );
    const storedHash = verifyResult.rows[0].password_hash;
    const verifyMatch = await bcrypt.compare(expectedPassword, storedHash);
    
    if (verifyMatch) {
      console.log('✅ Verification: Password hash works correctly!');
      console.log('');
      console.log('📝 Summary:');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${expectedPassword}`);
      console.log(`   Database: ${dbHost}`);
      console.log(`   Status: Ready for login`);
      console.log('');
      console.log('⚠️  Next Steps:');
      console.log('   1. Try logging in with the password');
      console.log('   2. If it still fails, check Railway logs');
      console.log('   3. The enhanced logging will show what password the server receives');
    } else {
      console.log('❌ Verification failed - something went wrong');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

verifyAndFix();

