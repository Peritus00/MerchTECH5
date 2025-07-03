#!/usr/bin/env node

/**
 * Environment Validation Script
 * Quick check to ensure environment is properly configured
 */

const fs = require('fs');
const path = require('path');

function checkFile(filePath, description) {
  const exists = fs.existsSync(filePath);
  console.log(`${exists ? '✅' : '❌'} ${description}: ${exists ? 'Found' : 'Missing'}`);
  return exists;
}

function checkEnvVar(varName, description) {
  const value = process.env[varName];
  const exists = !!value;
  console.log(`${exists ? '✅' : '❌'} ${description}: ${exists ? 'Set' : 'Missing'}`);
  if (exists && varName.includes('URL')) {
    console.log(`    → ${value}`);
  }
  return exists;
}

function validateUrls() {
  console.log('\n🔗 URL Validation:');
  
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const frontendUrl = process.env.FRONTEND_URL;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (apiUrl) {
    const isHttps = apiUrl.startsWith('https://');
    const isLocalhost = apiUrl.includes('localhost');
    
    if (nodeEnv === 'production') {
      console.log(`${isHttps ? '✅' : '❌'} API URL uses HTTPS: ${isHttps ? 'Yes' : 'No'}`);
      console.log(`${!isLocalhost ? '✅' : '❌'} API URL not localhost: ${!isLocalhost ? 'Yes' : 'No'}`);
    } else {
      console.log(`ℹ️  Development mode - localhost URLs are OK`);
    }
  }
  
  if (frontendUrl) {
    const isHttps = frontendUrl.startsWith('https://');
    const isLocalhost = frontendUrl.includes('localhost');
    
    if (nodeEnv === 'production') {
      console.log(`${isHttps ? '✅' : '❌'} Frontend URL uses HTTPS: ${isHttps ? 'Yes' : 'No'}`);
      console.log(`${!isLocalhost ? '✅' : '❌'} Frontend URL not localhost: ${!isLocalhost ? 'Yes' : 'No'}`);
    }
  }
}

function validateStripeKeys() {
  console.log('\n💳 Stripe Configuration:');
  
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publicKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (secretKey) {
    const isLive = secretKey.startsWith('sk_live_');
    const isTest = secretKey.startsWith('sk_test_');
    
    if (nodeEnv === 'production') {
      console.log(`${isLive ? '✅' : '❌'} Using live secret key: ${isLive ? 'Yes' : 'No'}`);
    } else {
      console.log(`${isTest ? '✅' : '⚠️'} Using test secret key: ${isTest ? 'Yes' : 'No'}`);
    }
  }
  
  if (publicKey) {
    const isLive = publicKey.startsWith('pk_live_');
    const isTest = publicKey.startsWith('pk_test_');
    
    if (nodeEnv === 'production') {
      console.log(`${isLive ? '✅' : '❌'} Using live public key: ${isLive ? 'Yes' : 'No'}`);
    } else {
      console.log(`${isTest ? '✅' : '⚠️'} Using test public key: ${isTest ? 'Yes' : 'No'}`);
    }
  }
}

function main() {
  console.log('🔍 Environment Validation\n');
  
  // Check for environment files
  console.log('📁 Environment Files:');
  const hasEnv = checkFile('.env', '.env file');
  const hasEnvProd = checkFile('.env.production', '.env.production file');
  const hasEnvExample = checkFile('env.example', 'env.example template');
  
  // Check required environment variables
  console.log('\n🔧 Environment Variables:');
  const hasApiUrl = checkEnvVar('EXPO_PUBLIC_API_URL', 'API Base URL');
  const hasDbUrl = checkEnvVar('DATABASE_URL', 'Database URL');
  const hasJwtSecret = checkEnvVar('JWT_SECRET', 'JWT Secret');
  const hasStripeSecret = checkEnvVar('STRIPE_SECRET_KEY', 'Stripe Secret Key');
  const hasStripePublic = checkEnvVar('STRIPE_PUBLISHABLE_KEY', 'Stripe Public Key');
  const hasFrontendUrl = checkEnvVar('FRONTEND_URL', 'Frontend URL');
  
  // Validate URLs and keys
  validateUrls();
  validateStripeKeys();
  
  // Check configuration files
  console.log('\n⚙️ Configuration Files:');
  checkFile('config/environment.ts', 'Environment config helper');
  checkFile('PRODUCTION_DEPLOYMENT_GUIDE.md', 'Deployment guide');
  
  // Summary
  console.log('\n📊 Summary:');
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`Environment: ${nodeEnv}`);
  
  const criticalVars = [hasApiUrl, hasDbUrl, hasJwtSecret];
  const allCritical = criticalVars.every(Boolean);
  
  console.log(`${allCritical ? '✅' : '❌'} Critical variables: ${allCritical ? 'All set' : 'Missing some'}`);
  
  if (!allCritical) {
    console.log('\n💡 To fix missing configuration:');
    console.log('   npm run deploy:setup');
  }
  
  console.log('\n🚀 Ready for deployment:', allCritical ? 'Yes' : 'No');
}

if (require.main === module) {
  main();
}

module.exports = { main }; 