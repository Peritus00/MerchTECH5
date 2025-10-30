# QR Scan Double Counting Fix Summary

## Issues Identified

1. **Missing deduplication constraint**: The unique index `uq_qr_scans_minute_dedupe` was not found in the database, allowing duplicate scans to be inserted.

2. **Fallback INSERT missing visitor_id**: The fallback INSERT statement (when main INSERT fails) didn't include `visitor_id`, creating scans without visitor identification and preventing deduplication.

3. **Demographics re-tracking creates duplicates**: When demographics are submitted, the system was creating new scans instead of updating existing ones, leading to duplicates when submitted more than 60 seconds after initial scan.

4. **Deduplication logic mismatch**: The analytics summary query used IP address/browser/OS combo for visitor identification, while `writeScan` used `visitor_id`, causing inconsistent deduplication.

## Fixes Implemented

### 1. Enhanced writeScan Function (`services/Server/main.js`)

- **Extended deduplication window**: When demographics are provided, check for existing scans within 1 hour (instead of 60 seconds) to allow updating existing scans.
- **Update instead of insert**: When demographics are submitted and an existing scan is found, UPDATE the existing scan instead of creating a duplicate.
- **Fixed fallback INSERT**: Added `visitor_id` and `qr_visitor_id` to the fallback INSERT statement to ensure all scans have visitor identification.
- **Enhanced logging**: Added detailed logging to track when scans are inserted, updated, or deduplicated.

### 2. Fixed Analytics Summary Query (`services/Server/main.js`)

- **Aligned visitor identification**: Updated `dedupCTE` to use `visitor_id` when available (matching writeScan logic), falling back to IP/browser/OS combo only when `visitor_id` is NULL.
- **Consistent deduplication**: Both insert-time and analytics-time now use the same visitor identification logic.

### 3. Created Diagnostic Scripts

- **`scripts/investigate-duplicate-scans.js`**: Comprehensive diagnostic script to identify duplicate scans, missing constraints, and deduplication issues.
- **`scripts/ensure-dedupe-constraint.js`**: Script to ensure the deduplication constraint exists in the database.

## Next Steps

1. **Run diagnostic script** to verify current state:
   ```bash
   node scripts/investigate-duplicate-scans.js
   ```

2. **Ensure deduplication constraint exists**:
   ```bash
   node scripts/ensure-dedupe-constraint.js
   ```

3. **Test the fix**:
   - Scan a QR code
   - Submit demographics (should update existing scan, not create duplicate)
   - Check analytics summary (should show correct count)

4. **Monitor logs** for:
   - `💾 writeScan: Updating existing scan with demographics` - confirms updates instead of duplicates
   - `📊 ANALYTICS: track-scan result` - shows deduped/updated status

## Database Migration Required

If the deduplication constraint doesn't exist, run:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_scans_minute_dedupe
ON qr_scans (qr_code_id, visitor_id, date_trunc('minute', scanned_at))
WHERE visitor_id IS NOT NULL;
```

Or use the alternative approach if `date_trunc` isn't allowed:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_scans_minute_dedupe_simple
ON qr_scans (
  qr_code_id, 
  visitor_id,
  EXTRACT(YEAR FROM scanned_at)::int,
  EXTRACT(MONTH FROM scanned_at)::int,
  EXTRACT(DAY FROM scanned_at)::int,
  EXTRACT(HOUR FROM scanned_at)::int,
  EXTRACT(MINUTE FROM scanned_at)::int
)
WHERE visitor_id IS NOT NULL;
```

## Expected Behavior After Fix

- Single scan per QR code per visitor per minute
- Demographics submissions update existing scans instead of creating duplicates
- Analytics summary matches actual unique scan count
- All scans have `visitor_id` for proper deduplication

