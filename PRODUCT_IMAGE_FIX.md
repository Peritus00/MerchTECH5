# Product Image Display Fix

## Issue
Product images were not displaying correctly on the web app (app.merchtrader.org). The browser was returning 404 errors when trying to load images.

## Root Cause
The `MobileCompatibleImage` component had incorrect URL rewriting logic that was:
1. Taking correct Railway API URLs: `https://merchtech5-production.up.railway.app/api/images/s3/users/43/media/...`
2. Incorrectly rewriting them to: `https://app.merchtrader.org/api/images/s3/users/43/media/...`

The problem was that `app.merchtrader.org` is the frontend domain and doesn't have an image proxy endpoint - it's a static site. The actual image proxy exists on the Railway API server.

## Error Details
From the browser console:
```
GET https://app.merchtrader.org/api/images/s3/users/43/media/1759725733239-product_1759725732970.jpg 404 (Not Found)
```

The original URL from the API was correct:
```
https://merchtech5-production.up.railway.app/api/images/s3/users/43/media/1759725733239-product_1759725732970.jpg
```

## Solution Applied

### File Modified
`/components/MobileCompatibleImage.tsx`

### Changes Made
Updated the web-specific URL rewriting logic (lines 53-70) to:

**Before:**
```typescript
if (Platform.OS === 'web') {
  try {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    if (currentOrigin && !isDataLikeUrl) {
      // Always rewrite Railway URLs to current origin
      imageUrl = imageUrl
        .replace('https://merchtech5-production.up.railway.app/api/images/s3/', 
                 `${currentOrigin}/api/images/s3/`)
        .replace('https://merchtech5-production.up.railway.app/api/slideshow-images/', 
                 `${currentOrigin}/api/slideshow-images/`);
    }
  } catch {}
}
```

**After:**
```typescript
if (Platform.OS === 'web') {
  try {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const apiOrigin = env.apiBaseUrl?.replace(/\/$/, '').replace(/\/api$/, '') || '';
    
    // Only rewrite if current origin matches API origin (e.g., both on same domain)
    // This prevents trying to load API images from the frontend domain
    if (currentOrigin && currentOrigin === apiOrigin && !isDataLikeUrl) {
      // Rewrite known proxy paths from Railway domain to current origin
      imageUrl = imageUrl
        .replace('https://merchtech5-production.up.railway.app/api/images/s3/', 
                 `${currentOrigin}/api/images/s3/`)
        .replace('https://merchtech5-production.up.railway.app/api/slideshow-images/', 
                 `${currentOrigin}/api/slideshow-images/`);
    }
    // Otherwise, leave the Railway API URLs as-is so images load directly from the API server
  } catch {}
}
```

## Why This Fix Works

1. **Domain Comparison**: Now checks if `currentOrigin === apiOrigin` before rewriting
2. **In This Case**:
   - `currentOrigin` = `https://app.merchtrader.org` (frontend)
   - `apiOrigin` = `https://merchtech5-production.up.railway.app` (API server)
   - These don't match, so **no rewriting happens**
3. **Result**: Images load directly from Railway API server with proper CORS headers

## CORS Verification
The Railway API server has proper CORS headers configured:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, User-Agent');
res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
```

This allows the frontend to load images directly from the API server.

## Expected Behavior After Fix

### Product Images
- ✅ Product images in store listings load correctly
- ✅ Product images in product detail pages display properly
- ✅ Product link images in playlists/slideshows work
- ✅ No 404 errors in browser console
- ✅ Images load from correct Railway API URLs

### Image URLs
All image URLs should now remain as:
```
https://merchtech5-production.up.railway.app/api/images/s3/users/{userId}/media/{filename}
```

Instead of being incorrectly rewritten to:
```
https://app.merchtrader.org/api/images/s3/users/{userId}/media/{filename}
```

## Testing
1. Clear browser cache
2. Navigate to any product page or playlist with product links
3. Verify images load correctly
4. Check browser console - should see no 404 errors for images
5. Network tab should show images loading from `merchtech5-production.up.railway.app`

## Additional Notes
- This fix maintains compatibility with mobile apps (iOS/Android)
- Server-side image URL sanitization remains unchanged
- The change only affects web platform URL rewriting logic
- Future deployments where frontend and API are on the same domain will still use same-origin optimization
