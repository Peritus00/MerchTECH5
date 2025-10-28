# 🚨 URGENT: City Data Still Not Working

## Current Status
- ✅ Code fix was pushed to GitHub
- ❌ City data STILL showing as "Unknown"
- ✅ New scans are being recorded (count increased 67 → 71)
- ❌ Railway either hasn't deployed OR environment variables are missing

## The Problem

Your Railway deployment needs **TWO environment variables** to make ipinfo work:

```
GEO_PROVIDER=ipinfo
GEO_API_KEY=<your_ipinfo_token>
```

**These variables MUST be set in Railway's dashboard**, not just in your local `.env` file.

## How to Fix (5 minutes)

### Step 1: Go to Railway Dashboard

**Direct link:** https://railway.app/

### Step 2: Find Your Project

Look for: **merchtech5-production** or your main project

### Step 3: Check Variables Tab

1. Click on your service/project
2. Click **"Variables"** tab (left sidebar)
3. Look for these two variables:
   - `GEO_PROVIDER`
   - `GEO_API_KEY`

### Step 4A: If Variables Are Missing (Most Likely)

**You need to add them:**

1. Click **"New Variable"** or **"+ Variable"**
2. Add first variable:
   - **Name:** `GEO_PROVIDER`
   - **Value:** `ipinfo`
3. Add second variable:
   - **Name:** `GEO_API_KEY`
   - **Value:** `<your ipinfo token>`

**Where to find your ipinfo token:**
- Login to: https://ipinfo.io/
- Go to: https://ipinfo.io/account/token
- Copy your token
- Paste it as the GEO_API_KEY value

4. Click **"Save"** or **"Deploy"**
5. Railway will automatically redeploy (takes 2-3 minutes)

### Step 4B: If Variables Exist But Wrong Format

Make sure they look exactly like this:
```
GEO_PROVIDER=ipinfo    (lowercase, no quotes)
GEO_API_KEY=your_actual_token_here    (no quotes)
```

### Step 5: Force Redeploy (If Needed)

If you added variables but nothing changed:

1. Go to **"Deployments"** tab
2. Find the deployment with commit **b3e62a2**
3. Click **"Redeploy"** button
4. Wait 3 minutes

### Step 6: Test Again

After Railway finishes deploying:

1. **Wait 3-5 minutes** after variables are saved
2. **Scan a QR code** from your phone
3. **Wait 30 seconds** for analytics to refresh
4. **Check analytics page** - city should appear!

## How to Verify It's Working

### Check Railway Logs

1. In Railway dashboard, click **"Logs"** or **"View Logs"**
2. Filter to recent logs
3. After scanning, look for these messages:

**If working:**
```
🌍 resolveGeo: Headers provided: { countryCode: 'US', city: null, region: null }
🌍 resolveGeo: Client IP: 203.0.113.42
🌍 resolveGeo: Calling external provider: ipinfo for IP: 203.0.113.42
🌍 resolveGeo: ipinfo response: { country: 'US', region: 'CA', city: 'Los Angeles' }
```

**If NOT working (variables missing):**
```
🌍 resolveGeo: Headers provided: { countryCode: 'US', city: null, region: null }
🌍 resolveGeo: Client IP: 203.0.113.42
🌍 resolveGeo: No external provider configured
🌍 resolveGeo: Trying geoip-lite fallback
```

**If API key is wrong:**
```
🌍 resolveGeo: Calling external provider: ipinfo for IP: 203.0.113.42
🌍 resolveGeo: External provider failed: Request failed with status code 401
```

## Expected Results After Fix

**Before:**
```
Top Cities by Scans
1. Unknown • US    71 scans
2. Unknown • CN     3 scans
3. Unknown          3 scans
```

**After:**
```
Top Cities by Scans
1. Los Angeles, CA • US    28 scans
2. New York, NY • US       15 scans
3. Chicago, IL • US        12 scans
4. Houston, TX • US         8 scans
5. Beijing • CN             3 scans
```

## Why This Happens

Railway deployments are separate from your local environment:
- ✅ Your local `.env` file is NOT uploaded to Railway (it's in .gitignore)
- ❌ You must set environment variables in Railway's dashboard
- ✅ Once set, Railway redeploys automatically

## Common Mistakes

1. **Forgetting to set variables in Railway** (most common)
2. **Typos in variable names** (GEO_PROVIDER not GEO-PROVIDER)
3. **Wrong API key** (expired or incorrect token)
4. **Not waiting for redeploy** (takes 3-5 minutes)

## If You Don't Have ipinfo Token

If you can't find your ipinfo token:

1. Go to: https://ipinfo.io/signup
2. Sign up (free, no credit card)
3. Go to: https://ipinfo.io/account/token
4. Copy token
5. Add to Railway variables as shown above

Free tier: 50,000 requests/month (way more than you need)

## Alternative: Temporary Test Without ipinfo

If you want to test the code fix without ipinfo:

The code will fall back to `geoip-lite`, but it has limited accuracy. You'll see SOME cities but not all.

## Need Help?

If after adding the variables it still doesn't work:

1. Screenshot your Railway Variables page (hide the API key value)
2. Screenshot the Railway logs after a scan
3. Let me know and I can help debug further

---

**BOTTOM LINE: Add GEO_PROVIDER and GEO_API_KEY to Railway's Variables tab, wait 3 minutes, test again.**

