# Quick Fix: City Not Showing in Analytics

## Problem
You scanned a QR code but the city shows as "Unknown" in analytics.

## Root Cause
Railway/Cloudflare only provides country data, not city data. The system needs an external geolocation service.

## Solution (5 minutes)

### Step 1: Sign up for ipinfo.io
- Go to: **https://ipinfo.io/signup**
- Free tier: 50,000 requests/month (way more than you need)
- No credit card required

### Step 2: Get your API token
- After signup: **https://ipinfo.io/account/token**
- Copy the token

### Step 3: Add to Railway
1. Go to Railway dashboard
2. Select your project: **merchtech5-production**
3. Click **Variables** tab
4. Add these two variables:
   ```
   GEO_PROVIDER=ipinfo
   GEO_API_KEY=<paste your token here>
   ```
5. Railway will auto-redeploy

### Step 4: Test
1. Wait 2-3 minutes for deployment
2. Scan a QR code from your phone
3. Wait 30 seconds (analytics auto-refresh)
4. Check analytics page - your city should appear!

## Results

**Before:**
```
Top Cities by Scans
1. Unknown • US    64 scans
2. Unknown • CN     3 scans
```

**After:**
```
Top Cities by Scans
1. Los Angeles • US    32 scans
2. New York • US       18 scans
3. Chicago • US        14 scans
4. Beijing • CN         3 scans
```

## Why This Happened

Your analytics code was already set up correctly, but:
- Railway only provides country headers (US, CN, etc.)
- The backup system (geoip-lite) has limited city data
- An external provider like ipinfo.io gives accurate city/region info

## Cost

**Free forever** if you stay under 50,000 requests/month.

Current usage: ~300 scans/month  
Free tier: 50,000/month  
**You're using less than 1% of the free tier!**

---

## Alternative: User Location Prompt

If you don't want to configure ipinfo.io, your app already has a location prompt that asks users for their city. This is free but requires users to manually enter their location.

---

## More Details

See `CITY_ANALYTICS_FIX_SUMMARY.md` for:
- Complete technical explanation
- Testing instructions
- Cost analysis
- Troubleshooting guide

## Questions?

Run this to check status:
```bash
node verify-city-analytics-fix.js
```

