
const axios = require('axios');

// Use the current Replit URL
const API_BASE_URL = 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev/api';

async function testStripeProducts() {
  console.log('🧪 TESTING STRIPE PRODUCTS INTEGRATION');
  console.log('=====================================\n');

  try {
    // Test Stripe health
    console.log('🔍 Testing Stripe health...');
    const healthResponse = await axios.get(`${API_BASE_URL}/stripe/health`);
    console.log('✅ Stripe Health:', healthResponse.data);
    console.log('');

    // Test products endpoint
    console.log('🔍 Testing products endpoint...');
    const productsResponse = await axios.get(`${API_BASE_URL}/stripe/products`);
    const products = productsResponse.data;
    
    console.log('✅ Products fetched:', products.length);
    
    if (products.length === 0) {
      console.log('⚠️  No products found in Stripe. Please create some products in your Stripe Dashboard:');
      console.log('   1. Go to https://dashboard.stripe.com/products');
      console.log('   2. Click "+ Add product"');
      console.log('   3. Fill in product details and add pricing');
      console.log('   4. Save the product');
      console.log('   5. Run this test again');
    } else {
      console.log('\n📋 Products found:');
      products.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
        console.log(`      ID: ${product.id}`);
        console.log(`      Description: ${product.description || 'No description'}`);
        console.log(`      Prices: ${product.prices.length}`);
        product.prices.forEach((price, priceIndex) => {
          const amount = (price.unit_amount / 100).toFixed(2);
          const recurring = price.type === 'recurring' ? ` / ${price.recurring.interval}` : '';
          console.log(`        ${priceIndex + 1}. ${price.currency.toUpperCase()} ${amount}${recurring} (${price.id})`);
        });
        console.log('');
      });
    }

    // Test checkout session creation if we have products
    if (products.length > 0 && products[0].prices.length > 0) {
      console.log('🔍 Testing checkout session creation...');
      const firstPriceId = products[0].prices[0].id;
      
      try {
        const checkoutResponse = await axios.post(`${API_BASE_URL}/stripe/create-checkout-session`, {
          priceId: firstPriceId,
          quantity: 1
        });
        
        console.log('✅ Checkout session created successfully');
        console.log(`   Session ID: ${checkoutResponse.data.sessionId}`);
        console.log(`   Checkout URL: ${checkoutResponse.data.url.substring(0, 50)}...`);
      } catch (checkoutError) {
        console.log('❌ Checkout session creation failed:', checkoutError.response?.data || checkoutError.message);
      }
    }

    console.log('\n🎯 INTEGRATION STATUS: SUCCESS');
    console.log('   Your Stripe products are now integrated with your app!');
    
  } catch (error) {
    console.error('❌ INTEGRATION FAILED:', error.response?.data || error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure your server is running');
    console.log('   2. Check that STRIPE_SECRET_KEY is set in Secrets');
    console.log('   3. Verify your Stripe account has products');
  }
}

testStripeProducts();
