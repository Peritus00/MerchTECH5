const bcrypt = require('bcryptjs'); // Use bcryptjs to match server
const { Pool } = require('pg');
require('dotenv').config();

// This script checks the production database for the perrie user
// Make sure DATABASE_URL points to production before running

async function diagnoseProductionPassword() {
  const email = 'perrie.benton@gmail.com';
  const testPassword = 'Kerrie321$';
  
  console.log('🔍 Production Password Diagnosis');
  console.log('================================\n');
  
  // Check DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set in environment');
    console.error('   Please set DATABASE_URL to your production database');
    return;
  }
  
  // Extract database info (without exposing credentials)
  const dbInfo = dbUrl.includes('@') 
    ? dbUrl.split('@')[1]?.split('/')[0] || 'unknown'
    : 'unknown';
  console.log(`📊 Database Host: ${dbInfo}`);
  console.log(`📊 Database URL contains 'neon' or 'railway': ${dbUrl.includes('neon') || dbUrl.includes('railway')}`);
  console.log('');
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  
  try {
    console.log(`🔍 Looking up user: ${email}`);
    
    // Get user from database
    const result = await pool.query(
      'SELECT id, email, username, password_hash, google_id, apple_id, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User not found in database');
      console.log('   This could mean:');
      console.log('   - Wrong database (check DATABASE_URL)');
      console.log('   - User was deleted');
      console.log('   - Email is different');
      return;
    }
    
    if (result.rows.length > 1) {
      console.log(`⚠️  WARNING: Found ${result.rows.length} users with this email!`);
      result.rows.forEach((row, idx) => {
        console.log(`   User ${idx + 1}: ID=${row.id}, email=${row.email}`);
      });
    }
    
    const user = result.rows[0];
    console.log(`✅ User found:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Username: ${user.username || 'N/A'}`);
    console.log(`   Created: ${user.created_at}`);
    console.log(`   Google ID: ${user.google_id || 'None'}`);
    console.log(`   Apple ID: ${user.apple_id || 'None'}`);
    console.log('');
    
    // Check password hash
    if (!user.password_hash) {
      console.log('❌ No password hash found');
      console.log('   This user may be a social login only account');
      console.log('   They cannot log in with email/password');
      return;
    }
    
    console.log(`🔐 Password Hash Info:`);
    console.log(`   Exists: Yes`);
    console.log(`   Length: ${user.password_hash.length} characters`);
    console.log(`   Prefix: ${user.password_hash.substring(0, 20)}...`);
    console.log(`   Format: ${user.password_hash.startsWith('$2') ? 'bcrypt (correct)' : 'UNKNOWN FORMAT'}`);
    console.log('');
    
    // Test password
    console.log(`🧪 Testing password: "${testPassword}"`);
    console.log(`   Password length: ${testPassword.length}`);
    console.log(`   Contains special chars: ${/[!@#$%^&*(),.?":{}|<>]/.test(testPassword)}`);
    console.log('');
    
    const isValid = await bcrypt.compare(testPassword, user.password_hash);
    
    if (isValid) {
      console.log('✅ Password verification: SUCCESS');
      console.log('');
      console.log('📝 Analysis:');
      console.log('   The password hash in the database is CORRECT.');
      console.log('   If login is still failing, the issue is likely:');
      console.log('   1. Frontend sending wrong password (extra spaces, encoding issues)');
      console.log('   2. Frontend connecting to wrong API endpoint');
      console.log('   3. API endpoint not using this database');
      console.log('   4. Password being modified during transmission');
    } else {
      console.log('❌ Password verification: FAILED');
      console.log('');
      console.log('📝 Analysis:');
      console.log('   The password hash does NOT match the expected password.');
      console.log('   This means:');
      console.log('   1. Password was changed incorrectly');
      console.log('   2. Wrong password was stored');
      console.log('   3. Hash was corrupted');
      console.log('');
      console.log('🔧 Solution:');
      console.log('   We need to reset the password properly.');
      console.log('   Run: node fix-production-password.js');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

diagnoseProductionPassword();

