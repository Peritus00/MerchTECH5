# Fix Google OAuth "Error 400: invalid_request" on Android

## Problem
Getting "Access blocked: Authorization Error" with "Error 400: invalid_request" when trying to sign in with Google on Android.

## Root Cause
The OAuth consent screen is not properly configured or the app is in "Testing" mode without the user added as a test user.

## Solution

### Step 1: Configure OAuth Consent Screen

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project

2. **Navigate to OAuth Consent Screen**
   - Go to **APIs & Services** → **OAuth consent screen**

3. **Configure the Consent Screen**
   - **User Type**: Choose **External** (unless you have Google Workspace)
   - **App name**: `MerchTrader` (or your app name)
   - **User support email**: Your email address
   - **Developer contact email**: Your email address
   - Click **Save and Continue**

4. **Add Scopes**
   - Click **Add or Remove Scopes**
   - Add these scopes:
     - `openid`
     - `https://www.googleapis.com/auth/userinfo.profile`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Click **Update** then **Save and Continue**

5. **Add Test Users** (if app is in Testing mode)
   - If your app is in "Testing" mode, you MUST add test users
   - Click **Add Users**
   - Add the email address: `Perrie.Benton@gmail.com`
   - Add any other test users who need access
   - Click **Add** then **Save and Continue**

6. **Publish the App** (Recommended for production)
   - If you want anyone to be able to sign in, click **PUBLISH APP**
   - Google will review your app (usually takes a few days)
   - OR keep it in Testing mode and add all test users

### Step 2: Verify Android OAuth Client Configuration

1. **Go to Credentials**
   - Navigate to **APIs & Services** → **Credentials**

2. **Edit Your Android OAuth Client**
   - Find your Android client: `587879962618-t2oo5ltqmelojee6gotjku4l8sin495p...`
   - Click **Edit** (pencil icon)

3. **Verify Configuration**
   - **Package name**: `com.peritus00.merchtech` ✅
   - **SHA-1 certificate fingerprint**: `E3:8A:D0:C7:72:D3:64:01:AB:37:5F:6C:A7:8F:2E:F7:71:43:56:ED` ✅
   - If SHA-1 is missing, add it

4. **Add Redirect URI** (if needed)
   - Some Android OAuth flows require redirect URIs
   - Click **+ ADD URI** under "Authorized redirect URIs"
   - Add: `merchtechapp://auth/google`
   - Add: `com.peritus00.merchtech://auth/google`
   - Click **SAVE**

### Step 3: Verify Redirect URI in Code

The app is configured to use:
- **Scheme**: `merchtechapp` (from app.json)
- **Path**: `auth/google`
- **Full redirect URI**: `merchtechapp://auth/google`

This should match what's configured in Google Cloud Console.

### Step 4: Test Again

1. **Rebuild the app** (if you made changes):
   ```bash
   eas build --platform android --profile preview
   ```

2. **Install and test**:
   - Install the new build on your Android device
   - Try signing in with Google
   - The error should be resolved

## Quick Fix: Add Test User

If you just need to test quickly:

1. Go to **OAuth consent screen** in Google Cloud Console
2. Scroll to **Test users** section
3. Click **+ ADD USERS**
4. Add: `Perrie.Benton@gmail.com`
5. Click **ADD**
6. Try signing in again immediately (no rebuild needed)

## Alternative: Publish the App

For production use where anyone should be able to sign in:

1. Go to **OAuth consent screen**
2. Click **PUBLISH APP** button
3. Google will review your app (can take 1-7 days)
4. Once approved, anyone can sign in without being a test user

## Verification Checklist

- [ ] OAuth consent screen is configured with app name and email
- [ ] Required scopes are added (openid, profile, email)
- [ ] Test user is added (if in Testing mode) OR app is published
- [ ] Android OAuth client has correct package name
- [ ] Android OAuth client has SHA-1 fingerprint
- [ ] Redirect URIs are configured (if needed)
- [ ] App is rebuilt with latest configuration

## Common Issues

### Issue: "Access blocked" even after adding test user
- **Solution**: Wait a few minutes for changes to propagate, then try again

### Issue: "Invalid redirect URI"
- **Solution**: Make sure `merchtechapp://auth/google` is added to authorized redirect URIs

### Issue: "App not verified"
- **Solution**: Either add users as test users OR publish the app (requires Google verification)

