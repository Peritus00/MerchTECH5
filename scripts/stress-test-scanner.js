#!/usr/bin/env node
/**
 * Dev utility: offline scan stress tester.
 *
 * Simulates N concurrent scanners each submitting batches of scans
 * to POST /api/scan/:eventId/batch.
 *
 * Usage:
 *   node scripts/stress-test-scanner.js --eventId=1 --zoneId=1 --scans=1000 --concurrency=10
 *
 * Requires a running local server and a valid JWT in env STRESS_TEST_TOKEN.
 */

const https = require('https');
const http = require('http');
const { randomUUID } = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const API_BASE = process.env.STRESS_TEST_API_URL || 'http://localhost:3000';
const TOKEN = process.env.STRESS_TEST_TOKEN;

function apiFetch(url, method, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: `Bearer ${TOKEN}`,
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetchTicketCodes(eventId, limit) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query(
    'SELECT public_code FROM tickets WHERE event_id=$1 AND revoked_at IS NULL LIMIT $2',
    [eventId, limit]
  );
  await pool.end();
  return result.rows.map(r => r.public_code);
}

async function runWorker(workerId, eventId, zoneId, codes, batchSize) {
  const batches = Math.ceil(codes.length / batchSize);
  let granted = 0, denied = 0, errors = 0;

  for (let b = 0; b < batches; b++) {
    const chunk = codes.slice(b * batchSize, (b + 1) * batchSize);
    const scans = chunk.map(code => ({
      client_scan_uuid: randomUUID(),
      public_code: code,
      zone_id: zoneId,
      direction: 'entry',
      validation_mode_used: 'strict',
      was_offline: false,
      scanned_at: new Date().toISOString(),
    }));

    try {
      const res = await apiFetch(`${API_BASE}/api/scan/${eventId}/batch`, 'POST', { scans });
      if (res.status === 200 || res.status === 201) {
        for (const o of (res.data.outcomes || [])) {
          if (o.result === 'granted') granted++;
          else denied++;
        }
      } else {
        errors += chunk.length;
      }
    } catch (err) {
      errors += chunk.length;
    }
  }

  return { workerId, granted, denied, errors };
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace('--','').split('='))
  );
  const eventId = parseInt(args.eventId);
  const zoneId = parseInt(args.zoneId);
  const totalScans = parseInt(args.scans) || 1000;
  const concurrency = parseInt(args.concurrency) || 10;
  const batchSize = parseInt(args.batch) || 50;

  if (!eventId || !zoneId) {
    console.error('Usage: node scripts/stress-test-scanner.js --eventId=<id> --zoneId=<id> [--scans=1000] [--concurrency=10]');
    process.exit(1);
  }

  if (!TOKEN) {
    console.error('Set STRESS_TEST_TOKEN env var to a valid JWT');
    process.exit(1);
  }

  console.log(`🔥 Stress test: ${totalScans} scans, ${concurrency} workers, event ${eventId}, zone ${zoneId}`);

  const codes = await fetchTicketCodes(eventId, totalScans);
  console.log(`   Fetched ${codes.length} ticket codes`);

  if (codes.length === 0) {
    console.error('❌ No tickets found — run generate-mock-event-data first');
    process.exit(1);
  }

  const perWorker = Math.ceil(codes.length / concurrency);
  const workers = Array.from({ length: concurrency }, (_, i) => {
    const slice = codes.slice(i * perWorker, (i + 1) * perWorker);
    return runWorker(i + 1, eventId, zoneId, slice, batchSize);
  });

  const start = Date.now();
  const results = await Promise.all(workers);
  const elapsed = Date.now() - start;

  const totals = results.reduce(
    (acc, r) => ({ granted: acc.granted + r.granted, denied: acc.denied + r.denied, errors: acc.errors + r.errors }),
    { granted: 0, denied: 0, errors: 0 }
  );

  console.log(`\n✅ Stress test complete in ${elapsed}ms`);
  console.log(`   Granted: ${totals.granted} | Denied: ${totals.denied} | Errors: ${totals.errors}`);
  console.log(`   Throughput: ${Math.round((totals.granted + totals.denied) / (elapsed / 1000))} scans/sec`);
}

main().catch(err => { console.error(err); process.exit(1); });
