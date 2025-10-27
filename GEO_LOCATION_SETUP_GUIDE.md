# Geo Location Setup Guide

## Overview
This guide explains how to enable city-level location tracking for QR code scans in the analytics system.

## Current Status ✅
- **Database schema**: All required columns added (`city`, `region`, `visitor_id`, `location_source`, etc.)
- **geoip-lite**: Installed and working (provides country-level data from IP addresses)
- **Migrations**: Successfully applied (012, 015, 016)

## How Geo Detection Works

The system uses a **multi-tiered approach** to determine scan locations:

### 1. Cloud Provider Headers (First Priority)
Railway, Vercel, Cloudflare, and other CDNs provide geo headers:
- `x-vercel-ip-city` - City name
- `x-vercel-ip-country` - Country code
- `cf-ipcountry` - Cloudflare country
- `x-appengine-city` - Google Cloud city

### 2. External Geo API (Second Priority)
If headers don't provide city data, the system can call external APIs:
- **ipinfo.io** - 50,000 requests/month free
- **ipdata.co** - 1,500 requests/day free
- **OpenCage** - For reverse geocoding (lat/lng → city)

### 3. geoip-lite (Fallback) ✅
Local database lookup (no API calls):
- **Pros**: Free, fast, no rate limits, already installed
- **Cons**: Country-level only, no city names
- **Use case**: Fallback when other methods fail

### 4. User-Provided Location (Highest Accuracy)
Users can optionally share their location through browser geolocation API:
- Provides precise lat/lng coordinates
- Reverse geocoded to city name
- Marked as `location_source='user'`

## Setup for Production (Railway)

### Option 1: Use ipinfo.io (Recommended)
1. Sign up at https://ipinfo.io/signup (free tier: 50k requests/month)
2. Get your API token
3. Add to Railway environment variables:
   ```bash
   GEO_PROVIDER=ipinfo
   GEO_API_KEY=your_ipinfo_token_here
   ```

### Option 2: Use ipdata.co
1. Sign up at https://ipdata.co
2. Get your API key
3. Add to Railway environment variables:
   ```bash
   GEO_PROVIDER=ipdata
   GEO_API_KEY=your_ipdata_key_here
   ```

### Option 3: Use OpenCage (for reverse geocoding)
1. Sign up at https://opencagedata.com/api
2. Get your API key
3. Add to Railway environment variables:
   ```bash
   GEOCODER_PROVIDER=opencage
   GEOCODER_API_KEY=your_opencage_key_here
   ```

### Option 4: geoip-lite Only (No Setup Required) ✅
If you don't configure any external provider, the system will automatically use **geoip-lite** as a fallback. This provides:
- Country-level data only
- No city names in most cases
- But it's free, fast, and works without any configuration!

## Testing

### 1. Check Database Schema
```bash
node scripts/check-qr-scans-schema.js
```

### 2. Test Geo Detection
```bash
node scripts/test-geo-detection.js
```

### 3. Test Complete Flow
```bash
node scripts/test-complete-geo-flow.js
```

### 4. Scan a QR Code
1. Create a QR code in the app
2. Scan it from a mobile device
3. Check the database:
```sql
SELECT id, city, region, country_code, location_source, scanned_at 
FROM qr_scans 
ORDER BY scanned_at DESC 
LIMIT 10;
```

### 5. Check Analytics API
```bash
curl https://your-api-url.com/api/analytics/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Look for `topCities` in the response.

## Verifying City Data Appears in Analytics

### Backend (Server)
The `/api/analytics/summary` endpoint includes city data in the `topCities` field:

```javascript
topCities: [
  {
    city: "San Francisco",
    region: "California", 
    country: "US",
    count: 42,
    userProvidedCount: 10
  },
  // ...
]
```

### Frontend (Analytics Page)
The Analytics page displays city data in the **Geography** tab:
- Navigate to Analytics tab in the app
- Switch to "Geography" tab
- Scroll to "Top Cities by Scans" section

## Troubleshooting

### No City Data Appearing
1. **Check if columns exist**:
   ```bash
   node scripts/check-qr-scans-schema.js
   ```

2. **Verify scans have city data**:
   ```sql
   SELECT city, region, country_code, location_source, COUNT(*) 
   FROM qr_scans 
   GROUP BY city, region, country_code, location_source;
   ```

3. **Check geo provider configuration**:
   ```bash
   node scripts/test-complete-geo-flow.js
   ```

### Railway Not Providing Geo Headers
Railway may not provide `x-vercel-ip-city` headers like Vercel does. In this case:
- **Solution**: Set up an external geo provider (ipinfo.io recommended)
- **Alternative**: Use geoip-lite fallback (country-level only)

### Rate Limiting on External APIs
- ipinfo.io free tier: 50,000 requests/month
- If you exceed limits, the system falls back to geoip-lite
- Consider upgrading or using multiple providers

## Database Schema

### qr_scans Table Columns
```sql
-- Auto-detected location (from IP/headers)
city                VARCHAR(100)    -- "San Francisco"
region              VARCHAR(100)    -- "California" 
country_code        VARCHAR(2)      -- "US"
country_name        VARCHAR(100)    -- "United States"

-- User-provided location (from browser geolocation)
user_provided_city  TEXT           -- User-entered city
user_provided_state TEXT           -- User-entered state
user_provided_zip   TEXT           -- User-entered zip code

-- Geo coordinates
geo_lat             NUMERIC(9,6)   -- Latitude
geo_lng             NUMERIC(9,6)   -- Longitude
geo_accuracy_m      INTEGER        -- Accuracy in meters

-- Metadata
location_source     TEXT           -- 'auto', 'user', 'browser', 'unknown'
visitor_id          UUID           -- Anonymous visitor ID
qr_visitor_id       TEXT           -- Legacy visitor tracking
```

## Next Steps
1. ✅ Database migrations completed
2. ✅ geoip-lite installed and tested
3. ⏳ Add GEO_PROVIDER to Railway (optional but recommended)
4. ⏳ Test with real QR code scans
5. ⏳ Verify city data appears in Analytics page

## Files Modified/Created
- `database/migrations/012_add_qr_scan_fields.sql` - Added city, region, visitor_id
- `database/migrations/015_user_provided_location.sql` - Added user-provided location
- `database/migrations/016_browser_geo.sql` - Added geo coordinates
- `scripts/check-qr-scans-schema.js` - Schema verification tool
- `scripts/run-missing-migrations.js` - Migration runner
- `scripts/test-geo-detection.js` - Geo detection test
- `scripts/test-complete-geo-flow.js` - End-to-end test
- `GEO_LOCATION_SETUP_GUIDE.md` - This guide

## Support
For questions or issues, check:
1. Server logs: Look for "📍" emoji prefixed messages
2. Database: Query `qr_scans` table directly
3. Test scripts: Run the test scripts to diagnose issues

