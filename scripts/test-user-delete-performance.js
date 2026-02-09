const axios = require('axios');

async function testDeletePerformance() {
  const API_URL = process.env.API_BASE_URL || 'http://localhost:3000';
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  
  if (!ADMIN_TOKEN) {
    console.error('❌ ADMIN_TOKEN environment variable is required');
    console.log('Set it with: export ADMIN_TOKEN="your-token-here"');
    process.exit(1);
  }
  
  console.log('🧪 Testing user deletion performance...\n');
  console.log(`API URL: ${API_URL}\n`);
  
  try {
    // Create test user
    console.log('1. Creating test user...');
    const createStart = Date.now();
    const createResponse = await axios.post(`${API_URL}/api/auth/register`, {
      email: `test-delete-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      username: `test-user-delete-${Date.now()}`
    });
    const createTime = Date.now() - createStart;
    console.log(`   ✓ User created in ${createTime}ms`);
    
    const userId = createResponse.data.user.id;
    console.log(`   User ID: ${userId}\n`);
    
    // Add some related data (QR codes, products, etc.) if endpoints exist
    console.log('2. Creating related data for cascade testing...');
    const relatedDataStart = Date.now();
    let relatedDataCreated = 0;
    
    try {
      // Try to create a QR code
      const qrResponse = await axios.post(
        `${API_URL}/api/qr-codes`,
        {
          name: `Test QR for user ${userId}`,
          url: 'https://example.com',
          description: 'Test QR code for deletion performance test'
        },
        {
          headers: { Authorization: `Bearer ${createResponse.data.token}` }
        }
      );
      relatedDataCreated++;
      console.log(`   ✓ Created QR code`);
    } catch (error) {
      console.log(`   ⚠️  Could not create QR code (this is OK for testing)`);
    }
    
    const relatedDataTime = Date.now() - relatedDataStart;
    console.log(`   Related data creation: ${relatedDataTime}ms (${relatedDataCreated} items)\n`);
    
    // Delete user and measure time
    console.log('3. Deleting user (with cascade deletes)...');
    const deleteStart = Date.now();
    const deleteResponse = await axios.delete(`${API_URL}/api/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    const deleteTime = Date.now() - deleteStart;
    console.log(`   ✓ User deleted in ${deleteTime}ms`);
    console.log(`   Response: ${JSON.stringify(deleteResponse.data)}\n`);
    
    // Verify user is gone
    console.log('4. Verifying deletion...');
    const verifyStart = Date.now();
    const allUsersResponse = await axios.get(`${API_URL}/api/admin/all-users`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    const verifyTime = Date.now() - verifyStart;
    
    const userStillExists = allUsersResponse.data.some(u => u.id === userId);
    
    if (userStillExists) {
      console.error('   ✗ FAILED: User still appears in list!\n');
    } else {
      console.log(`   ✓ Verified deletion in ${verifyTime}ms`);
      console.log(`   User not found in list (as expected)\n`);
    }
    
    // Performance summary
    console.log('📊 Performance Summary:');
    console.log(`   User creation: ${createTime}ms`);
    console.log(`   Related data creation: ${relatedDataTime}ms`);
    console.log(`   Delete operation: ${deleteTime}ms`);
    console.log(`   Verification fetch: ${verifyTime}ms`);
    console.log(`   Total time: ${deleteTime + verifyTime}ms\n`);
    
    // Performance thresholds
    if (deleteTime < 1000 && verifyTime < 500) {
      console.log('✅ PASS: Performance is within acceptable range');
      console.log('   - Delete operation completed quickly');
      console.log('   - Verification fetch is fast');
    } else if (deleteTime < 2000 && verifyTime < 1000) {
      console.log('⚠️  ACCEPTABLE: Performance is acceptable but could be improved');
      if (deleteTime >= 1000) {
        console.log(`   - Delete operation took ${deleteTime}ms (target: <1000ms)`);
      }
      if (verifyTime >= 500) {
        console.log(`   - Verification fetch took ${verifyTime}ms (target: <500ms)`);
      }
    } else {
      console.log('❌ SLOW: Performance needs optimization');
      if (deleteTime >= 2000) {
        console.log(`   - Delete operation took ${deleteTime}ms (target: <1000ms)`);
        console.log('     Consider: Check database indexes, transaction handling, cascade delete performance');
      }
      if (verifyTime >= 1000) {
        console.log(`   - Verification fetch took ${verifyTime}ms (target: <500ms)`);
        console.log('     Consider: Check cache invalidation, query optimization');
      }
    }
    
    // Test cache invalidation
    console.log('\n5. Testing cache invalidation...');
    const cacheTestStart = Date.now();
    const cacheTestResponse = await axios.get(`${API_URL}/api/admin/all-users`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    const cacheTestTime = Date.now() - cacheTestStart;
    
    if (cacheTestTime < verifyTime * 0.5) {
      console.log(`   ✓ Cache working (${cacheTestTime}ms vs ${verifyTime}ms first fetch)`);
    } else {
      console.log(`   ⚠️  Cache may not be working optimally (${cacheTestTime}ms vs ${verifyTime}ms first fetch)`);
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    if (axios.isAxiosError(error)) {
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.error || error.message}`);
      console.error(`   URL: ${error.config?.url}`);
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

testDeletePerformance().catch(console.error);
