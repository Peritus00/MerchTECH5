# Google Web OAuth Client Setup Guide

## Problem
You're currently using an Android OAuth Client ID for web sign-in, but Android clients don't support redirect URIs. You need to create a **Web application** OAuth client.

## Step-by-Step Instructions

### 1. Go to Google Cloud Console
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one if needed)

### 2. Navigate to OAuth Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** at the top
3. Select **OAuth client ID**

### 3. Configure OAuth Consent Screen (if not done)
If prompted, you'll need to configure the OAuth consent screen first:
1. Choose **External** (unless you have a Google Workspace)
2. Fill in:
   - App name: `MerchTrader` (or your app name)
   - User support email: Your email
   - Developer contact email: Your email
3. Click **Save and Continue**
4. Skip scopes for now (click **Save and Continue**)
5. Add test users if needed (click **Save and Continue**)
6. Review and go back to dashboard

### 4. Create Web Application OAuth Client
1. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
2. Select **Application type**: **Web application**
3. Give it a name: `MerchTrader Web Client` (or any name)
4. **Authorized JavaScript origins** - Click **+ ADD URI** and add:
   ```
   https://www.merchtrader.org
   https://app.merchtrader.org
   http://localhost:8081
   ```
5. **Authorized redirect URIs** - Click **+ ADD URI** and add:
   ```
   https://www.merchtrader.org/auth/google
   https://app.merchtrader.org/auth/google
   http://localhost:8081/auth/google
   ```
6. Click **CREATE**
7. **Copy the Client ID** - It will look like: `587879962618-xxxxx.apps.googleusercontent.com`

### 5. Update Environment Variables

#### In Vercel (for frontend):
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Find `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
4. Update it with the **Web Client ID** you just created
5. Save

#### In Railway (for backend - optional but recommended):
1. Go to your Railway project dashboard
2. Navigate to **Variables**
3. Find `GOOGLE_CLIENT_ID`
4. Update it with the **Web Client ID** (same as frontend)
5. Save

### 6. Redeploy
- Vercel will auto-deploy when you push to git
- Railway will auto-deploy when you push to git

## Important Notes

- **Keep your Android Client ID** for mobile apps - don't delete it
- **Use the Web Client ID** for web sign-in (`EXPO_PUBLIC_GOOGLE_CLIENT_ID` in Vercel)
- The Web Client ID should start with `587879962618-` (same project)
- Both clients can coexist - they're for different platforms

## Verification

After setup, test the Google sign-in:
1. Go to your production site
2. Click "Continue with Google"
3. It should redirect to Google's sign-in page
4. After signing in, it should redirect back to your site

## Troubleshooting

### "redirect_uri_mismatch" error
- Double-check that the redirect URI in Google Cloud Console matches exactly: `https://www.merchtrader.org/auth/google`
- Make sure there are no trailing slashes
- Wait a few minutes after saving - changes can take time to propagate

### "Invalid client" error
- Verify you're using the Web Client ID, not the Android Client ID
- Check that the Client ID is correctly set in Vercel environment variables

