# Apple Sign-In Web Implementation

## Overview
Apple Sign-In has been successfully implemented for web browsers, matching the existing Google Sign-In web functionality. Users can now sign in with Apple on both iOS devices and web browsers.

## Changes Made

### 1. Updated `hooks/useAppleSignIn.ts`
- **Added web support**: Detects web platform and uses Apple's OAuth redirect flow
- **Script loading**: Automatically loads Apple Sign-In JavaScript SDK for web
- **Redirect flow**: Uses Apple's OAuth authorization endpoint with query response mode
- **Nonce handling**: Generates and stores nonce in sessionStorage for security
- **Platform detection**: Maintains iOS native support while adding web support

### 2. Created `app/auth/apple.tsx`
- **Callback handler**: Processes Apple OAuth redirects (similar to Google callback)
- **Token extraction**: Handles ID tokens from URL parameters and hash fragments
- **Error handling**: Provides user-friendly error messages
- **Nonce verification**: Verifies nonce from sessionStorage for security

### 3. Updated Login Page (`app/auth/login.tsx`)
- **Platform condition**: Changed from `Platform.OS === 'ios'` to `Platform.OS === 'ios' || Platform.OS === 'web'`
- **Button visibility**: Apple Sign-In button now appears on both iOS and web

### 4. Updated Register Page (`app/auth/register.tsx`)
- **Platform condition**: Same update as login page
- **Consistent UX**: Users can sign up with Apple on web as well

### 5. Environment Variables
- **Added to `env.example`**: 
  - `EXPO_PUBLIC_APPLE_CLIENT_ID`
  - `EXPO_PUBLIC_APPLE_SERVICE_ID`
- **Updated `ENV_VARIABLES_FOR_PRODUCTION.txt`**: Added frontend Apple variables

## Configuration Required

### 1. Environment Variables

Add these to your `.env` file for local development:

```bash
# Apple Sign-In - Service ID for web and mobile
EXPO_PUBLIC_APPLE_CLIENT_ID=com.peritus00.merchtech.signin
EXPO_PUBLIC_APPLE_SERVICE_ID=com.peritus00.merchtech.signin
```

### 2. Production Environment (Vercel/Railway)

Add these environment variables to your production deployment:

**For Vercel (Frontend):**
- `EXPO_PUBLIC_APPLE_CLIENT_ID=com.peritus00.merchtech.signin`
- `EXPO_PUBLIC_APPLE_SERVICE_ID=com.peritus00.merchtech.signin`

**For Railway (Backend):**
- `APPLE_CLIENT_ID=com.peritus00.merchtech.signin` (already configured)
- `APPLE_SERVICE_ID=com.peritus00.merchtech.signin` (already configured)
- `APPLE_TEAM_ID=4F996CU4LJ` (already configured)

### 3. Apple Developer Portal Configuration

Ensure your Apple Service ID is configured with:

1. **Return URLs** (in Apple Developer Portal):
   - `https://www.merchtrader.org/auth/apple` (production)
   - `http://localhost:8081/auth/apple` (local development)
   - `http://localhost:3000/auth/apple` (if using local web server)

2. **Domains**:
   - `www.merchtrader.org` (production)
   - `merchtrader.org` (if using non-www)
   - `localhost` (for development)

## How It Works

### Web Flow:
1. User clicks "Continue with Apple" button
2. Apple Sign-In JavaScript SDK loads (if not already loaded)
3. User is redirected to Apple's authorization page
4. User authenticates with Apple
5. Apple redirects back to `/auth/apple` with ID token
6. Callback handler processes the token
7. User is logged in and redirected to main app

### iOS Flow (unchanged):
1. User clicks "Continue with Apple" button
2. Native Apple Authentication modal appears
3. User authenticates with Face ID/Touch ID
4. Identity token is received directly
5. User is logged in and redirected to main app

## Testing

### Local Development:
1. Ensure environment variables are set in `.env`
2. Start the development server: `npm start` or `expo start --web`
3. Navigate to login/register page
4. Click "Continue with Apple" button
5. Complete Apple authentication flow

### Production:
1. Verify environment variables are set in Vercel/Railway
2. Ensure Apple Service ID return URLs are configured
3. Test on production domain

## Notes

- **Response Mode**: Uses `response_mode=query` to receive ID token via URL parameters (similar to Google)
- **Nonce Security**: Generates random nonce for each sign-in attempt and verifies it on callback
- **Backend Compatibility**: Uses existing `/api/auth/apple` endpoint (no backend changes needed)
- **Error Handling**: Comprehensive error messages for common failure scenarios
- **Platform Detection**: Automatically uses appropriate method (native iOS vs web OAuth)

## Troubleshooting

### Apple Sign-In button doesn't appear on web:
- Check that `EXPO_PUBLIC_APPLE_CLIENT_ID` is set in environment variables
- Verify you're accessing the web version (not mobile app)

### Redirect fails or shows error:
- Verify return URLs are configured in Apple Developer Portal
- Check that the domain matches exactly (including www/non-www)
- Ensure `EXPO_PUBLIC_APPLE_CLIENT_ID` matches your Apple Service ID

### "Apple sign-in service failed to load":
- Check browser console for script loading errors
- Verify network connectivity
- Try refreshing the page

## Related Files

- `hooks/useAppleSignIn.ts` - Main hook implementation
- `app/auth/apple.tsx` - Callback handler
- `app/auth/login.tsx` - Login page
- `app/auth/register.tsx` - Register page
- `services/Server/main.js` - Backend Apple auth endpoint (already exists)
- `services/Server/socialAuthService.js` - Apple token verification (already exists)

