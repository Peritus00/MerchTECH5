# Demographics Collection Refactor - Final Implementation

## Critical Changes

### Problem with Previous Implementation:
- ❌ Surveys appeared on page load (before QR scan)
- ❌ Surveys appeared for ALL users (even authenticated users)
- ❌ No check for existing user demographics
- ❌ Separate age and gender modals (poor UX)

### New Implementation:
- ✅ Surveys appear ONLY after QR code scan + content starts playing
- ✅ 15-second delay before survey overlay appears
- ✅ Only shown to unauthenticated users OR authenticated users missing demographics
- ✅ Combined age + gender survey (single modal, better UX)
- ✅ Demographics saved to user profile (authenticated) or localStorage (anonymous)

## Changes Made

### 1. Database Migration
**File**: `database/migrations/019_add_user_demographics.sql`
- Added `age_range` and `gender` columns to `users` table
- Created indexes for demographic queries
- Authenticated users' demographics stored in profile

### 2. Backend API Endpoints
**File**: `services/Server/main.js`

New Endpoints:
- `GET /api/user/demographics` - Fetch current user's demographics
- `PUT /api/user/demographics` - Update current user's demographics

Returns: `{ ageRange, gender, hasData }`

### 3. Frontend API Service
**File**: `services/api.ts`

Added to `usersAPI`:
- `getDemographics()` - Fetch user demographics
- `updateDemographics(ageRange, gender)` - Save demographics to profile

### 4. Unified Survey Component
**File**: `components/DemographicsSurveyOverlay.tsx`

Key Features:
- Combined age + gender in one modal
- Both fields required before submission
- Overlay style (centered, translucent background)
- Clean, modern UI
- Works for both authenticated and anonymous users

**Replaced**:
- `components/AgePromptModal.tsx` (still exists but deprecated)
- `components/GenderPromptModal.tsx` (still exists but deprecated)

### 5. Demographics Helper Utility
**File**: `utils/demographicsHelper.ts`

Core Functions:
- `shouldShowDemographicsSurvey()` - Check if survey needed (hybrid logic)
- `getDemographicsForTracking()` - Get demographics for analytics
- `fetchUserDemographics()` - Load from server (authenticated users)
- `saveDemographics()` - Save to profile or localStorage

**Hybrid Logic**:
```javascript
IF authenticated:
  → Check users.age_range and users.gender
  → If both exist: Use from profile, don't show survey
  → If missing: Show survey, save to profile

IF anonymous:
  → Check localStorage
  → If both exist and not expired: Don't show survey
  → If missing: Show survey, save to localStorage for 90 days
```

### 6. Updated Access Screens
**Files**:
- `app/(public)/playlist-access/[id].tsx`
- `app/(public)/slideshow-access/[id].tsx`

Changes:
- Removed surveys from page load
- Added authentication checks
- Fetch user demographics on mount (if authenticated)
- Show survey overlay AFTER 15 seconds of content being accessible
- Don't show during registration or app download flows
- Use unified DemographicsSurveyOverlay
- Save to profile or localStorage based on auth status
- Track demographics from profile first, fallback to localStorage

## User Flow

### Anonymous User (Not Logged In):
```
1. Scan QR code → Redirected to content
2. Content loads and starts playing
3. After 15 seconds → Demographics survey appears as overlay
4. User fills age + gender → Submit
5. Saved to localStorage for 90 days
6. Survey won't appear again for 90 days
7. Demographics tracked with all future QR scans
```

### Authenticated User (No Demographics in Profile):
```
1. Scan QR code → Redirected to content
2. User logged in, but profile missing demographics
3. Content loads and starts playing
4. After 15 seconds → Demographics survey appears as overlay
5. User fills age + gender → Submit
6. Saved to user profile permanently
7. Survey NEVER appears again for this user
8. Demographics tracked with all QR scans across all devices
```

### Authenticated User (Has Demographics):
```
1. Scan QR code → Redirected to content
2. User logged in, profile has demographics
3. Content loads and starts playing
4. NO survey appears
5. Existing demographics automatically tracked
```

### Access Code Flow:
```
1. Scan QR code → Redirected to playlist/slideshow
2. Enter activation code → Validates
3. Content starts playing
4. After 15 seconds → Survey appears (if needed)
5. User completes survey
6. Content continues playing
```

## Key Benefits

### For Users:
- Survey doesn't interrupt initial access
- One survey instead of two (better UX)
- Authenticated users only asked once ever
- Anonymous users re-prompted every 90 days
- Survey overlays content (can still see/hear content)

### For Artists:
- More accurate demographic data
- Authenticated users provide persistent demographics
- Better analytics across all QR codes
- Demographics linked to user accounts

### For System:
- Clean hybrid approach
- Profile-based for authenticated users
- localStorage-based for anonymous users
- No need for temporary profiles
- Better data integrity

## What's NOT Included Yet

The following pages don't have demographics surveys yet (can be added later):
- Store product pages (`/store/product/:id`)
- Store user pages (`/store/user/:userId`)
- Direct URL access (non-QR)

These can be added in a follow-up if needed.

## Testing

### Test Scenarios:

1. **Anonymous User - First Time**
   - Access playlist via QR
   - Wait 15 seconds
   - Survey should appear
   - Fill and submit
   - Check localStorage for data

2. **Anonymous User - Return Visit**
   - Access same or different playlist
   - Survey should NOT appear (within 90 days)
   - Demographics still tracked

3. **Authenticated User - No Demographics**
   - Log in
   - Access playlist via QR
   - Wait 15 seconds
   - Survey should appear
   - Fill and submit
   - Check database users table for age_range and gender

4. **Authenticated User - Has Demographics**
   - Log in with account that has demographics
   - Access ANY playlist/slideshow
   - Survey should NEVER appear
   - Demographics automatically tracked

5. **Access Code Flow**
   - Scan QR → Enter code → Content plays
   - Wait 15 seconds
   - Survey appears (if needed)

## Migration Notes

Deploy order:
1. Run migration `019_add_user_demographics.sql`
2. Deploy backend (adds API endpoints)
3. Deploy frontend (new survey logic)
4. Test on staging first

---

**Implementation Date**: October 29, 2025
**Status**: ✅ Ready for Deployment
**Previous Versions**: AGE_ANALYTICS_IMPLEMENTATION.md, GENDER_ANALYTICS_IMPLEMENTATION.md

