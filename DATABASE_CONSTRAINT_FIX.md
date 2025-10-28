# Database Constraint Issue - City Data Not Saving

## Problem Identified

Railway logs show ipinfo.io is working and returning city data (Avondale, Louisiana), but the city isn't being saved to the database.

### Root Cause

The main INSERT in `writeScan()` is **failing silently** and falling back to the legacy INSERT which doesn't include the `city` column.

**Evidence from logs:**
1. ✅ ipinfo API called: `city: 'Avondale'`
2. ✅ writeScan received data: `city: 'Avondale'`  
3. ✅ Attempted insert with city
4. ❌ NO "Insert successful" message in logs
5. ❌ Scans 157-159 exist but city=NULL

### Why the INSERT Fails

The main INSERT relies on a unique constraint that may not exist in production:
```sql
ON CONFLICT ON CONSTRAINT uq_qr_scans_minute_dedupe DO NOTHING
```

If this constraint is missing, the INSERT fails and uses the fallback (line 592) which puts city data in the old `location` column instead of the new `city` column.

## Solution

### Option 1: Add the Missing Constraint (Recommended)

Run this SQL on production database:

```sql
-- Create the minute-level deduplication constraint
CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_scans_minute_dedupe
ON qr_scans (qr_code_id, visitor_id, 
             EXTRACT(YEAR FROM scanned_at)::int,
             EXTRACT(MONTH FROM scanned_at)::int, 
             EXTRACT(DAY FROM scanned_at)::int,
             EXTRACT(HOUR FROM scanned_at)::int,
             EXTRACT(MINUTE FROM scanned_at)::int)
WHERE visitor_id IS NOT NULL;
```

### Option 2: Fix the Fallback Insert

Update the fallback to use the new schema:

```javascript
// Line 592 - Update fallback to use new columns
await poolLike.query(
  `INSERT INTO qr_scans (
     qr_code_id, scanned_at, device_type, browser_name, operating_system,
     country_code, region, city, location_source
   ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, 'auto')`,
  [
    qrCodeId, 
    parsed.deviceType, 
    parsed.browserName, 
    parsed.operatingSystem,
    geo.countryCode || null,
    geo.region || null,
    geo.city || null
  ]
);
```

### Option 3: Remove ON CONFLICT Dependency

The current code (line 553) doesn't actually have the ON CONFLICT clause, so the INSERT should work. The issue might be a different column mismatch.

## Immediate Fix

Run this to add the constraint:

```bash
cd /Users/admin/Downloads/merchtechapp5
node scripts/add-dedupe-constraint.js
```

Then scan a QR code again and city data should be captured!

## Verification

After fixing, scan a QR code and run:
```bash
node scripts/check-latest-scan.js
```

Should show: `Avondale, Louisiana US`

