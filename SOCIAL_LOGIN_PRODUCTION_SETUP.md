# Social Login Production Setup Checklist

## ✅ Step 1: Get Your Google OAuth Client IDs

From Google Cloud Console, copy the Client IDs for each platform:

1. **Desktop/Web Client** (for backend verification):
   - Client ID: `587879962618-kqr0...` (copy full ID)
   - Use this for: `GOOGLE_CLIENT_ID` (backend environment variable)

2. **Android Client**:
   - Client ID: `587879962618-t2oo...` (copy full ID)
   - Use this for: `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (mobile app environment variable)
   - **IMPORTANT**: Make sure you've added the SHA1 fingerprint:
     - SHA1: `E3:8A:D0:C7:72:D3:64:01:AB:37:5F:6C:A7:8F:2E:F7:71:43:56:ED`
   - Package name: `com.peritus00.merchtech` ✅ (already configured)

3. **iOS Client**:
   - Client ID: `587879962618-blge...` (copy full ID)
   - Bundle ID: `com.peritus00.merchtech` ✅ (already configured)

## ✅ Step 2: Update Backend Environment Variables

Add to your `.env` file (or production environment):

```bash
# Google OAuth (use Desktop/Web Client ID)
GOOGLE_CLIENT_ID=587879962618-kqr0...your-full-client-id-here

# Apple OAuth (if configured)
APPLE_CLIENT_ID=your-apple-service-id-here
APPLE_SERVICE_ID=your-apple-service-id-here
APPLE_TEAM_ID=your-apple-team-id-here
```

**For Railway/Vercel deployment:**
- Add these as environment variables in your hosting platform's dashboard

## ✅ Step 3: Update Mobile App Environment Variables

Create or update `.env` file in project root:

```bash
# Google OAuth (use Android Client ID for mobile)
EXPO_PUBLIC_GOOGLE_CLIENT_ID=587879962618-t2oo...your-full-android-client-id-here
```

**Note**: For Expo, you may need to rebuild the app after adding environment variables:
```bash
npx expo prebuild --clean
```

## ✅ Step 4: Update app.json with Apple Team ID

Replace `YOUR_APPLE_TEAM_ID` in `app.json`:

```json
{
  "plugins": [
    [
      "expo-apple-authentication",
      {
        "appleTeamId": "YOUR_ACTUAL_APPLE_TEAM_ID"
      }
    ]
  ]
}
```

## ✅ Step 5: Verify Android Client Configuration

In Google Cloud Console, ensure your Android client has:
- ✅ Package name: `com.peritus00.merchtech`
- ✅ SHA-1 certificate fingerprint: `E3:8A:D0:C7:72:D3:64:01:AB:37:5F:6C:A7:8F:2E:F7:71:43:56:ED`
- ✅ SHA-256 certificate fingerprint: `99:61:F3:B6:96:8D:4D:DF:B4:4A:94:23:27:47:17:AC:81:6C:69:D9:98:12:53:CC:D8:F0:CA:54:F4:A0:BA:5D`

**To add SHA fingerprints:**
1. Go to your Android client in Google Cloud Console
2. Click "Edit"
3. Under "SHA certificate fingerprints", click "Add fingerprint"
4. Paste the SHA-1 fingerprint above
5. Save

## ✅ Step 6: Apple Sign-In Setup (if not done)

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Navigate to Certificates, Identifiers & Profiles
3. Select your App ID: `com.peritus00.merchtech`
4. Enable "Sign in with Apple" capability
5. Create a Service ID:
   - Configure domains and redirect URLs
   - Note the Service ID (this is your `APPLE_CLIENT_ID`)
6. Get your Team ID from the top right of Apple Developer Portal

## ✅ Step 7: Test the Implementation

### Test Google Sign-In:
1. **Backend**: Verify token verification works
   ```bash
   # Test endpoint
   curl -X POST http://localhost:5001/api/auth/google \
     -H "Content-Type: application/json" \
     -d '{"idToken": "test-token"}'
   ```

2. **Mobile**: 
   - Run `npx expo start`
   - Test Google sign-in flow
   - Verify user is created/logged in

### Test Apple Sign-In (iOS only):
1. Test on iOS device/simulator
2. Verify Apple sign-in flow works
3. Verify user is created/logged in

### Test Account Linking:
1. Sign in with email/password
2. Go to Profile Settings
3. Link Google account
4. Link Apple account (iOS)
5. Verify both show as "Connected"
6. Test unlinking (should prevent if it's the last method)

## ✅ Step 8: Production Considerations

### For Production Builds:

1. **Generate Production Keystore** (Android):
   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore android/app/my-release-key.keystore \
     -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Get SHA-1 fingerprint from production keystore
   - Add to Google Cloud Console as a separate Android OAuth client for production

2. **Update Environment Variables**:
   - Use production URLs (not localhost)
   - Use production OAuth client IDs
   - Ensure all secrets are secure

3. **Rebuild App**:
   ```bash
   # For Android
   npx expo build:android

   # For iOS
   npx expo build:ios
   ```

## ✅ Step 9: Security Checklist

- [ ] All OAuth client IDs are set correctly
- [ ] SHA-1 fingerprints are added to Google Cloud Console
- [ ] Backend verifies tokens server-side (not client-side)
- [ ] Environment variables are not committed to git
- [ ] Production keystore is securely stored (not in repo)
- [ ] Apple Team ID is configured correctly
- [ ] OAuth consent screen is configured in Google Cloud Console

## 🚨 Common Issues & Solutions

### Issue: "Google OAuth not configured"
- **Solution**: Make sure `GOOGLE_CLIENT_ID` is set in backend `.env`
- **Solution**: Make sure `EXPO_PUBLIC_GOOGLE_CLIENT_ID` is set for mobile

### Issue: "Invalid Google token"
- **Solution**: Verify you're using the correct Client ID (Desktop for backend, Android for mobile)
- **Solution**: Check SHA-1 fingerprint is added to Android client

### Issue: "Apple Sign-In not available"
- **Solution**: Verify Apple Sign-In is enabled in Apple Developer Portal
- **Solution**: Check `appleTeamId` is set correctly in `app.json`
- **Solution**: Apple Sign-In only works on iOS devices

### Issue: "Cannot unlink last authentication method"
- **Solution**: This is intentional security - users must have at least one auth method
- **Solution**: Add password or another social account first

## 📝 Quick Reference

**Backend Environment Variables:**
- `GOOGLE_CLIENT_ID` - Desktop/Web client ID (for server-side verification)
- `APPLE_CLIENT_ID` - Apple Service ID
- `APPLE_SERVICE_ID` - Same as APPLE_CLIENT_ID
- `APPLE_TEAM_ID` - Apple Developer Team ID

**Mobile Environment Variables:**
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` - Android client ID (for mobile OAuth flow)

**app.json:**
- `ios.bundleIdentifier` - `com.peritus00.merchtech` ✅
- `android.package` - `com.peritus00.merchtech` ✅
- `plugins[expo-apple-authentication].appleTeamId` - Needs to be updated

## 🎯 Next Steps

1. Copy Client IDs from Google Cloud Console
2. Update `.env` files with actual values
3. Update `app.json` with Apple Team ID
4. Add SHA-1 fingerprint to Android client
5. Test locally
6. Deploy to production
7. Test production deployment

