# Demographics Not Showing Up - Root Cause Analysis

## Problem
Demographics (age and gender) entered on iPhone are not appearing in the analytics demographic fields.

## Root Causes Identified

### 1. **UUID Type Error Preventing All Scans**
**Status**: ✅ FIXED
- **Issue**: PostgreSQL couldn't infer UUID type for `visitor_id` column
- **Error**: `inconsistent types deduced for parameter $14` - `uuid versus text`
- **Fix**: Changed from `$14::uuid` to `CAST($14 AS uuid)` in both main and fallback INSERT statements
- **Impact**: This was preventing ALL scans from being inserted, including those with demographics

### 2. **Missing Demographics Columns**
**Status**: ✅ FIXED
- **Issue**: `user_provided_age_range` and `user_provided_gender` columns didn't exist in database
- **Error**: `column "user_provided_age_range" does not exist`
- **Fix**: Ran migrations 017 and 018 to add the columns
- **Impact**: Even if scans were inserting, demographics couldn't be saved

### 3. **Demographics Update Logic**
**Status**: ✅ WORKING (but needs testing)
- **Flow**: When demographics are submitted, code checks for existing scan within 1 hour
- **If found**: Updates existing scan with demographics
- **If not found**: Inserts new scan WITH demographics
- **Potential Issue**: If initial scan failed (UUID error), there's nothing to update

## Current Status

### Fixed Issues:
1. ✅ UUID type casting fixed - scans should now insert successfully
2. ✅ Demographics columns added to database
3. ✅ Demographics are included in INSERT statements (positions $20 and $21)

### Testing Needed:
1. **Scan a QR code now** - should insert successfully with UUID fix
2. **Submit demographics** - should either:
   - UPDATE existing scan if within 1 hour
   - INSERT new scan with demographics if no existing scan found
3. **Check analytics** - demographics should appear in age/gender distribution

## Why Demographics Weren't Showing Previously

From logs analysis:
- Demographics were being sent (`hasUserAge: true, hasUserGender: true`)
- INSERT was attempted but failed due to UUID type error
- No scan was saved, so demographics were lost
- Demographics columns didn't exist, so even if scan saved, demographics couldn't be stored

## Next Steps

1. **After Railway deploys** (automatic after push):
   - Scan a QR code on iPhone
   - Submit demographics
   - Check analytics dashboard - demographics should appear

2. **If still not working**, check:
   - Railway logs for `💾 writeScan: Scan updated successfully` or `💾 writeScan: Insert successful`
   - Verify `visitor_id` is being set correctly (check cookie `qr_vid`)
   - Check if deduplication is finding existing scans correctly

3. **Verify demographics in database**:
   ```bash
   node scripts/check-demographics-data.js
   ```

## Database Schema

The following columns now exist:
- `qr_scans.user_provided_age_range` (TEXT)
- `qr_scans.user_provided_gender` (TEXT)

Both columns are indexed for efficient analytics queries.

