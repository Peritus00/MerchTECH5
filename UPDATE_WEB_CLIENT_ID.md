# Update Web Client ID - Action Required

## ✅ Web Client Created Successfully!

Your new Web application OAuth client ID:
```
587879962618-hrknoc2i6g1jecittiro88qceavhj4ea.apps.googleusercontent.com
```

## 🔧 Next Steps - Update Environment Variables

### 1. Update Vercel Environment Variable (REQUIRED)

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Find `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
4. **Update the value** to:
   ```
   587879962618-hrknoc2i6g1jecittiro88qceavhj4ea.apps.googleusercontent.com
   ```
5. Make sure it's set for **Production** environment
6. Click **Save**

### 2. Update Railway Environment Variable (Optional but Recommended)

1. Go to your Railway project dashboard
2. Navigate to **Variables**
3. Find `GOOGLE_CLIENT_ID`
4. **Update the value** to:
   ```
   587879962618-hrknoc2i6g1jecittiro88qceavhj4ea.apps.googleusercontent.com
   ```
5. Click **Save**

### 3. Verify Redirect URIs in Google Cloud Console

Make sure your Web client has these redirect URIs configured:

1. Go back to Google Cloud Console
2. Click on your **Web application** client (the one you just created)
3. Verify these **Authorized redirect URIs** are added:
   - `https://www.merchtrader.org/auth/google`
   - `https://app.merchtrader.org/auth/google`
   - `http://localhost:8081/auth/google` (for local development)

4. Verify these **Authorized JavaScript origins** are added:
   - `https://www.merchtrader.org`
   - `https://app.merchtrader.org`
   - `http://localhost:8081` (for local development)

### 4. Redeploy

- **Vercel**: Will auto-redeploy when you save the environment variable, or you can trigger a manual redeploy
- **Railway**: Will auto-redeploy when you push to git (already done)

## ✅ After Updates

Once you've updated the environment variables:

1. Wait 1-2 minutes for Vercel to redeploy
2. Test Google sign-in on your production site
3. The redirect URI mismatch error should be resolved

## 📝 Client ID Summary

- **Web Client** (for web sign-in): `587879962618-hrknoc2i6g1jecittiro88qceavhj4ea.apps.googleusercontent.com`
- **Android Client** (for mobile): `587879962618-t2oo5ltqmelojee6gotjku4l8sin495p.apps.googleusercontent.com`
- **iOS Client** (for iOS): `587879962618-blge...` (your iOS client ID)

## ⚠️ Important

- Use the **Web Client ID** for `EXPO_PUBLIC_GOOGLE_CLIENT_ID` in Vercel
- Keep the **Android Client ID** for mobile app builds
- The Web Client ID will work for web OAuth flows with redirect URIs

