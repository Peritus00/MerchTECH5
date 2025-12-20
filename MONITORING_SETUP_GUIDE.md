# Monitoring Setup Guide

This guide helps you set up external monitoring for your MerchTech platform to catch playback issues before customers do.

## Phase 1: Basic Uptime Monitoring

### Option A: UptimeRobot (Free tier available)

1. **Sign up**: Go to https://uptimerobot.com and create a free account
2. **Add Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `MerchTech API Health`
   - URL: `https://merchtech5-production.up.railway.app/api/health`
   - Monitoring Interval: **5 minutes** (free tier minimum)
   - Alert Contacts: Add your email/SMS

3. **Expected Response**: 
   ```json
   {
     "status": "healthy",
     "timestamp": "...",
     "uptime": 12345,
     "services": {
       "database": { "status": "healthy", ... },
       "s3": true
     }
   }
   ```

4. **Alert Settings**:
   - Alert when: Status code is not 200 OR response time > 5 seconds
   - Alert contacts: Your email (and SMS if available)

### Option B: Pingdom (Paid, more features)

1. **Sign up**: Go to https://www.pingdom.com
2. **Add Check**:
   - Check Type: **HTTP**
   - URL: `https://merchtech5-production.up.railway.app/api/health`
   - Check Interval: **1 minute** (or as per your plan)
   - Expected Status Code: `200`
   - Response Time Threshold: **3 seconds**

3. **Alert Settings**:
   - Email alerts when check fails
   - SMS alerts for critical failures (if available)

## Phase 2: Synthetic Playback Monitoring (Critical)

This simulates what a real customer does when playing media.

### Setup with UptimeRobot

1. **Add Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `MerchTech Playback Health`
   - URL: `https://merchtech5-production.up.railway.app/api/health/playback`
   - Monitoring Interval: **5 minutes**
   - Expected Status Code: `200`
   - Response Time Threshold: **10 seconds**

2. **Alert Settings**:
   - Alert when: Status code is not 200 OR response time > 10 seconds
   - This indicates streaming is broken

### Setup with Custom Script (More Control)

If you want more control, you can create a simple Node.js script:

```javascript
// monitor-playback.js
const axios = require('axios');

async function checkPlayback() {
  try {
    const startTime = Date.now();
    const response = await axios.get('https://merchtech5-production.up.railway.app/api/health/playback', {
      timeout: 15000 // 15 second timeout
    });
    
    const responseTime = Date.now() - startTime;
    
    if (response.status === 200 && response.data.status === 'healthy') {
      console.log(`✅ Playback check passed (${responseTime}ms)`);
      process.exit(0);
    } else {
      console.error(`❌ Playback check failed:`, response.data);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Playback check error:`, error.message);
    process.exit(1);
  }
}

checkPlayback();
```

**Run this script**:
- Via cron: `*/5 * * * * node /path/to/monitor-playback.js` (every 5 minutes)
- Via GitHub Actions: Create a workflow that runs every 5 minutes
- Via Railway Cron: Add as a scheduled job

## Phase 3: Railway Built-in Monitoring

Railway provides some monitoring out of the box:

1. **Go to your Railway project**
2. **Click on your service**
3. **View Metrics tab**:
   - Monitor CPU usage (should be < 80% normally)
   - Monitor Memory usage (should be < 80% normally)
   - Monitor Request rate (watch for spikes)

4. **Set up Alerts** (if available in your Railway plan):
   - Alert on high CPU (> 90%)
   - Alert on high memory (> 90%)
   - Alert on deployment failures

## What to Watch For

### Red Flags (Immediate Action Needed)

1. **Health endpoint returns 503** → Database or S3 is down
2. **Playback health check fails** → Streaming is broken, customers can't play media
3. **Response time > 10 seconds** → Server is overloaded or stalled
4. **Log rate limit warnings** → Too much logging (should be fixed now, but watch for regressions)

### Yellow Flags (Investigate Soon)

1. **Response time > 3 seconds** → Performance degradation
2. **Health check returns "degraded"** → Some services are slow but working
3. **CPU/Memory > 80%** → Approaching resource limits

## Alert Response Playbook

### If `/api/health` fails:
1. Check Railway logs for database connection errors
2. Verify DATABASE_URL is correct
3. Check Neon database status

### If `/api/health/playback` fails:
1. Check Railway logs for S3 errors
2. Verify AWS credentials are valid
3. Test a manual playback: `curl -H "Range: bytes=0-1" https://merchtech5-production.up.railway.app/api/media/[MEDIA_ID]/stream`
4. Check if media files exist in S3

### If response times spike:
1. Check Railway logs for slow queries
2. Review recent deployments
3. Check for log flooding (shouldn't happen now, but verify)

## Testing Your Monitoring

After setup, test that alerts work:

1. **Temporarily break health endpoint** (comment out DB check)
2. **Wait for alert** (should arrive within monitoring interval)
3. **Fix the issue**
4. **Verify alert clears**

## Next Steps

Once monitoring is set up:
- Monitor for 1 week to establish baseline
- Adjust thresholds based on normal patterns
- Set up escalation (e.g., SMS for critical failures)
- Consider adding more granular checks (e.g., specific playlist/media checks)

