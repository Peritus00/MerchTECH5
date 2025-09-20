#!/usr/bin/env node

/**
 * Domain Rebrand Verification Script
 * Verifies that all URLs have been updated from old domains to merchtrader.org
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 MerchTech → MerchTrader Domain Rebrand Verification');
console.log('=====================================================\n');

// Files to check for domain configuration
const configFiles = [
  'config/environment.ts',
  'components/AdvancedQREditor.tsx',
  'components/MediaPlayer.tsx'
];

const results = {
  updated: [],
  needsUpdate: [],
  errors: []
};

function checkFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      results.errors.push(`File not found: ${filePath}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const hasOldDomains = content.includes('merchtech5-production.up.railway.app') || 
                         content.includes('merchtech.net');
    const hasNewDomain = content.includes('merchtrader.org');

    if (hasOldDomains && !hasNewDomain) {
      results.needsUpdate.push({
        file: filePath,
        issue: 'Contains old domain references without new domain'
      });
    } else if (hasNewDomain) {
      results.updated.push({
        file: filePath,
        status: 'Updated to use merchtrader.org'
      });
    }

    // Check for specific patterns
    if (content.includes('https://merchtrader.org')) {
      console.log(`✅ ${filePath} - Uses merchtrader.org`);
    }
    if (content.includes('merchtech5-production.up.railway.app')) {
      console.log(`⚠️  ${filePath} - Still contains Railway URL (may be intentional for development)`);
    }
    if (content.includes('merchtech.net')) {
      console.log(`❌ ${filePath} - Contains old merchtech.net domain`);
    }

  } catch (error) {
    results.errors.push(`Error reading ${filePath}: ${error.message}`);
  }
}

// Check configuration files
console.log('📁 Checking Configuration Files:');
configFiles.forEach(checkFile);

console.log('\n📊 Summary:');
console.log(`✅ Updated files: ${results.updated.length}`);
console.log(`⚠️  Files needing update: ${results.needsUpdate.length}`);
console.log(`❌ Errors: ${results.errors.length}`);

if (results.needsUpdate.length > 0) {
  console.log('\n🔧 Files that need updating:');
  results.needsUpdate.forEach(item => {
    console.log(`  - ${item.file}: ${item.issue}`);
  });
}

if (results.errors.length > 0) {
  console.log('\n❌ Errors encountered:');
  results.errors.forEach(error => {
    console.log(`  - ${error}`);
  });
}

console.log('\n🎯 Next Steps:');
console.log('1. QR codes will now generate URLs pointing to merchtrader.org');
console.log('2. Make sure merchtrader.org is configured to serve your application');
console.log('3. Update DNS settings to point merchtrader.org to your server');
console.log('4. Test QR code generation in the app to verify new URLs');

console.log('\n🔗 Expected QR Code URLs:');
console.log('- Playlists: https://merchtrader.org/playlist-access/[ID]');
console.log('- Slideshows: https://merchtrader.org/slideshow-access/[ID]');
