# Apple Sign-In Button Debug Guide

## Issue
The Apple Sign-In button appears on the web login page but does nothing when clicked.

## Changes Made
1. Added comprehensive console logging throughout the Apple Sign-In flow
2. Changed error handling to use `window.alert()` on web instead of `Alert.alert()` (which may not work on web)
3. Removed unnecessary Apple SDK loading check since we use manual redirect flow
4. Added detailed environment variable logging

## Debugging Steps

### 1. Check Browser Console
Open Chrome DevTools (F12) and check the Console tab when clicking the Apple Sign-In button. Look for these log messages:

**Expected logs when button is clicked:**
```
🍎 Apple Sign-In button clicked
🍎 Calling appleSignIn()...
🌐 Using Apple Sign-In OAuth redirect flow for web
🍎 Apple Client ID check: { hasClientId: true/false, hasServiceId: true/false, resolvedClientId: "..." }
🔄 Current origin: https://www.merchtrader.org
🔄 Using redirect URI: https://www.merchtrader.org/auth/apple
🔄 Apple Client ID: com.peritus00.merchtech.signin
🔄 Apple Auth URL: https://appleid.apple.com/auth/authorize?...
🔄 Redirecting to Apple Sign-In...
```

### 2. Check for Errors
Look for any error messages in the console:
- `❌ Apple OAuth not configured` - Environment variables missing
- `❌ Apple Sign-In error caught:` - JavaScript error occurred
- Any red error messages

### 3. Verify Environment Variables
In the browser console, run:
```javascript
console.log('EXPO_PUBLIC_APPLE_CLIENT_ID:', process.env.EXPO_PUBLIC_APPLE_CLIENT_ID);
console.log('EXPO_PUBLIC_APPLE_SERVICE_ID:', process.env.EXPO_PUBLIC_APPLE_SERVICE_ID);
```

**Expected:** Should show `com.peritus00.merchtech.signin`

**If undefined:** The environment variables are not being injected into the web build. Check:
- Vercel environment variables are set
- Web build includes these variables
- Variables are prefixed with `EXPO_PUBLIC_`

### 4. Check Button Click Handler
Verify the button's `onPress` handler is being called:
- Look for `🍎 Apple Sign-In button clicked` in console
- If this doesn't appear, the button click isn't being registered

### 5. Check Network Tab
After clicking the button, check the Network tab:
- Should see a redirect to `https://appleid.apple.com/auth/authorize?...`
- If no network activity, the redirect isn't happening

## Common Issues and Solutions

### Issue 1: Environment Variables Not Available
**Symptoms:** Console shows `hasClientId: false` or `resolvedClientId: undefined`

**Solution:**
1. Verify Vercel environment variables are set:
   - `EXPO_PUBLIC_APPLE_CLIENT_ID=com.peritus00.merchtech.signin`
   - `EXPO_PUBLIC_APPLE_SERVICE_ID=com.peritus00.merchtech.signin`
2. Rebuild and redeploy the web frontend
3. Clear browser cache and hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Issue 2: Button Click Not Registered
**Symptoms:** No console logs appear when clicking button

**Possible Causes:**
- Button is disabled (check `disabled` prop)
- Another element is overlaying the button
- JavaScript error preventing handler execution

**Solution:**
- Check browser console for JavaScript errors
- Inspect the button element in DevTools
- Verify button is not disabled

### Issue 3: Redirect Not Happening
**Symptoms:** Console shows redirect URL but page doesn't navigate

**Possible Causes:**
- Popup blocker preventing navigation
- JavaScript error after redirect attempt
- CORS or security policy blocking redirect

**Solution:**
- Check browser console for errors
- Try in incognito/private window
- Check browser security settings

### Issue 4: Apple OAuth Error
**Symptoms:** Redirects to Apple but shows error page

**Check:**
- Apple Service ID return URL is configured: `https://www.merchtrader.org/auth/apple`
- Domain `www.merchtrader.org` is added to Apple Service ID
- Client ID matches: `com.peritus00.merchtech.signin`

## Testing Checklist

After deployment, test the following:

- [ ] Open `https://www.merchtrader.org/auth/login` in incognito mode
- [ ] Open Chrome DevTools Console (F12)
- [ ] Click "Continue with Apple" button
- [ ] Verify console shows: `🍎 Apple Sign-In button clicked`
- [ ] Verify console shows environment variable check
- [ ] Verify console shows redirect URL
- [ ] Verify browser redirects to Apple Sign-In page
- [ ] Complete Apple authentication
- [ ] Verify redirect back to `/auth/apple` callback page
- [ ] Verify successful login and redirect to main app

## Next Steps

1. Deploy the updated code (already pushed)
2. Wait for deployment to complete
3. Test on production site with DevTools open
4. Share console logs if issue persists
5. Check Vercel environment variables if variables are undefined

