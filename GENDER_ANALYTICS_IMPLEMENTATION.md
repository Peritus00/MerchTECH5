# Gender Analytics Implementation Summary

## Overview
Successfully added gender identity collection survey that appears sequentially after the age survey, with full analytics integration and dedicated sub-tab in the Demographics section.

## Changes Implemented

### 1. Database Migration
**File**: `database/migrations/018_add_user_gender.sql`
- Added `user_provided_gender` column to `qr_scans` table
- Created index for efficient gender queries
- Added column documentation

### 2. Gender Survey Component
**File**: `components/GenderPromptModal.tsx`
- Created modal component to collect gender identity
- Gender options: "Male", "Female", "Non-binary", "Prefer not to say", "Open-ended"
- Required field (no skip option)
- Purple-themed styling to differentiate from age modal
- Clean, respectful interface

**File**: `utils/genderStorage.ts`
- Created gender storage utilities for localStorage/sessionStorage
- Functions: `saveUserGender()`, `getUserGender()`, `getGenderForTracking()`, `shouldShowGenderPrompt()`
- 90-day expiry on stored gender data
- Session-based prompt management

### 3. Backend Updates
**File**: `services/Server/main.js`

Updated `writeScan()` function:
- Added `userGender` parameter
- Added `user_provided_gender` to INSERT query
- Logs gender data for debugging

Updated `/api/analytics/track-scan` endpoint:
- Accepts `userGender` in request body
- Passes gender data to `writeScan()` function

Updated `/api/analytics/summary` endpoint:
- Added gender demographics query with proper ordering
- Deduplicates scans before aggregating gender data
- Returns `genderDistribution` array in response
- Ordered: Male, Female, Non-binary, Prefer not to say, Open-ended

### 4. Frontend Analytics Service
**File**: `services/analyticsService.ts`
- Updated `trackQRScan()` to accept `userGender` parameter
- Gender data is sent with scan tracking requests

### 5. Sequential Survey Flow
**Files**:
- `app/(public)/playlist-access/[id].tsx`
- `app/(public)/slideshow-access/[id].tsx`

Implemented Sequential Flow:
1. User accesses playlist/slideshow
2. **Age modal appears first** (if not shown in last 90 days)
3. User selects age → saves
4. **Gender modal appears immediately after** (with 500ms delay)
5. User selects gender → saves
6. Both age and gender included in scan tracking

Fallback Logic:
- If age already collected but not gender → show only gender modal
- Both prompts are mandatory (no skip option)
- Data persists for 90 days before re-prompting

### 6. Analytics Dashboard with Sub-tabs
**File**: `app/(tabs)/analytics.tsx`

New Features:
- Added `demographicsSubTab` state ('age' | 'gender')
- Created sub-tab navigation within Demographics tab
- Split demographics into two sub-tabs: Age and Gender

**Age Sub-tab** (existing):
- Age distribution bar chart
- Age breakdown list with percentages
- Purple color scheme

**Gender Sub-tab** (new):
- Gender distribution bar chart
- Gender breakdown list with percentages
- Pink color scheme
- Custom icons for each gender option:
  - Male: male icon
  - Female: female icon
  - Non-binary: transgender icon
  - Prefer not to say: help-outline icon
  - Open-ended: more-horiz icon

### 7. Styling
Added new styles:
- `subTabContainer`: Container for sub-tab navigation
- `subTab`: Individual sub-tab button
- `activeSubTab`: Active sub-tab styling
- `subTabText`: Sub-tab text
- `activeSubTabText`: Active sub-tab text color

## Gender Options
The system tracks the following gender identities:
1. Male
2. Female
3. Non-binary
4. Prefer not to say
5. Open-ended

## Sequential User Flow

### First-Time User:
```
1. Access playlist/slideshow
2. Age modal appears → select age → submit
3. Gender modal appears → select gender → submit
4. Content loads with both demographics tracked
```

### Returning User (within 90 days):
```
1. Access playlist/slideshow
2. No modals appear (already have data)
3. Cached age and gender sent with scan tracking
```

### Returning User (after 90 days):
```
1. Access playlist/slideshow
2. Age modal appears → select age → submit
3. Gender modal appears → select gender → submit
4. Updated demographics tracked
```

## Data Storage & Retention

### Client-Side (localStorage):
- Age data: 90-day expiry, re-prompt after expiration
- Gender data: 90-day expiry, re-prompt after expiration
- Session tracking: Prevents multiple prompts in same session

### Server-Side (Database):
- **Permanent storage** in `qr_scans` table
- All historical data preserved
- Analytics filtered by time range selector (7D, 30D, 90D, 1Y)
- Data never deleted, provides long-term insights

## Analytics Display

### Demographics Tab Structure:
```
Demographics Tab
├── Age Sub-tab
│   ├── Age Distribution Bar Chart (Purple)
│   └── Age List with Percentages
└── Gender Sub-tab
    ├── Gender Distribution Bar Chart (Pink)
    └── Gender List with Percentages and Icons
```

## Benefits

### For Artists/Content Creators:
- Understand both age AND gender demographics
- Make informed decisions about content targeting
- See visual breakdown of audience composition
- Identify primary demographic groups
- Track demographic changes over time

### For System:
- Clean separation of age and gender data
- Respectful, inclusive gender options
- Sequential flow prevents survey fatigue
- Deduplicated analytics data
- Indexed database queries for performance

## Testing Recommendations

1. **Test Sequential Flow**:
   - Access playlist/slideshow as new user
   - Verify age modal appears first
   - Submit age, verify gender modal appears
   - Submit gender, verify both stored

2. **Test Analytics**:
   - Generate scans with different gender options
   - Check Gender sub-tab shows correct distribution
   - Verify icons display correctly for each option
   - Confirm percentages calculate correctly

3. **Test Data Persistence**:
   - Verify gender data persists for 90 days
   - Confirm modal doesn't re-appear within 90 days
   - Test re-prompting after 90 days

4. **Test Backend**:
   - Verify gender data is stored in database
   - Check analytics endpoint returns gender distribution
   - Confirm deduplication works correctly

## Migration Notes

When deploying to production:
1. Run database migration: `018_add_user_gender.sql`
2. Restart server to load updated code
3. Users will see sequential age + gender surveys on next access

## Future Enhancements

Potential improvements:
- Cross-reference gender with age for intersectional insights
- Gender trends over time
- Gender comparison across different QR codes
- Gender + age combination analysis (e.g., "Female, 25-34")
- Export demographic reports
- Demographic-based content recommendations

---

**Implementation Date**: October 29, 2025
**Status**: ✅ Complete and Ready for Testing
**Related**: AGE_ANALYTICS_IMPLEMENTATION.md

