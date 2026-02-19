#!/usr/bin/env node
/**
 * Post-deploy readiness verification gate.
 * Run after deployment to fail rollout if /api/health remains unhealthy.
 *
 * Usage:
 *   node scripts/verify-deployment-health.js
 *   API_BASE_URL=https://www.merchtrader.org node scripts/verify-deployment-health.js
 *
 * Exit codes: 0 = healthy, 1 = unhealthy or timeout
 */
const https = require('https');
const http = require('http');

const BASE_URL = process.env.API_BASE_URL || 'https://www.merchtrader.org';
const HEALTH_PATH = '/api/health';
const MAX_WAIT_MS = 120000; // 2 minutes
const POLL_INTERVAL_MS = 5000; // 5 seconds
const RESPONSE_TIMEOUT_MS = 10000; // 10 seconds per request

function fetchHealth(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout: RESPONSE_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const body = JSON.parse(data || '{}');
          resolve({ statusCode: res.statusCode, body });
        } catch {
          resolve({ statusCode: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function main() {
  const url = `${BASE_URL.replace(/\/$/, '')}${HEALTH_PATH}`;
  console.log(`Post-deploy health check: ${url}`);
  console.log(`Max wait: ${MAX_WAIT_MS / 1000}s, poll interval: ${POLL_INTERVAL_MS / 1000}s\n`);

  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const { statusCode, body } = await fetchHealth(url);
      if (statusCode === 200 && (body.status === 'healthy' || body.status === 'degraded')) {
        console.log(`✅ Readiness OK (${statusCode}) - status: ${body.status}`);
        process.exit(0);
      }
      console.log(`⏳ Unhealthy (${statusCode}, status: ${body.status || 'unknown'}) - retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    } catch (err) {
      console.log(`⏳ Error: ${err.message} - retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.error(`\n❌ Deployment health check FAILED: /api/health did not return healthy within ${MAX_WAIT_MS / 1000}s`);
  process.exit(1);
}

main();
