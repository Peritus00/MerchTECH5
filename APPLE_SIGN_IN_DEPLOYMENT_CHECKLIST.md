# Apple Sign-In Deployment Checklist

## Current Status
✅ Code changes committed and pushed (commit `b88edac`)
✅ Backend endpoint `/api/auth/apple/web` implemented
✅ Backend callback endpoint `/api/auth/apple/callback` implemented (for form_post)
✅ Frontend updated to use `response_type=code` and `response_mode=form_post`
⏳ Waiting for Vercel frontend rebuild
⏳ Waiting for Railway backend deployment
⚠️ **ACTION REQUIRED:** Add `https://www.merchtrader.org/api/auth/apple/callback` to Apple Service ID Return URLs

## Immediate Actions Required

### 1. Verify Railway Environment Variables
Check that these are set in Railway backend:
- ✅ `APPLE_TEAM_ID=4F996CU4LJ` (already configured)
- ✅ `APPLE_CLIENT_ID=com.peritus00.merchtech.signin` (already configured)
- ✅ `APPLE_SERVICE_ID=com.peritus00.merchtech.signin` (already configured)
- ⚠️ `APPLE_KEY_ID=V29A8YNPQ8` (from your screenshot - **NEEDS TO BE ADDED**)
- ⚠️ `APPLE_PRIVATE_KEY=<your .p8 file content>` (**NEEDS TO BE ADDED**)

### 2. Add Missing Environment Variables to Railway

**APPLE_KEY_ID:**
```
V29A8YNPQ8
```

**APPLE_PRIVATE_KEY:**
1. Download the `.p8` file from Apple Developer Portal (if you haven't already)
2. Open the `.p8` file in a text editor
3. Copy the ENTIRE contents including:
   ```
   -----BEGIN PRIVATE KEY-----
   <key content here>
   -----END PRIVATE KEY-----
   ```
4. Paste into Railway as `APPLE_PRIVATE_KEY` environment variable
5. **Important:** Railway supports multi-line environment variables - paste the entire key including headers

### 3. Wait for Deployments

**Railway (Backend):**
- Should auto-deploy after git push (already done)
- Check Railway dashboard to confirm deployment completed
- Verify environment variables are loaded

**Vercel (Frontend):**
- Should auto-deploy after git push
- Check Vercel dashboard to confirm build completed
- This may take 2-5 minutes

### 4. Clear Browser Cache

After deployments complete:
1. Open browser in **Incognito/Private mode** (or clear cache)
2. Go to `https://www.merchtrader.org/auth/login`
3. Open DevTools Console (F12)
4. Click "Continue with Apple"
5. Check console logs - should see:
   ```
   🔄 Apple Auth URL: https://appleid.apple.com/auth/authorize?client_id=...&response_type=code...
   ```

### 5. Verify Apple Service ID Configuration

In Apple Developer Portal:
1. Go to **Certificates, Identifiers & Profiles** > **Identifiers**
2. Select Service ID: `com.peritus00.merchtech.signin`
3. Under "Sign in with Apple", verify:
   - ✅ "Sign in with Apple" is enabled
   - ✅ Return URL: `https://www.merchtrader.org/api/auth/apple/callback` is listed (NEW - required for form_post)
   - ✅ Domain: `www.merchtrader.org` is configured
   
**IMPORTANT:** You must add the new callback URL `https://www.merchtrader.org/api/auth/apple/callback` to your Apple Service ID configuration. This is the backend endpoint that receives the form_post from Apple.

## Troubleshooting

### Still Getting "Invalid response type" Error

**Check 1: Verify Frontend is Using New Code**
- Open DevTools Console
- Click Apple Sign-In button
- Look for log: `🔄 Apple Auth URL: ...`
- Check the URL - it should contain `response_type=code` (NOT `id_token`)

**Check 2: Verify Backend Environment Variables**
- Check Railway logs for: `Apple OAuth configuration incomplete`
- If you see this error, `APPLE_KEY_ID` or `APPLE_PRIVATE_KEY` is missing

**Check 3: Hard Refresh Browser**
- Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Or use Incognito/Private window

**Check 4: Check Vercel Build Status**
- Go to Vercel dashboard
- Check if latest build completed successfully
- If build failed, check build logs

### Backend Error: "Apple OAuth configuration incomplete"

This means `APPLE_KEY_ID` or `APPLE_PRIVATE_KEY` is missing in Railway:
1. Go to Railway dashboard
2. Select your backend service
3. Go to "Variables" tab
4. Add `APPLE_KEY_ID=V29A8YNPQ8`
5. Add `APPLE_PRIVATE_KEY=<paste full .p8 content>`
6. Redeploy (or wait for auto-redeploy)

### Code Exchange Fails (401 from Apple)

Possible causes:
1. **Invalid Private Key Format**
   - Must include `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
   - Must preserve line breaks
   - No extra spaces or characters

2. **Wrong Key ID**
   - Verify `APPLE_KEY_ID` matches the Key ID from Apple Developer Portal
   - Should be `V29A8YNPQ8` based on your screenshot

3. **Expired Authorization Code**
   - Authorization codes expire quickly (usually within minutes)
   - Try clicking the button again to get a fresh code

4. **Redirect URI Mismatch**
   - Must exactly match: `https://www.merchtrader.org/auth/apple`
   - Check Apple Developer Portal Service ID configuration

## Testing After Deployment

1. **Wait for deployments to complete** (check Vercel and Railway dashboards)
2. **Open incognito browser window**
3. **Navigate to:** `https://www.merchtrader.org/auth/login`
4. **Open DevTools Console** (F12)
5. **Click "Continue with Apple"**
6. **Expected behavior:**
   - Should redirect to Apple Sign-In page (no error)
   - After authentication, redirect back to `/auth/apple`
   - Should see "Completing sign-in..." message
   - Should redirect to main app after successful login

## Next Steps

Once working:
- Test creating new user account
- Test signing in with existing Apple account
- Verify iOS native Apple Sign-In still works (regression test)
- Monitor Railway logs for any errors

