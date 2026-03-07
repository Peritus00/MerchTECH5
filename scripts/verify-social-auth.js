#!/usr/bin/env node
/**
 * Social Auth Deployment Gate
 * Run before deploy to catch config/routing regressions.
 * Usage: node scripts/verify-social-auth.js [--api-url URL] [--frontend-url URL]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const API_URL = process.argv.includes('--api-url')
  ? process.argv[process.argv.indexOf('--api-url') + 1]
  : process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app';
const FRONTEND_URL = process.argv.includes('--frontend-url')
  ? process.argv[process.argv.indexOf('--frontend-url') + 1]
  : process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://www.merchtrader.org';

let failed = 0;

function fail(msg) {
  console.error('❌', msg);
  failed++;
}

function ok(msg) {
  console.log('✅', msg);
}

async function main() {
  console.log('\n🔐 Social Auth Deployment Gate\n');
  console.log('API URL:', API_URL);
  console.log('Frontend URL:', FRONTEND_URL);
  console.log('');

  // 1. Env parity (backend)
  if (!process.env.GOOGLE_CLIENT_ID) {
    fail('GOOGLE_CLIENT_ID not set (backend)');
  } else {
    ok('GOOGLE_CLIENT_ID configured');
  }
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    fail('GOOGLE_CLIENT_SECRET not set (required for web Google sign-in)');
  } else {
    ok('GOOGLE_CLIENT_SECRET configured');
  }

  const appleOk = (process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID) &&
    process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY;
  if (!appleOk) {
    console.warn('⚠️  Apple OAuth incomplete (optional for Google-only)');
  } else {
    ok('Apple OAuth configured');
  }

  // 2. Health endpoint reports social-auth readiness
  const healthUrl = API_URL.includes('/api') ? `${API_URL.replace(/\/api\/?$/, '')}/api/health` : `${API_URL}/api/health`;
  try {
    const res = await fetch(healthUrl);
    const data = await res.json();
    if (data.services?.socialAuth) {
      if (data.services.socialAuth.google) ok('Health reports Google auth ready');
      else fail('Health reports Google auth NOT ready');
    } else {
      console.warn('⚠️  Health endpoint does not include socialAuth (upgrade server)');
    }
  } catch (err) {
    fail(`Health check failed: ${err.message}`);
  }

  // 3. Callback routes resolve (frontend - requires build)
  try {
    const googleRes = await fetch(`${FRONTEND_URL}/auth/google`, { redirect: 'manual' });
    const appleRes = await fetch(`${FRONTEND_URL}/auth/apple`, { redirect: 'manual' });
    const googleOk = googleRes.status === 200 || googleRes.status === 304;
    const appleOk = appleRes.status === 200 || appleRes.status === 304;
    if (googleOk) ok('Callback route /auth/google resolves');
    else fail(`Callback route /auth/google returned ${googleRes.status} (may hit not-found)`);
    if (appleOk) ok('Callback route /auth/apple resolves');
    else fail(`Callback route /auth/apple returned ${appleRes.status} (may hit not-found)`);
  } catch (err) {
    fail(`Callback route check failed: ${err.message}`);
  }

  console.log('');
  if (failed > 0) {
    console.error(`❌ ${failed} check(s) failed. Fix before deploying.\n`);
    process.exit(1);
  }
  console.log('✅ All social auth gates passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
