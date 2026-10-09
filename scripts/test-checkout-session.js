/**
 * Smoke test POST /api/checkout/session (sized cart without size should succeed after hotfix).
 * Usage: API_BASE=https://merchtech5-production.up.railway.app/api node scripts/test-checkout-session.js
 */
const axios = require('axios');

const base = (process.env.API_BASE || 'https://merchtech5-production.up.railway.app/api').replace(
  /\/$/,
  ''
);

async function main() {
  const { data: listRaw, status: listStatus } = await axios.get(`${base}/products`, {
    validateStatus: () => true,
  });
  if (listStatus >= 400) {
    console.error('Failed to list products', listStatus, listRaw);
    process.exit(1);
  }
  const list = Array.isArray(listRaw) ? listRaw : listRaw.products || [];
  const sized = list.find((p) => {
    const m = typeof p.metadata === 'object' ? p.metadata : {};
    return m.hasSizes && m.availableSizes?.length;
  });
  if (!sized) {
    console.log('No sized product found; skipping sized-without-size test');
    process.exit(0);
  }

  const body = {
    items: [{ productId: sized.id, quantity: 1 }],
    successUrl: 'https://www.merchtrader.org/store/checkout-success',
    cancelUrl: 'https://www.merchtrader.org/store/cart',
  };

  const { status, data } = await axios.post(`${base}/checkout/session`, body, {
    validateStatus: () => true,
  });

  console.log('Product:', sized.id, sized.name);
  console.log('Status:', status);
  console.log('Body:', data);

  if (status === 400 && data?.error?.includes('select a size')) {
    console.error(
      'FAIL: Backend still rejects carts without size — deploy services/Server/main.js hotfix to Railway.'
    );
    process.exit(1);
  }
  if (status >= 200 && status < 300 && data?.url) {
    console.log('OK: Checkout session URL received');
    process.exit(0);
  }
  console.warn('Unexpected response (may be stock/Stripe config); review manually');
  process.exit(status >= 400 ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
