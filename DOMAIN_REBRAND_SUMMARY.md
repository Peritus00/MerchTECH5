# Domain Rebrand: MerchTech → MerchTrader

## ✅ Changes Completed

### 1. Environment Configuration Updated
**File:** `config/environment.ts`
- **Production API URL:** `https://merchtrader.org/api`
- **Production Frontend URL:** `https://merchtrader.org`

### 2. QR Code URL Generation Fixed
**Files Updated:**
- `components/AdvancedQREditor.tsx`
- `components/MediaPlayer.tsx`

**QR Code URLs Now Generate:**
- **Playlists:** `https://merchtrader.org/playlist-access/[ID]`
- **Slideshows:** `https://merchtrader.org/slideshow-access/[ID]`

### 3. Preview and Display Components
- QR code preview now shows correct URLs
- Media player streaming URLs updated for production

## 🎯 What This Fixes

### Before (Problem):
```
QR Code URL: https://www.merchtech.net/playlist-access/31
```

### After (Fixed):
```
QR Code URL: https://merchtrader.org/playlist-access/31
```

## 🔧 Technical Changes Made

1. **Environment Configuration:**
   ```typescript
   // Production URLs now point to merchtrader.org
   apiBaseUrl = 'https://merchtrader.org/api';
   FRONTEND_URL = 'https://merchtrader.org';
   ```

2. **QR Code Generation:**
   ```typescript
   // Uses environment variable with fallback to new domain
   const baseUrl = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://www.merchtrader.org';
   finalContent = `${baseUrl}/playlist-access/${selectedPlaylist.id}`;
   ```

## 🚀 Deployment Requirements

### DNS Configuration Needed:
- Point `merchtrader.org` to your server
- Ensure SSL certificate covers `merchtrader.org`
- Update any CDN or proxy configurations

### Server Configuration:
- Configure your web server to serve the app at `merchtrader.org`
- Update CORS settings if needed
- Verify API endpoints are accessible at `https://merchtrader.org/api`

### Environment Variables:
For production deployment, set:
```bash
EXPO_PUBLIC_NODE_ENV=production
EXPO_PUBLIC_FRONTEND_URL=https://merchtrader.org
```

## ✅ Verification

Run the verification script:
```bash
node scripts/verify-domain-rebrand.js
```

## 📱 Testing Checklist

- [ ] Create a new QR code in the app
- [ ] Verify the generated URL uses `merchtrader.org`
- [ ] Scan the QR code to ensure it works
- [ ] Test both playlist and slideshow QR codes
- [ ] Verify URLs work in both mobile and web browsers

## 🔗 Impact

- **New QR codes** will automatically use the correct domain
- **Existing QR codes** with old URLs will still work if you maintain backwards compatibility
- **Users scanning QR codes** will be directed to the rebranded domain

## 📋 Additional Notes

- Development URLs still use localhost/IP addresses as configured
- Railway URLs are maintained for development/staging environments
- The rebrand only affects production URL generation
- No app rebuild required - changes take effect immediately
