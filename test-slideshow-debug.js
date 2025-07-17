const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PRODUCTION_URL = 'http://192.168.1.70:5001';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjQsImVtYWlsIjoiUGVycmllLkJlbnRvbkBnbWFpbC5jb20iLCJpc0FkbWluIjpmYWxzZSwiaWF0IjoxNzUyNzYwMDc1LCJleHAiOjE3NTI4NDY0NzV9.MyT_nsYwGUf75-3LuKG3yAmEOx864Z8IBWZxpRpHVeA';

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...');
  
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false
    });
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Check slideshows table
    const result = await client.query('SELECT id, name, created_at FROM slideshows ORDER BY id');
    console.log(`\n📊 Found ${result.rows.length} slideshows in database:`);
    
    if (result.rows.length === 0) {
      console.log('❌ No slideshows found in database');
      console.log('💡 This explains why slideshow ID 1 returns "Content with ID 1 not found"');
    } else {
      result.rows.forEach(row => {
        console.log(`   📋 ID: ${row.id}, Name: "${row.name}", Created: ${new Date(row.created_at).toLocaleDateString()}`);
      });
    }
    
    // Check slideshow_images table
    const imagesResult = await client.query(`
      SELECT slideshow_id, COUNT(*) as image_count 
      FROM slideshow_images 
      GROUP BY slideshow_id 
      ORDER BY slideshow_id
    `);
    
    console.log(`\n🖼️ Slideshow images count:`);
    if (imagesResult.rows.length === 0) {
      console.log('❌ No slideshow images found');
    } else {
      imagesResult.rows.forEach(row => {
        console.log(`   📸 Slideshow ID: ${row.slideshow_id}, Images: ${row.image_count}`);
      });
    }
    
    client.release();
    await pool.end();
    
    return result.rows;
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return [];
  }
}

async function testServerEndpoint(url, description) {
  console.log(`\n🌐 Testing ${description}: ${url}`);
  
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ ${description} - Status: ${response.status}`);
    console.log(`📝 Response:`, JSON.stringify(response.data, null, 2));
    return response.data;
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.log(`❌ ${description} - Connection failed: ${error.message}`);
    } else if (error.response) {
      console.log(`❌ ${description} - Status: ${error.response.status}`);
      console.log(`📝 Error response:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`❌ ${description} - Error: ${error.message}`);
    }
    return null;
  }
}

async function testSlideshowAccess(baseUrl, slideshowId) {
  const url = `${baseUrl}/api/slideshow-access/${slideshowId}`;
  return await testServerEndpoint(url, `Slideshow Access ID ${slideshowId}`);
}

async function main() {
  console.log('🚀 SLIDESHOW DEBUG TEST STARTING...\n');
  
  // Test 1: Database connection and slideshow inventory
  const slideshows = await testDatabaseConnection();
  
  // Test 2: Local server accessibility
  console.log('\n' + '='.repeat(50));
  console.log('🏠 TESTING LOCAL SERVER');
  console.log('='.repeat(50));
  
  // Test local server with existing slideshow IDs
  if (slideshows.length > 0) {
    for (const slideshow of slideshows.slice(0, 3)) { // Test first 3 slideshows
      await testSlideshowAccess(BASE_URL, slideshow.id);
    }
  } else {
    console.log('⚠️  No slideshows found, testing with ID 1 (should fail)');
    await testSlideshowAccess(BASE_URL, 1);
  }
  
  // Test 3: Production server accessibility
  console.log('\n' + '='.repeat(50));
  console.log('🌍 TESTING PRODUCTION SERVER');
  console.log('='.repeat(50));
  
  // Test production server connectivity
  try {
    const healthCheck = await axios.get(`${PRODUCTION_URL}/health`, { timeout: 5000 });
    console.log('✅ Production server is accessible');
  } catch (error) {
    console.log('❌ Production server is not accessible:', error.message);
  }
  
  // Test production slideshow access
  if (slideshows.length > 0) {
    for (const slideshow of slideshows.slice(0, 2)) { // Test first 2 slideshows
      await testSlideshowAccess(PRODUCTION_URL, slideshow.id);
    }
  } else {
    console.log('⚠️  Testing production with ID 1 (should fail if no slideshows exist)');
    await testSlideshowAccess(PRODUCTION_URL, 1);
  }
  
  // Test 4: Summary and recommendations
  console.log('\n' + '='.repeat(50));
  console.log('📋 SUMMARY & RECOMMENDATIONS');
  console.log('='.repeat(50));
  
  if (slideshows.length === 0) {
    console.log('🔴 ISSUE FOUND: No slideshows exist in database');
    console.log('💡 SOLUTION: Create a slideshow first before testing slideshow-access');
    console.log('📝 Steps to fix:');
    console.log('   1. Go to the app and create a slideshow');
    console.log('   2. Add some images to the slideshow');
    console.log('   3. Test with the created slideshow ID');
  } else {
    console.log('✅ Database has slideshows - use these IDs for testing:');
    slideshows.forEach(slideshow => {
      console.log(`   📋 Test with: /api/slideshow-access/${slideshow.id}`);
    });
  }
  
  console.log('\n🎯 NEXT STEPS:');
  console.log('1. Create a slideshow in the app if none exist');
  console.log('2. Use the correct slideshow ID in your requests');
  console.log('3. Check that production server is running and accessible');
  console.log('4. Verify database has the slideshows you expect');
  
  console.log('\n✅ DEBUG TEST COMPLETE');
}

// Run the test
main().catch(console.error); 