# Geographic Location Analytics Fix Guide

## Problem Summary

Your analytics are showing cities as "Unknown" even though you're capturing country data correctly. This is happening because:

1. **Railway/Cloudflare only provides country-level headers** - No city/region information
2. **geoip-lite (local fallback) has limited city data** - Returns empty strings for most IPs
3. **No external geolocation provider configured** - The system needs a service like ipinfo.io

## Current State

Looking at your recent scans:
- ✅ Country Code: **Working** (showing US, CN, etc.)
- ❌ Region: **Not captured** (NULL)
- ❌ City: **Not captured** (NULL)

## Solution Options

### Option 1: Configure External Geolocation Provider (Recommended)

This provides the most accurate city/region data.

#### Using ipinfo.io (Recommended - Best Free Tier)

1. **Sign up for ipinfo.io**: https://ipinfo.io/signup
   - Free tier: **50,000 requests/month**
   - No credit card required

2. **Get your API token** from dashboard: https://ipinfo.io/account/token

3. **Add to your Railway environment variables**:
   ```
   GEO_PROVIDER=ipinfo
   GEO_API_KEY=your_ipinfo_api_token_here
   ```

4. **Restart your Railway deployment** to apply the changes

#### Alternative: Using ipdata.co

1. **Sign up for ipdata.co**: https://ipdata.co/sign-up.html
   - Free tier: **1,500 requests/day**

2. **Get your API key** from dashboard

3. **Add to Railway environment variables**:
   ```
   GEO_PROVIDER=ipdata
   GEO_API_KEY=your_ipdata_api_key_here
   ```

### Option 2: Rely on User-Provided Location

Your app already has a location prompt feature. You can verify it's working by:

1. Checking if users are seeing the location prompt when scanning QR codes
2. Verifying that user-provided locations are being stored in the database
3. The analytics query ALREADY prioritizes user-provided city over auto-detected

## How the System Works (Priority Order)

When someone scans a QR code, the system tries to get location data in this order:

1. **User-provided location** (from location prompt) - **Highest priority**
2. **Cloud provider headers** (Cloudflare: CF-IPCountry, Vercel: x-vercel-ip-city, etc.)
3. **External GEO_PROVIDER** (ipinfo/ipdata) - Only if configured
4. **geoip-lite local database** (fallback, often missing city data)

## Analytics Query

Your analytics already prioritizes user-provided data:

```sql
SELECT 
  COALESCE(
    NULLIF(TRIM(s.user_provided_city), ''), 
    NULLIF(TRIM(s.city), ''), 
    'Unknown'
  ) AS city,
  COALESCE(
    NULLIF(TRIM(s.user_provided_state), ''), 
    NULLIF(TRIM(s.region), ''), 
    ''
  ) AS region
FROM qr_scans s
```

This means if users provide their city via the prompt, it will show up in analytics.

## Testing Your Fix

### After configuring GEO_PROVIDER:

1. **Scan a QR code** from a different location
2. **Wait 30 seconds** (analytics auto-refresh)
3. **Check the analytics page** - you should see actual city names

### To test user-provided location:

1. **Scan a QR code** on mobile
2. **When prompted**, provide your city/state
3. **Check analytics** - should show your provided location

## Verification Script

Run this to check if the fix is working:

```bash
node test-geo-lookup.js
```

Look for scans with:
- `location_source: 'user'` - User provided
- `location_source: 'auto'` - Auto-detected (should have city after fix)
- Non-null `city` and `region` values

## Database Schema Reference

The `qr_scans` table has these location columns:

- `country_code` - 2-letter country code (US, CN, etc.)
- `country_name` - Full country name
- `region` - State/province (auto-detected)
- `city` - City name (auto-detected)
- `user_provided_city` - City from user prompt
- `user_provided_state` - State from user prompt
- `user_provided_zip` - ZIP from user prompt
- `location_source` - 'user', 'auto', or 'unknown'

## Cost Estimates

If you get significant traffic:

### ipinfo.io pricing:
- Free: 50,000 requests/month
- $49/month: 250,000 requests
- $249/month: 500,000 requests

### ipdata.co pricing:
- Free: 1,500 requests/day (~45,000/month)
- $25/month: 10,000 requests/day
- $50/month: 25,000 requests/day

## Recommendation

**For most use cases**: Configure ipinfo.io free tier (50K requests/month)

This gives you:
- Accurate city and region data
- More than enough for small to medium traffic
- No cost to get started
- Easy to upgrade if you grow

Let me know if you need help setting this up!

