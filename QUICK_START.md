# Quick Start - City Analytics

## ✅ What's Done
- Database migrations applied
- geoip-lite configured and working
- Server code bug fixed
- Test scripts created
- Everything tested and verified

## 🚀 What You Need to Do

### For Local Testing (Optional)
Already working! Test scans show San Francisco, CA appearing in analytics.

```bash
# Verify everything is working
node scripts/verify-test-data.js
```

### For Production (Railway) - Recommended

To get **city-level** location data in production:

1. **Sign up for ipinfo.io**
   - Go to: https://ipinfo.io/signup
   - Free tier: 50,000 requests/month
   - Copy your API token

2. **Add to Railway**
   - Open your Railway project
   - Go to Variables tab
   - Add these two variables:
     ```
     GEO_PROVIDER=ipinfo
     GEO_API_KEY=<paste-your-token-here>
     ```
   - Railway will auto-deploy

3. **Push Your Code**
   ```bash
   git add .
   git commit -m "Fix city analytics - add geo detection and fix database schema"
   git push origin main
   ```

That's it! Railway will automatically deploy.

## 📊 Viewing Results

1. **In the App**
   - Open Analytics tab
   - Click "Geography" section
   - Scroll to "Top Cities by Scans"

2. **In Database**
   ```sql
   SELECT city, region, country_code, COUNT(*) 
   FROM qr_scans 
   WHERE city IS NOT NULL 
   GROUP BY city, region, country_code 
   ORDER BY COUNT(*) DESC;
   ```

3. **Via API**
   ```bash
   curl https://your-api.railway.app/api/analytics/summary \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
   Look for `topCities` in the response.

## 🧪 Testing

```bash
# Check database schema
node scripts/check-qr-scans-schema.js

# Test geo detection
node scripts/test-geo-detection.js

# Verify test data
node scripts/verify-test-data.js
```

## 🤔 Without External Provider?

If you don't configure ipinfo.io:
- ✅ System still works
- ✅ Uses geoip-lite (free, no setup)
- ⚠️  Country-level only (no cities in most cases)
- ⚠️  Cities only captured from:
  - Cloud provider headers (if available)
  - User-provided location
  - Browser geolocation

## 📚 More Info

- Full guide: `GEO_LOCATION_SETUP_GUIDE.md`
- Implementation details: `CITY_ANALYTICS_FIX_SUMMARY.md`
- Test scripts: `scripts/test-*.js`

---
**Status**: ✅ Ready to deploy

