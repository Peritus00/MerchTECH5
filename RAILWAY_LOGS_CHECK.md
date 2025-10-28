# How to Check Railway Logs for Geo Detection

## The Problem

Your scans show:
- ✅ Country: US (detected)
- ❌ City: NULL (not detected)

The code has the fix and should be calling ipinfo.io, but something is failing.

## Check Railway Logs

1. **Go to Railway Dashboard:**
   - https://railway.app
   - Select your project

2. **View Logs:**
   - Click "Deployments" tab
   - Click on the latest deployment
   - Click "View Logs"

3. **Look for these messages when you scan:**

### What to Search For:

**Search for:** `🌍 resolveGeo`

You should see lines like:
```
🌍 resolveGeo: Headers provided: {"countryCode":"US","region":null,"city":null}
🌍 resolveGeo: Client IP: 123.456.789.012
🌍 resolveGeo: Calling external provider: ipinfo for IP: 123.456.789.012
🌍 resolveGeo: ipinfo response for 123.456.789.012: {"country":"US","region":"California","city":"Los Angeles"}
```

## Possible Issues to Look For:

### Issue 1: No IP Detected
```
🌍 resolveGeo: Client IP: null
🌍 resolveGeo: No IP found, returning headers only
```

**Fix:** Railway may not be passing IP headers correctly

### Issue 2: API Timeout
```
🌍 resolveGeo: Calling external provider: ipinfo for IP: 123.456.789.012
(no response - timeout after 2 seconds)
```

**Fix:** Increase timeout or check network connectivity

### Issue 3: API Error
```
🌍 resolveGeo: ipinfo response error: <error message>
```

**Fix:** Check if API key is correct or rate limit exceeded

### Issue 4: Private/Local IP
```
🌍 resolveGeo: Client IP: 127.0.0.1
```

**Fix:** This happens in local development - use real device to scan

## Quick Actions

### Action 1: Scan a QR Code Now
Do this while watching Railway logs in real-time to see the geo detection process

### Action 2: Check Environment Variables
In Railway → Variables, verify:
```
GEO_PROVIDER = ipinfo
GEO_API_KEY = 788978130e33f6
```

### Action 3: Check ipinfo.io Quota
Go to: https://ipinfo.io/account
Make sure you haven't exceeded 50k requests/month

## What the Logs Should Show

When working correctly, you'll see this sequence:
1. Request comes in
2. Headers provide country only
3. IP is detected
4. ipinfo.io API is called
5. Response includes city data
6. Data is saved to database

## If You Can't Access Logs

Run this after scanning:
```bash
cd /Users/admin/Downloads/merchtechapp5
node scripts/check-latest-scan.js
```

This will show if city data was captured.

