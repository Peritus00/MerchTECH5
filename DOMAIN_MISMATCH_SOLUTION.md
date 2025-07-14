# Domain Mismatch Issue Resolution

## Problem
The frontend at `https://app.merchtech.net/` is making API requests to `merchtechapp5-production.up.railway.app` but the actual server is deployed at `merchtech5-production.up.railway.app`.

## Root Cause
- Frontend configuration points to incorrect Railway URL
- The `merchtechapp5-production.up.railway.app` deployment doesn't exist
- Results in 404 errors for all API requests from the frontend

## Current Status
- ✅ Server is working correctly at `merchtech5-production.up.railway.app`
- ✅ Image proxy endpoint has backward compatibility for legacy URLs
- ✅ Upload endpoint is working with S3 integration
- ❌ Frontend is configured with wrong domain

## Solutions Implemented

### 1. Server-Side Redirect (Partial)
```javascript
// In main.js - handles requests that reach our server
app.use((req, res, next) => {
  const host = req.get('host');
  if (host === 'merchtechapp5-production.up.railway.app') {
    return res.redirect(301, `https://merchtech5-production.up.railway.app${req.originalUrl}`);
  }
  next();
});
```

**Limitation**: This only works if requests reach our server, but Railway returns 404 before reaching our app.

### 2. Image Proxy Backward Compatibility
```javascript
// Handles legacy URL structures and missing files
app.get('/api/images/s3/*', async (req, res) => {
  // Convert legacy URLs: "1/filename" → "users/1/media/filename"
  // Fallback to placeholder image if not found
});
```

**Status**: ✅ Working - provides placeholder images for missing files

## Recommended Solutions

### Option 1: Fix Frontend Configuration (Recommended)
Update the frontend configuration to use the correct API URL:
- Change from: `merchtechapp5-production.up.railway.app`
- Change to: `merchtech5-production.up.railway.app`

**Files to check:**
- Frontend environment variables
- Build configuration
- Deployment scripts
- Any hardcoded URLs in the frontend code

### Option 2: Create Railway Deployment Alias
Create a new Railway deployment or alias for `merchtechapp5-production` that points to the same application.

### Option 3: DNS/Proxy Solution
Set up a DNS CNAME or proxy service that redirects `merchtechapp5-production.up.railway.app` to `merchtech5-production.up.railway.app`.

## Current Workaround
The image proxy endpoint now provides placeholder images instead of 404 errors, improving user experience while the domain issue is resolved.

## Test Results
```bash
# Correct URL - Works
curl "https://merchtech5-production.up.railway.app/api/images/s3/1/test.jpg"
# Returns: Placeholder image (200 OK)

# Incorrect URL - Railway 404
curl "https://merchtechapp5-production.up.railway.app/api/images/s3/1/test.jpg"  
# Returns: {"status":"error","code":404,"message":"Application not found"}
```

## Next Steps
1. **Immediate**: Frontend team should update API configuration
2. **Short-term**: Verify all environment variables and build configurations
3. **Long-term**: Implement proper CI/CD with environment validation

## Impact
- **User Experience**: Improved with placeholder images
- **Functionality**: Core features work on correct domain
- **SEO**: No impact as main domain is correct
- **Performance**: Minimal impact from redirects 