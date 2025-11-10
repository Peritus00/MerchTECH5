# Unique Plays Analytics Fix Summary

## Problem Identified
- **Issue**: Unique Plays showed 0 despite having 4 Total Media Plays
- **Root Cause**: Backend queries used `play_duration > 30` but frontend tracks plays at exactly `duration = 30` seconds
- **Impact**: Plays that reached exactly 30 seconds were not being counted as unique plays

## Fixes Implemented

### 1. Fixed Duration Comparison in Unique Play Check (Tracking Endpoint)
**File**: `services/Server/main.js` (lines 1889-1901)
- Changed `if (playDuration > 30)` to `if (playDuration >= 30)`
- Changed SQL query from `play_duration > 30` to `play_duration >= 30`
- Updated comments to reflect `>= 30` requirement

### 2. Fixed Duration Comparison in Play Stats Query
**File**: `services/Server/main.js` (lines 2214-2227)
- Changed unique plays query from `WHERE mp.play_duration > 30` to `WHERE mp.play_duration >= 30`
- Updated comments to reflect `>= 30` requirement

### 3. Fixed Duration Comparison in Most Played Media Query
**File**: `services/Server/main.js` (lines 2262-2282)
- Changed CASE statement from `WHEN mp.play_duration > 30` to `WHEN mp.play_duration >= 30`
- Updated comment to reflect `>= 30` requirement

### 4. Fixed Duration Comparison in Media Items Stats Query
**File**: `services/Server/main.js` (lines 2318-2338)
- Changed CASE statement from `WHEN mp.play_duration > 30` to `WHEN mp.play_duration >= 30`
- Updated comment to reflect `>= 30` requirement

### 5. Fixed Duration Comparison in Individual Media Stats Query
**File**: `services/Server/main.js` (lines 2385-2391)
- Changed query from `WHERE mp.media_id = $1 AND mp.play_duration > 30` to `WHERE mp.media_id = $1 AND mp.play_duration >= 30`
- Updated comment to reflect `>= 30` requirement

## How It Works Now

1. **Frontend Tracking** (`components/MediaPlayer.tsx`):
   - Tracks initial play with `duration = 1` (counts toward Total Plays)
   - When timer reaches exactly 30 seconds, tracks again with `duration = 30` (for Unique Plays milestone)

2. **Backend Processing** (`services/Server/main.js`):
   - Accepts all play durations for Total Plays count
   - Counts plays with `play_duration >= 30` as Unique Plays
   - Ensures one unique play per (media_id, user_id/session_id) combination

## Testing

The diagnostic script `diagnose-unique-plays-issue.js` was created to:
- Check actual data in `media_plays` table
- Show plays by duration category
- Compare current vs fixed unique plays calculation
- Identify plays with exactly 30 seconds that weren't being counted

## Expected Behavior

- **Total Media Plays**: Counts ALL plays regardless of duration
- **Unique Plays**: Counts plays with `duration >= 30` seconds, one per user/session per media item
- Plays tracked at exactly 30 seconds will now be counted as unique plays

## Files Modified

1. `services/Server/main.js` - Fixed 5 locations where `> 30` was changed to `>= 30`
2. `diagnose-unique-plays-issue.js` - Created diagnostic script (new file)
3. `check-media-aggregates.js` - Created aggregate check script (new file)

## Notes

- No changes were needed in frontend components (`MediaPlayer.tsx`, `PlaylistPlayer.tsx`) as they correctly track at 30 seconds
- The fix ensures consistency between frontend tracking (exactly 30s) and backend counting (>= 30s)
- All SQL queries and JavaScript conditions now use `>= 30` consistently

