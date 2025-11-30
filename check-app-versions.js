// Script to check app versions in database and test version comparison
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function checkVersions() {
  try {
    console.log('🔍 Checking app_versions table...\n');
    
    // Check all versions
    const allVersions = await pool.query(
      `SELECT id, version, platform, is_active, created_at, download_url
       FROM app_versions 
       ORDER BY platform, created_at DESC`
    );
    
    console.log('📱 All versions in database:');
    console.log('='.repeat(80));
    if (allVersions.rows.length === 0) {
      console.log('❌ No versions found in database!');
    } else {
      allVersions.rows.forEach((v, i) => {
        console.log(`${i + 1}. Version: ${v.version} | Platform: ${v.platform} | Active: ${v.is_active} | Created: ${v.created_at}`);
      });
    }
    console.log('='.repeat(80));
    console.log('');
    
    // Check latest active versions per platform
    const iosLatest = await pool.query(
      `SELECT version, platform, is_active, created_at
       FROM app_versions 
       WHERE platform = 'ios' AND is_active = TRUE 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    
    const androidLatest = await pool.query(
      `SELECT version, platform, is_active, created_at
       FROM app_versions 
       WHERE platform = 'android' AND is_active = TRUE 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    
    console.log('📱 Latest active versions:');
    console.log('='.repeat(80));
    if (iosLatest.rows.length > 0) {
      console.log(`iOS: ${iosLatest.rows[0].version} (created: ${iosLatest.rows[0].created_at})`);
    } else {
      console.log('iOS: No active version found');
    }
    
    if (androidLatest.rows.length > 0) {
      console.log(`Android: ${androidLatest.rows[0].version} (created: ${androidLatest.rows[0].created_at})`);
    } else {
      console.log('Android: No active version found');
    }
    console.log('='.repeat(80));
    console.log('');
    
    // Test version comparison
    const compareVersions = (v1, v2) => {
      const parts1 = v1.split('.').map(Number);
      const parts2 = v2.split('.').map(Number);
      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        if (part1 < part2) return -1;
        if (part1 > part2) return 1;
      }
      return 0;
    };
    
    console.log('🧪 Testing version comparison:');
    console.log('='.repeat(80));
    const testCases = [
      ['1.1.1', '1.1.2'],
      ['1.1.2', '1.1.1'],
      ['1.1.1', '1.1.1'],
      ['1.0.0', '1.1.2'],
      ['2.0.0', '1.1.2'],
    ];
    
    testCases.forEach(([v1, v2]) => {
      const result = compareVersions(v1, v2);
      const updateAvailable = result < 0;
      console.log(`compareVersions('${v1}', '${v2}') = ${result} | Update available: ${updateAvailable}`);
    });
    console.log('='.repeat(80));
    console.log('');
    
    // Simulate the API check for iOS with current version 1.1.1
    if (iosLatest.rows.length > 0) {
      const latestVersion = iosLatest.rows[0].version;
      const currentVersion = '1.1.1'; // From app.json
      const comparison = compareVersions(currentVersion, latestVersion);
      const updateAvailable = comparison < 0;
      
      console.log('🔍 Simulating API check for iOS:');
      console.log('='.repeat(80));
      console.log(`Current version (from app.json): ${currentVersion}`);
      console.log(`Latest version (from DB): ${latestVersion}`);
      console.log(`Comparison result: ${comparison}`);
      console.log(`Update available: ${updateAvailable}`);
      console.log('='.repeat(80));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message && error.message.includes('does not exist')) {
      console.error('\n⚠️  The app_versions table does not exist!');
      console.error('   Please run migration: database/migrations/024_create_app_versions_table.sql');
    }
  } finally {
    await pool.end();
  }
}

checkVersions();

