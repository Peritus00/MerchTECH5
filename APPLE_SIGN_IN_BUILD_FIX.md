# Apple Sign In Build Fix

## Problem
Build fails with error:
```
Provisioning profile doesn't support the Sign in with Apple capability
Provisioning profile doesn't include the com.apple.developer.applesignin entitlement
```

## Root Cause
The provisioning profile used by EAS doesn't have the Sign in with Apple capability enabled, even though the app is configured for it.

## Solution Steps

### Step 1: Enable Sign in with Apple in Apple Developer Portal

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list)
2. Click on your App ID: `com.peritus00.merchtech`
3. Scroll down to "Capabilities"
4. Check the box for **"Sign in with Apple"**
5. Click **"Save"** or **"Continue"**

### Step 2: Regenerate EAS Credentials

After enabling the capability in Apple Developer Portal, you need to regenerate the provisioning profile:

**Option A: Via EAS Dashboard (Recommended - REQUIRED)**

**CRITICAL**: You MUST regenerate the provisioning profile via the dashboard. The CLI won't work without Apple account access.

1. Go to: https://expo.dev/accounts/peritus00/projects/merchtech/credentials
2. Click on **"iOS"** in the left sidebar
3. Find the **"preview"** profile (or whichever profile you're using)
4. Look for **"Provisioning Profile"** section
5. Click the **"..."** menu (three dots) next to the provisioning profile
6. Select **"Regenerate"** or **"Clear"**
7. EAS will automatically regenerate it with the Sign in with Apple capability included

**Important**: After regenerating, wait 1-2 minutes for EAS to sync, then trigger a new build.

**Option B: Via EAS CLI (Interactive)**
```bash
npx eas-cli credentials
# Select: iOS
# Select: preview (or the profile you're using)
# Select: Provisioning Profile
# Choose: Regenerate
```

**Option C: Force Regeneration by Clearing Credentials**
```bash
# This will force EAS to regenerate all credentials on next build
npx eas-cli build --platform ios --profile preview --clear-cache
```

### Step 3: Verify Configuration

Ensure your `app.json` has:
```json
{
  "ios": {
    "config": {
      "usesAppleSignIn": true
    }
  },
  "plugins": [
    [
      "expo-apple-authentication",
      {
        "appleTeamId": "4F996CU4LJ"
      }
    ]
  ]
}
```

✅ Your configuration is already correct!

### Step 4: Rebuild

After regenerating credentials, trigger a new build:
```bash
npx eas-cli build --platform ios --profile preview
```

## Verification

After the build succeeds, you can verify the provisioning profile includes Sign in with Apple by:
1. Downloading the build
2. Checking the embedded.mobileprovision file
3. Verifying it contains `com.apple.developer.applesignin` entitlement

## Notes

- The App ID capability must be enabled BEFORE EAS can generate a provisioning profile with it
- EAS automatically manages provisioning profiles, but they need to match the App ID capabilities
- If you've already enabled Sign in with Apple in the portal, just regenerate credentials and rebuild

