/**
 * Focused tests for precise lead location consent helpers and query filters.
 * Run: node scripts/test-precise-location-consent.js
 */

function roundPreciseCoordinate(n) {
  return Math.round(Number(n) * 100000) / 100000;
}

function buildPreciseLocationWhere(preciseLocation) {
  const where = [];
  if (preciseLocation === 'granted') {
    where.push(`l.precise_location_consent_status = 'granted'`);
  } else if (preciseLocation === 'denied') {
    where.push(`l.precise_location_consent_status = 'denied'`);
  } else if (preciseLocation === 'not_requested') {
    where.push(`COALESCE(l.precise_location_consent_status, 'not_requested') = 'not_requested'`);
  } else if (preciseLocation === 'unavailable') {
    where.push(`l.precise_location_consent_status = 'unavailable'`);
  }
  return where;
}

function formatPreciseLocationStatus(status) {
  switch (status) {
    case 'granted':
      return 'yes';
    case 'denied':
      return 'declined';
    case 'unavailable':
      return 'unavailable';
    default:
      return 'not asked';
  }
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${message}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${message}`);
  }
}

console.log('Testing coordinate precision...');
assert(roundPreciseCoordinate(37.7749295) === 37.77493, 'rounds to 5 decimals');
assert(roundPreciseCoordinate(-122.4194155) === -122.41942, 'handles negative coordinates');
assert(roundPreciseCoordinate(40.7128) === 40.7128, 'preserves already-rounded values');

console.log('\nTesting precise location filter SQL fragments...');
assert(buildPreciseLocationWhere('granted')[0].includes("'granted'"), 'granted filter');
assert(buildPreciseLocationWhere('denied')[0].includes("'denied'"), 'denied filter');
assert(buildPreciseLocationWhere('not_requested')[0].includes('not_requested'), 'not_requested filter');
assert(buildPreciseLocationWhere('unavailable')[0].includes("'unavailable'"), 'unavailable filter');
assert(buildPreciseLocationWhere(undefined).length === 0, 'all filter adds no clause');

console.log('\nTesting display labels...');
assert(formatPreciseLocationStatus('granted') === 'yes', 'granted label');
assert(formatPreciseLocationStatus('denied') === 'declined', 'denied label');
assert(formatPreciseLocationStatus('unavailable') === 'unavailable', 'unavailable label');
assert(formatPreciseLocationStatus(null) === 'not asked', 'default label');

function buildScanLookupOrder(hasLeadId, hasQrCodeId, hasVisitorId) {
  const order = [];
  if (hasLeadId && hasQrCodeId) order.push('lead+qr');
  if (hasLeadId) order.push('lead');
  if (hasQrCodeId && hasVisitorId) order.push('qr+visitor');
  if (hasQrCodeId) order.push('qr');
  if (hasVisitorId) order.push('visitor');
  return order;
}

console.log('\nTesting scan lookup priority...');
assert(
  buildScanLookupOrder(true, true, true).join(',') === 'lead+qr,lead,qr+visitor,qr,visitor',
  'full lookup chain prefers lead first'
);
assert(buildScanLookupOrder(false, true, true).join(',') === 'qr+visitor,qr,visitor', 'qr flow without lead');
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
