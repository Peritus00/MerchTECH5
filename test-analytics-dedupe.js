const axios = require('axios');
require('dotenv').config();

const API = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api').replace(/\/$/, '');

async function trackScanPublic(qrCodeId) {
  const res = await axios.post(`${API}/analytics/track-scan`, { qrCodeId }, { validateStatus: () => true });
  return res.data;
}

async function login(email, password) {
  const res = await axios.post(`${API}/auth/login`, { email, password }, { validateStatus: () => true });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status}`);
  return res.data.token;
}

async function summary(token) {
  const res = await axios.get(`${API}/analytics/summary`, { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });
  return res.data;
}

async function run() {
  console.log('🧪 Analytics dedupe test');
  const token = await login('djjetfuel@gmail.com', 'temp123');

  // Find a QR code id to test; fallback to 1
  let qrCodeId = 1;
  try {
    const list = await axios.get(`${API}/qr-codes`, { headers: { Authorization: `Bearer ${token}` } });
    qrCodeId = list.data?.[0]?.id || list.data?.qrCodes?.[0]?.id || 1;
  } catch {}

  console.log('➡️ tracking 3 rapid scans...');
  await trackScanPublic(qrCodeId);
  await trackScanPublic(qrCodeId);
  await trackScanPublic(qrCodeId);

  console.log('⏳ waiting 61s...');
  await new Promise(r => setTimeout(r, 61000));

  console.log('➡️ tracking post-window scan...');
  await trackScanPublic(qrCodeId);

  const s = await summary(token);
  console.log('recentScans length:', s.recentScans?.length);
  console.log('todayScans (deduped last24h):', s.todayScans);
}

run().catch(err => { console.error(err); process.exit(1); });


