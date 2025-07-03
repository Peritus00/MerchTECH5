#!/usr/bin/env node

/**
 * Deployment Setup Script
 * Helps configure environment variables and validate deployment readiness
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function validateUrl(url, type) {
  const errors = [];
  
  if (!url) {
    errors.push(`${type} URL is required`);
    return errors;
  }
  
  if (type === 'production') {
    if (!url.startsWith('https://')) {
      errors.push(`${type} URL must use HTTPS`);
    }
    if (url.includes('localhost')) {
      errors.push(`${type} URL cannot use localhost`);
    }
  }
  
  return errors;
}

function validateStripeKey(key, type) {
  const errors = [];
  
  if (!key) {
    errors.push(`${type} key is required`);
    return errors;
  }
  
  if (type.includes('production') || type.includes('live')) {
    if (!key.startsWith('sk_live_') && !key.startsWith('pk_live_')) {
      errors.push(`${type} key must be a live key (sk_live_... or pk_live_...)`);
    }
  } else {
    if (!key.startsWith('sk_test_') && !key.startsWith('pk_test_')) {
      errors.push(`${type} key must be a test key (sk_test_... or pk_test_...)`);
    }
  }
  
  return errors;
}

async function createEnvironmentFile(environment) {
  console.log(`\n🔧 Setting up ${environment} environment...\n`);
  
  const envData = {};
  const errors = [];
  
  // API Configuration
  const apiUrl = await question(`Enter API URL for ${environment}: `);
  envData.EXPO_PUBLIC_API_URL = apiUrl;
  errors.push(...validateUrl(apiUrl, environment));
  
  // Database Configuration
  const dbUrl = await question('Enter Database URL: ');
  envData.DATABASE_URL = dbUrl;
  
  // Stripe Configuration
  const stripeSecret = await question('Enter Stripe Secret Key: ');
  const stripePublic = await question('Enter Stripe Publishable Key: ');
  const stripeWebhook = await question('Enter Stripe Webhook Secret: ');
  
  envData.STRIPE_SECRET_KEY = stripeSecret;
  envData.STRIPE_PUBLISHABLE_KEY = stripePublic;
  envData.STRIPE_WEBHOOK_SECRET = stripeWebhook;
  
  errors.push(...validateStripeKey(stripeSecret, `${environment} secret`));
  errors.push(...validateStripeKey(stripePublic, `${environment} publishable`));
  
  // Email Configuration
  const brevoKey = await question('Enter Brevo SMTP Key: ');
  envData.BREVO_SMTP_KEY = brevoKey;
  
  // Security
  const jwtSecret = await question('Enter JWT Secret (min 32 characters): ');
  envData.JWT_SECRET = jwtSecret;
  
  if (!jwtSecret || jwtSecret.length < 32) {
    errors.push('JWT Secret must be at least 32 characters long');
  }
  
  // Server Configuration
  envData.PORT = '5001';
  envData.NODE_ENV = environment;
  
  // Frontend Configuration
  const frontendUrl = await question(`Enter Frontend URL for ${environment}: `);
  envData.FRONTEND_URL = frontendUrl;
  errors.push(...validateUrl(frontendUrl, environment));
  
  // Expo Configuration
  const expoProjectId = await question('Enter Expo Project ID: ');
  envData.EXPO_PROJECT_ID = expoProjectId;
  
  // Validate configuration
  if (errors.length > 0) {
    console.log('\n❌ Configuration Errors:');
    errors.forEach(error => console.log(`  - ${error}`));
    
    const continueAnyway = await question('\nContinue anyway? (y/N): ');
    if (continueAnyway.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      return null;
    }
  }
  
  // Generate .env file content
  const envContent = Object.entries(envData)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  const envFileName = environment === 'production' ? '.env.production' : '.env';
  
  // Write .env file
  fs.writeFileSync(envFileName, envContent);
  
  console.log(`\n✅ ${envFileName} created successfully!`);
  console.log('\n📋 Configuration Summary:');
  console.log(`  Environment: ${environment}`);
  console.log(`  API URL: ${apiUrl}`);
  console.log(`  Frontend URL: ${frontendUrl}`);
  console.log(`  Database: ${dbUrl ? 'Configured' : 'Not configured'}`);
  console.log(`  Stripe: ${stripeSecret ? 'Configured' : 'Not configured'}`);
  console.log(`  Email: ${brevoKey ? 'Configured' : 'Not configured'}`);
  
  return envFileName;
}

async function validateExistingEnvironment() {
  console.log('\n🔍 Validating existing environment configuration...\n');
  
  // Check for .env files
  const envFiles = ['.env', '.env.production', '.env.staging'];
  const existingFiles = envFiles.filter(file => fs.existsSync(file));
  
  if (existingFiles.length === 0) {
    console.log('❌ No environment files found.');
    return false;
  }
  
  console.log('✅ Found environment files:', existingFiles.join(', '));
  
  // TODO: Add more validation logic here
  
  return true;
}

async function main() {
  console.log('🚀 MerchTech Deployment Setup\n');
  
  const action = await question(
    'What would you like to do?\n' +
    '1. Create development environment\n' +
    '2. Create production environment\n' +
    '3. Validate existing configuration\n' +
    '4. Exit\n' +
    'Choose (1-4): '
  );
  
  switch (action) {
    case '1':
      await createEnvironmentFile('development');
      break;
    case '2':
      await createEnvironmentFile('production');
      break;
    case '3':
      await validateExistingEnvironment();
      break;
    case '4':
      console.log('Goodbye!');
      break;
    default:
      console.log('Invalid choice. Exiting.');
  }
  
  rl.close();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  createEnvironmentFile,
  validateExistingEnvironment
}; 