# QR Scan Deduplication Testing Guide

This directory contains scripts to test and verify that QR code scans are only counted once.

## Scripts

### 1. `test-scan-deduplication.js` - Comprehensive Test Suite

Tests multiple scenarios to verify deduplication is working:

```bash
# Run basic tests (quick)
node scripts/test-scan-deduplication.js [qrCodeId]

# Run all tests including window expiration test (slower, ~65 seconds)
node scripts/test-scan-deduplication.js [qrCodeId] --full
```

**Test Scenarios:**
1. **Rapid Scans Test**: Sends 5 scan requests rapidly with the same visitor ID - should only count as 1 scan
2. **Demographics Update Test**: Sends scan without demographics, then with demographics - should update existing scan, not create duplicate
3. **Different Visitors Test**: Sends scans from 3 different visitors - should create 3 separate scans
4. **Window Expiration Test**: Sends scan, waits 65 seconds, sends another - should create 2 scans (window expired)

**Example:**
```bash
node scripts/test-scan-deduplication.js 40
```

### 2. `check-scan-count.js` - Quick Manual Verification

Check scan counts and detect duplicates for a specific QR code:

```bash
# Show recent QR codes
node scripts/check-scan-count.js

# Check specific QR code (last 5 minutes)
node scripts/check-scan-count.js 40

# Check specific QR code (last 1 minute)
node scripts/check-scan-count.js 40 1
```

**Output includes:**
- Total scan count in time window
- Recent scan details
- Duplicate detection (scans with same visitor ID)
- Demographics information

**Example:**
```bash
# Check QR code 40 for scans in last 5 minutes
node scripts/check-scan-count.js 40 5
```

## Manual Testing Steps

1. **Get QR Code ID:**
   ```bash
   node scripts/check-scan-count.js
   ```

2. **Run Test Suite:**
   ```bash
   node scripts/test-scan-deduplication.js [your-qr-code-id]
   ```

3. **Scan QR Code Manually:**
   - Scan the QR code once
   - Immediately check scan count:
     ```bash
     node scripts/check-scan-count.js [qr-code-id] 1
     ```
   - Should show only 1 scan

4. **Test Demographics:**
   - Scan QR code
   - Submit demographics
   - Check scan count:
     ```bash
     node scripts/check-scan-count.js [qr-code-id] 1
     ```
   - Should still show only 1 scan (updated, not duplicated)

## Expected Results

### ✅ Passing Tests:
- Rapid scans: Only 1 scan recorded
- Demographics update: 1 scan updated with demographics
- Different visitors: Multiple scans (one per visitor)
- Window expiration: 2 scans after 65 seconds

### ❌ Failing Tests Indicate:
- Deduplication not working
- Race conditions in tracking
- Server-side issues

## Troubleshooting

If tests fail:

1. **Check Server Logs:**
   - Look for `💾 writeScan:` logs
   - Check for deduplication messages
   - Verify visitor IDs are being set

2. **Check Database:**
   ```bash
   node scripts/check-scan-count.js [qr-code-id] 1
   ```
   - Look for duplicate visitor IDs
   - Check scan timestamps

3. **Verify Visitor ID Cookie:**
   - Make sure `qr_vid` cookie is being set
   - Check browser developer tools

4. **Check Deduplication Window:**
   - Regular scans: 60 seconds
   - Scans with demographics: 3600 seconds (1 hour)

## Integration with CI/CD

Add to your testing workflow:

```yaml
# Example GitHub Actions
- name: Test Scan Deduplication
  run: |
    node scripts/test-scan-deduplication.js ${{ secrets.TEST_QR_CODE_ID }}
```

## Notes

- Tests use the production API by default (can be changed via `API_BASE_URL`)
- Test visitor IDs are prefixed with `test-` to avoid conflicts
- Scripts clean up test data automatically (scans remain but are clearly marked)
- Window expiration test is skipped by default (use `--full` flag)

