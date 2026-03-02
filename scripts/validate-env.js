#!/usr/bin/env node
/**
 * Environment Variable Validation Script
 * Validates all required environment variables before server startup
 * Fails fast with clear error messages if any are missing
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const requiredVars = {
  // Critical - server cannot start without these
  CRITICAL: [
    'JWT_SECRET',
    'DATABASE_URL'
  ],
  // Important - server can start but features won't work
  IMPORTANT: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET_NAME',
    'STRIPE_SECRET_KEY',
    'BREVO_SMTP_KEY',
    'GOOGLE_CLIENT_ID'
  ],
  // Optional - nice to have for production
  OPTIONAL: [
    'FRONTEND_URL',
    'GEO_PROVIDER',
    'GEO_API_KEY',
    'APPLE_CLIENT_ID',
    'APPLE_SERVICE_ID'
  ]
};

function validateEnvVars() {
  const missing = {
    critical: [],
    important: [],
    optional: []
  };

  // Check critical vars
  requiredVars.CRITICAL.forEach(varName => {
    if (!process.env[varName]) {
      missing.critical.push(varName);
    }
  });

  // Check important vars
  requiredVars.IMPORTANT.forEach(varName => {
    if (!process.env[varName]) {
      missing.important.push(varName);
    }
  });

  // Check optional vars
  requiredVars.OPTIONAL.forEach(varName => {
    if (!process.env[varName]) {
      missing.optional.push(varName);
    }
  });

  // Report results
  console.log('\n🔍 Environment Variable Validation\n');
  console.log('='.repeat(50));

  if (missing.critical.length > 0) {
    console.error('\n❌ CRITICAL: Missing required environment variables:');
    missing.critical.forEach(v => console.error(`   - ${v}`));
    console.error('\n⚠️  Server cannot start without these variables.');
    console.error('   Please check your .env file and ensure all critical variables are set.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All critical environment variables are set');
  }

  if (missing.important.length > 0) {
    console.warn('\n⚠️  IMPORTANT: Missing recommended environment variables:');
    missing.important.forEach(v => console.warn(`   - ${v}`));
    console.warn('   Server will start but some features may not work correctly.\n');
  } else {
    console.log('✅ All important environment variables are set');
  }

  if (missing.optional.length > 0) {
    console.log('\nℹ️  OPTIONAL: Missing optional environment variables:');
    missing.optional.forEach(v => console.log(`   - ${v}`));
    console.log('   These are nice to have but not required.\n');
  } else {
    console.log('✅ All optional environment variables are set');
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      console.warn('\n⚠️  WARNING: JWT_SECRET is less than 32 characters.');
      console.warn('   For production, use a strong secret (at least 32 characters).');
    } else if (process.env.JWT_SECRET === 'your-fallback-secret-key') {
      console.error('\n❌ CRITICAL: JWT_SECRET is using the default fallback value!');
      console.error('   This is a security risk. Please set a unique, strong secret.');
      process.exit(1);
    } else {
      console.log('✅ JWT_SECRET is properly configured');
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Environment validation complete\n');
}

// Run validation
if (require.main === module) {
  validateEnvVars();
}

module.exports = { validateEnvVars, requiredVars };
