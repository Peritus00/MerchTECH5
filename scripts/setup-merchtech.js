#!/usr/bin/env node

/**
 * MerchTech Quick Setup Script
 * Fast setup for www.merchtech.net production deployment
 */

const fs = require('fs');
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

async function setupMerchTech() {
  console.log('🎯 MerchTech Production Setup for www.merchtech.net\n');
  
  // Use the pre-configured template
  let envContent = fs.readFileSync('env.merchtech.production', 'utf8');
  
  console.log('✅ Domain already configured: www.merchtech.net');
  console.log('✅ API URL: https://www.merchtech.net/api');
  console.log('✅ Frontend URL: https://www.merchtech.net\n');
  
  // Get the critical values that need to be updated
  console.log('🔧 Please provide the following production values:\n');
  
  const dbUrl = await question('Database URL: ');
  const stripeSecret = await question('Stripe LIVE Secret Key (sk_live_...): ');
  const stripePublic = await question('Stripe LIVE Publishable Key (pk_live_...): ');
  const stripeWebhook = await question('Stripe Webhook Secret: ');
  const brevoKey = await question('Brevo SMTP Key: ');
  const jwtSecret = await question('JWT Secret (32+ characters): ');
  const expoProjectId = await question('Expo Project ID: ');
  
  // Validate inputs
  const errors = [];
  
  if (!stripeSecret.startsWith('sk_live_')) {
    errors.push('Stripe secret key must be a LIVE key (sk_live_...)');
  }
  
  if (!stripePublic.startsWith('pk_live_')) {
    errors.push('Stripe publishable key must be a LIVE key (pk_live_...)');
  }
  
  if (jwtSecret.length < 32) {
    errors.push('JWT Secret must be at least 32 characters');
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Configuration Errors:');
    errors.forEach(error => console.log(`  - ${error}`));
    
    const continueAnyway = await question('\nContinue anyway? (y/N): ');
    if (continueAnyway.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }
  
  // Replace placeholders in the template
  envContent = envContent.replace('postgresql://username:password@your-production-db-host:5432/merchtech_db', dbUrl);
  envContent = envContent.replace('sk_live_your_live_stripe_secret_key_here', stripeSecret);
  envContent = envContent.replace('pk_live_your_live_stripe_publishable_key_here', stripePublic);
  envContent = envContent.replace('whsec_your_live_webhook_secret_here', stripeWebhook);
  envContent = envContent.replace('your_production_brevo_smtp_key_here', brevoKey);
  envContent = envContent.replace('your_extremely_secure_production_jwt_secret_minimum_32_characters', jwtSecret);
  envContent = envContent.replace('your-actual-expo-project-id-from-expo-dev', expoProjectId);
  
  // Write the production environment file
  fs.writeFileSync('.env.production', envContent);
  
  console.log('\n✅ .env.production created successfully!');
  console.log('\n🎯 MerchTech Production Configuration:');
  console.log('  Domain: www.merchtech.net');
  console.log('  API: https://www.merchtech.net/api');
  console.log('  Frontend: https://www.merchtech.net');
  console.log('  Database: Configured');
  console.log('  Stripe: LIVE keys configured');
  console.log('  Email: Configured');
  console.log('  Security: JWT configured');
  
  console.log('\n🚀 Next Steps:');
  console.log('1. Validate configuration: npm run deploy:validate');
  console.log('2. Build for production: npm run build:production');
  console.log('3. Deploy server: npm run server:prod');
  console.log('4. Set up SSL certificate for www.merchtech.net');
  console.log('5. Update Stripe webhook URL to: https://www.merchtech.net/api/webhooks/stripe');
  
  rl.close();
}

if (require.main === module) {
  setupMerchTech().catch(console.error);
}

module.exports = { setupMerchTech }; 