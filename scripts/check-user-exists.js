const axios = require('axios');

async function checkUser() {
  const API_URL = process.env.API_BASE_URL || 'https://merchtech5-production.up.railway.app/api';
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  
  if (!ADMIN_TOKEN) {
    console.error('❌ ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }
  
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('❌ Please provide a user ID as argument');
    console.log('Usage: node scripts/check-user-exists.js <userId>');
    process.exit(1);
  }
  
  console.log(`🔍 Checking if user ${userId} exists...\n`);
  
  try {
    // Get all users
    const response = await axios.get(`${API_URL}/admin/all-users`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    
    const users = response.data;
    console.log(`📊 Total users in system: ${users.length}`);
    
    // Find the user
    const user = users.find(u => u.id === parseInt(userId));
    
    if (user) {
      console.log(`✅ User ${userId} EXISTS`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Status: ${user.isSuspended ? 'Suspended' : 'Active'}`);
    } else {
      console.log(`❌ User ${userId} DOES NOT EXIST`);
      console.log(`\nExisting user IDs: ${users.map(u => u.id).sort((a, b) => a - b).join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error || error.message);
  }
}

checkUser().catch(console.error);
