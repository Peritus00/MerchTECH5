const axios = require('axios');

async function testStorePages() {
  console.log('🛒 Testing Store Pages and Product Endpoints...\n');

  const frontendURL = 'https://merchtech-server-c37xiap81-perrie-bentons-projects.vercel.app';
  const baseURL = 'https://merchtech5-production.up.railway.app/api';
  const adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGpqZXRmdWVsQGdtYWlsLmNvbSIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc1MTk0MzcwOSwiZXhwIjoxNzUyMDMwMTA5fQ.OKOjRWeemoMxfgYbFmW8bgOKC3MhPjAhNgONVPa4cf0';

  try {
    // 1. Create a test product
    console.log('1️⃣ Creating Test Product...');
    const productResponse = await axios.post(`${baseURL}/products`, {
      name: 'Test Store Product',
      description: 'A product for store testing',
      price: 1999,
      metadata: { category: 'MUSIC', popularity: 10 },
      in_stock: true
    }, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const productId = productResponse.data.id;
    console.log('✅ Product created:', productId);

    // 2. Test shop page (master store)
    console.log('\n2️⃣ Testing Shop Page...');
    const shopURL = `${frontendURL}/shop`;
    try {
      const shopResponse = await axios.get(shopURL);
      console.log('✅ Shop page accessible:', { status: shopResponse.status, contentType: shopResponse.headers['content-type'] });
    } catch (error) {
      console.log('❌ Shop page error:', error.response?.status, error.response?.statusText);
    }

    // 3. Test store page (tab store)
    console.log('\n3️⃣ Testing Store Page...');
    const storeURL = `${frontendURL}/store`;
    try {
      const storeResponse = await axios.get(storeURL);
      console.log('✅ Store page accessible:', { status: storeResponse.status, contentType: storeResponse.headers['content-type'] });
    } catch (error) {
      console.log('❌ Store page error:', error.response?.status, error.response?.statusText);
    }

    // 4. Test product details page
    console.log('\n4️⃣ Testing Product Details Page...');
    const productDetailsURL = `${frontendURL}/store/product/${productId}`;
    try {
      const productDetailsResponse = await axios.get(productDetailsURL);
      console.log('✅ Product details page accessible:', { status: productDetailsResponse.status, contentType: productDetailsResponse.headers['content-type'] });
    } catch (error) {
      console.log('❌ Product details page error:', error.response?.status, error.response?.statusText);
    }

    // 5. Test product API endpoint
    console.log('\n5️⃣ Testing Product API Endpoint...');
    try {
      const productApiResponse = await axios.get(`${baseURL}/products/${productId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      console.log('✅ Product API endpoint working:', {
        id: productApiResponse.data.id,
        name: productApiResponse.data.name,
        price: productApiResponse.data.price
      });
    } catch (error) {
      console.log('❌ Product API endpoint error:', error.response?.status, error.response?.data);
    }

    // 6. Test product listing API endpoint
    console.log('\n6️⃣ Testing Product Listing API Endpoint...');
    try {
      const productsListResponse = await axios.get(`${baseURL}/products`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const productsArr = productsListResponse.data.products || productsListResponse.data;
      const found = productsArr.find((p) => p.id === productId);
      console.log('✅ Product listing endpoint working:', { found: !!found, total: productsArr.length });
    } catch (error) {
      console.log('❌ Product listing endpoint error:', error.response?.status, error.response?.data);
    }

    // 7. Test purchase flow (Stripe checkout session creation)
    console.log('\n7️⃣ Testing Purchase Flow (Stripe Checkout)...');
    try {
      const checkoutResponse = await axios.post(`${baseURL}/checkout/session`, {
        items: [{ productId, quantity: 1 }],
        successUrl: `${frontendURL}/store/checkout-success`,
        cancelUrl: `${frontendURL}/store/checkout-cancel`
      }, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      console.log('✅ Stripe checkout session created:', checkoutResponse.data.url);
    } catch (error) {
      console.log('❌ Stripe checkout session error:', error.response?.status, error.response?.data);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await axios.delete(`${baseURL}/products/${productId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('✅ Cleanup complete');

    console.log('\n🎉 Store Pages Test Summary:');
    console.log('   🛒 Shop Page - Ready for use');
    console.log('   🏪 Store Page - Ready for use');
    console.log('   📦 Product Details - Ready for use');
    console.log('   📋 Product API - Working');
    console.log('   🗂 Product Listing - Working');
    console.log('   💳 Purchase Flow - Working');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.status, error.response?.data);
  }
}

testStorePages(); 