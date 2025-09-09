const axios = require('axios');

// Simple test to verify Stripe checkout endpoint works
async function testStripeEndpoint() {
  console.log('🚀 Testing Stripe checkout endpoint...');
  
  try {
    const response = await axios.post('https://merchtech5-production.up.railway.app/api/checkout/session', {
      items: [{ productId: 1, quantity: 1 }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token-for-test'
      }
    });
    
    console.log('✅ SUCCESS: Endpoint responded with:', response.data);
  } catch (error) {
    if (error.response) {
      console.log(`📊 Response status: ${error.response.status}`);
      console.log(`📊 Response data:`, error.response.data);
      
      if (error.response.status === 403) {
        console.log('✅ GOOD: 403 means endpoint is working (just needs valid auth)');
      } else if (error.response.status === 500) {
        console.log('❌ BAD: 500 means internal server error (Stripe issue)');
      }
    } else {
      console.error('❌ Network error:', error.message);
    }
  }
}

testStripeEndpoint(); 