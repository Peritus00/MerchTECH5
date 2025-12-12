# Fix Android Google OAuth Redirect URI Error

## Problem
Android build shows "Error 400: invalid_request" with `redirect_uri=merchtechapp://auth/google`.

## Root Cause
Android OAuth clients don't support redirect URIs. They use package name and SHA-1 fingerprint for verification. We need to use the Android Client ID (not iOS Client ID) for Android builds.

## Solution

### Step 1: Verify Android Client in Google Cloud Console

1. **Go to Google Cloud Console**
   - Navigate to **Google Auth Platform** → **Clients**
   - Find **"Android client 1"** (Client ID: `587879962618-t2oo5ltqmelojee6gotjku4l8sin495p...`)

2. **Edit Android Client**
   - Click **Edit** icon
   - Verify:
     - **Package name**: `com.peritus00.merchtech` ✅
     - **SHA-1 certificate fingerprint**: `E3:8A:D0:C7:72:D3:64:01:AB:37:5F:6C:A7:8F:2E:F7:71:43:56:ED` ✅
   - **Note**: Android clients don't have redirect URI fields - this is correct!
   - Click **SAVE**

### Step 2: Use Platform-Specific Client IDs

Since EAS doesn't support platform-specific env vars in the same profile, we have two options:

**Option A: Use Android Client ID for All Builds (Simplest)**
- Android Client ID works because it's configured with package name and SHA-1
- iOS might also work since it shares the same bundle/package name
- Update `eas.json` to use Android Client ID

**Option B: Create Separate Build Profiles**
- Create `android-preview` and `ios-preview` profiles
- Each with their respective Client IDs

### Step 3: Rebuild Android App

After updating configuration:

```bash
eas build --platform android --profile preview
```

## Important Notes

- **Android OAuth**: Uses package name + SHA-1, NOT redirect URIs
- **iOS OAuth**: Uses Bundle ID, can use redirect URIs
- **expo-auth-session**: Generates redirect URI automatically, but Android OAuth ignores it
- The redirect URI error on Android is misleading - the real issue is using the wrong Client ID

## Current Configuration

- **Android Package**: `com.peritus00.merchtech` ✅
- **Android SHA-1**: `E3:8A:D0:C7:72:D3:64:01:AB:37:5F:6C:A7:8F:2E:F7:71:43:56:ED` ✅
- **Android Client ID**: `587879962618-t2oo5ltqmelojee6gotjku4l8sin495p.apps.googleusercontent.com`
- **OAuth Consent Screen**: In production ✅

