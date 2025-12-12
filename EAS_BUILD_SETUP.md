# EAS Build Setup Guide - Production Builds

## Current Status

✅ **EAS CLI installed and logged in** (peritus00)  
⚠️ **iOS Build**: Requires Apple Developer account credentials  
⚠️ **Android Build**: Requires `google-services.json` file for Firebase/Expo Push Notifications

---

## 🍏 iOS Build Setup

### Option 1: Build with Apple Account Login (Recommended)

Run this command and follow the prompts to log in with your Apple Developer account:

```bash
eas build --platform ios --profile production
```

EAS will:
- Generate all necessary certificates automatically
- Create provisioning profiles
- Handle code signing

**Requirements:**
- Apple Developer account (paid membership)
- Apple ID credentials
- Team ID: `4F996CU4LJ` (already configured in app.json)

### Option 2: Use Existing Credentials

If you already have certificates set up, EAS will use them automatically.

---

## 🤖 Android Build Setup

### Step 1: Get `google-services.json` from Firebase

1. **Go to Firebase Console**: https://console.firebase.google.com
2. **Create or select your project**
3. **Add Android app**:
   - Package name: `com.peritus00.merchtech` (must match app.json)
   - Download `google-services.json`
4. **Place the file** in your project root: `/Users/admin/Downloads/merchtechapp5/google-services.json`

### Step 2: Create Google Service Account (Required for Play Store Upload & FCM)

**This is different from `google-services.json`** - this is needed for:
- Automatically uploading apps to Google Play Store
- Sending Android Notifications via FCM V1

**Instructions:**

1. **Go to Google Cloud Console**: https://console.cloud.google.com
2. **Select your Firebase project** (or the project associated with your app)
3. **Navigate to IAM & Admin → Service Accounts**:
   - URL: https://console.cloud.google.com/iam-admin/serviceaccounts
4. **Click "Create Service Account"**:
   - Name: `eas-build-service-account` (or any name you prefer)
   - Description: "Service account for EAS builds and Play Store uploads"
   - Click "Create and Continue"
5. **Grant Permissions**:
   - Role: `Service Account User` (basic role)
   - For Play Store uploads, you'll also need to grant access in Google Play Console (see step 6)
   - Click "Continue" then "Done"
6. **Create and Download JSON Key**:
   - Click on the newly created service account
   - Go to the "Keys" tab
   - Click "Add Key" → "Create new key"
   - Select "JSON" format
   - Click "Create" - this will download a JSON file (e.g., `merchtrader-app-xxxxx.json`)
7. **Grant Play Store Access** (for automatic uploads):
   - Go to Google Play Console: https://play.google.com/console
   - Navigate to **Setup → API access**
   - Find your service account (it should appear automatically)
   - Click "Grant Access"
   - Grant permissions: **Release to production** (or appropriate permissions)
   - Click "Invite user"
8. **Save the JSON file**:
   - Place it in your project root or a secure location
   - **DO NOT commit this file to git** (it contains sensitive credentials)
   - Example filename: `google-service-account-key.json`

### Step 3: Configure EAS with Service Account

When you run `eas build --platform android --profile production`, EAS will prompt you for the service account file path. Provide the path to the JSON file you downloaded.

**Or configure it beforehand:**
```bash
# EAS will prompt you to select the service account file
eas credentials
```

### Step 4: Build Android

Once both files are configured:

```bash
eas build --platform android --profile production
```

**Note:** You can skip the service account setup if you only want to build the AAB file and manually upload it to Play Store. The service account is only needed for automatic uploads via `eas submit`.

---

## 🚀 Building Both Platforms

### After Setup Complete:

```bash
# Build both platforms
eas build --platform all --profile production

# Or build separately
eas build --platform ios --profile production
eas build --platform android --profile production
```

---

## 📋 Pre-Build Checklist

### iOS:
- [ ] Apple Developer account active
- [ ] Team ID configured: `4F996CU4LJ` ✅
- [ ] Bundle ID: `com.peritus00.merchtech` ✅
- [ ] Apple Sign-In configured ✅

### Android:
- [ ] Firebase project created
- [ ] `google-services.json` downloaded and placed in project root
- [ ] Package name matches: `com.peritus00.merchtech` ✅
- [ ] Keystore configured (EAS handles this automatically) ✅

### Both:
- [ ] Production API URL configured: `https://merchtech5-production.up.railway.app/api` ✅
- [ ] App version: `1.1.3` ✅
- [ ] EAS project ID: `90775694-0f94-4a4c-b80f-ee1c26e228fa` ✅

---

## 🔍 Current Configuration

**App Version**: 1.1.3  
**iOS Bundle ID**: com.peritus00.merchtech  
**Android Package**: com.peritus00.merchtech  
**EAS Project ID**: 90775694-0f94-4a4c-b80f-ee1c26e228fa  
**Production API**: https://merchtech5-production.up.railway.app/api

---

## 🆘 Troubleshooting

### iOS: "Input is required, but stdin is not readable"
- Run the build command interactively in your terminal (not through automation)
- Or set up credentials first: `eas credentials`

### Android: "google-services.json is missing"
- Download from Firebase Console
- Place in project root
- Commit to git OR use EAS environment variable

### Build Fails: Check Build Logs
- View build status: https://expo.dev/accounts/peritus00/projects/merchtech/builds
- Check for specific error messages
- Verify all environment variables are set in EAS dashboard

---

## 📱 After Build Completes

1. **Download builds** from EAS dashboard
2. **Test on devices** before submitting
3. **Submit to stores**:
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

---

## 🔗 Useful Links

- EAS Build Dashboard: https://expo.dev/accounts/peritus00/projects/merchtech/builds
- Firebase Console: https://console.firebase.google.com
- Apple Developer: https://developer.apple.com
- EAS Documentation: https://docs.expo.dev/build/introduction/

