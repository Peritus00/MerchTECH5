# Apple Sign-In Web - OAuth Code Flow Implementation

## Overview
Implemented server-side OAuth authorization code flow for Apple Sign-In on web, replacing the unsupported `id_token` response type with the standard `code` exchange flow.

## Changes Made

### 1. Environment Variables
**Files Updated:**
- `env.example` - Added `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` placeholders
- `ENV_VARIABLES_FOR_PRODUCTION.txt` - Added documentation for new variables

**New Variables Required:**
- `APPLE_KEY_ID` - Key ID from Apple Developer Portal (Keys > Sign in with Apple key)
- `APPLE_PRIVATE_KEY` - Private key (.p8 file content) from Apple Developer Portal

**Existing Variables (Already Configured):**
- `APPLE_CLIENT_ID=com.peritus00.merchtech.signin`
- `APPLE_SERVICE_ID=com.peritus00.merchtech.signin`
- `APPLE_TEAM_ID=4F996CU4LJ`

### 2. Frontend Changes

#### `hooks/useAppleSignIn.ts`
- Changed web OAuth flow from `response_type=id_token` to `response_type=code`
- Removed `nonce` parameter from OAuth URL (not needed for code flow)
- Kept `state` parameter for CSRF protection (uses nonce value)
- Maintained iOS native flow unchanged (still uses `id_token`)

#### `app/auth/apple.tsx`
- Updated callback handler to prioritize `code` parameter (web flow)
- Added `socialLoginWithCode` method call for web code exchange
- Maintained backward compatibility with `id_token` flow (iOS native)
- Added state verification for CSRF protection
- Enhanced error handling and logging

#### `services/api.ts`
- Added `appleSignInWeb(code: string, nonce?: string)` method
- Calls new `/api/auth/apple/web` endpoint

#### `services/authService.ts`
- Added `socialLoginWithCode(provider: 'apple', code: string, nonce?: string)` method
- Handles web OAuth code flow separately from identity token flow

#### `contexts/AuthContext.tsx`
- Added `socialLoginWithCode` to AuthContext interface and implementation
- Exposed new method for callback handler use

### 3. Backend Changes

#### `services/Server/main.js`
- Added `generateAppleClientSecret()` helper function
  - Creates JWT client secret using ES256 algorithm
  - Uses Team ID, Client ID, Key ID, and Private Key
  - Expires in 6 months (Apple's maximum)
  
- Added `POST /api/auth/apple/web` endpoint
  - Accepts `{ code, nonce }` from frontend
  - Generates client secret JWT
  - Exchanges authorization code for tokens via Apple's token endpoint
  - Extracts `id_token` from Apple's response
  - Verifies token using existing `socialAuthService.verifyAppleToken()`
  - Creates/finds user and issues JWT (same as iOS flow)
  - Returns `{ user, token, provider: 'apple' }`

- Maintained existing `POST /api/auth/apple` endpoint unchanged (for iOS native)

## How It Works

### Web Flow:
1. User clicks "Continue with Apple" button
2. Frontend redirects to Apple with `response_type=code`
3. User authenticates with Apple
4. Apple redirects back to `/auth/apple` with `code` and `state` parameters
5. Callback handler extracts `code` and verifies `state` matches stored nonce
6. Frontend calls `socialLoginWithCode('apple', code, nonce)`
7. Backend exchanges code for `id_token` using Apple's token endpoint
8. Backend verifies `id_token` and creates/finds user
9. User is logged in and redirected to main app

### iOS Flow (Unchanged):
1. User clicks "Continue with Apple" button
2. Native Apple Authentication modal appears
3. User authenticates with Face ID/Touch ID
4. Identity token is received directly
5. Frontend calls `socialLogin('apple', identityToken, nonce)`
6. Backend verifies token and creates/finds user
7. User is logged in

## Configuration Required

### Apple Developer Portal
1. **Service ID Configuration:**
   - Service ID: `com.peritus00.merchtech.signin`
   - Ensure "Sign in with Apple" capability is enabled
   - Add return URL: `https://www.merchtrader.org/auth/apple`

2. **Key Configuration:**
   - Create or use existing "Sign in with Apple" key
   - Download the `.p8` private key file
   - Note the Key ID

### Railway Environment Variables
Add these to your Railway backend environment:
- `APPLE_KEY_ID` - The Key ID from Apple Developer Portal
- `APPLE_PRIVATE_KEY` - The full content of the `.p8` file (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)

**Important:** The private key should be stored as a multi-line environment variable. Railway supports this, but you may need to:
- Copy the entire `.p8` file content including headers
- Paste it as a single environment variable value
- Ensure line breaks are preserved

## Testing Checklist

### Before Deployment
- [ ] Verify `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` are set in Railway
- [ ] Verify Service ID return URL is configured in Apple Developer Portal
- [ ] Test backend endpoint locally if possible (requires valid Apple credentials)

### After Deployment
- [ ] Click "Continue with Apple" on web login page
- [ ] Verify redirect to Apple Sign-In page (no `invalid_request` error)
- [ ] Complete Apple authentication
- [ ] Verify redirect back to `/auth/apple` callback page
- [ ] Verify successful login and redirect to main app
- [ ] Test creating new user account with Apple
- [ ] Test signing in with existing Apple account
- [ ] Verify iOS native Apple Sign-In still works (regression test)

## Troubleshooting

### "Invalid response type" Error
- **Fixed:** Changed from `response_type=id_token` to `response_type=code`

### "Apple OAuth configuration incomplete" Error
- **Cause:** Missing `APPLE_KEY_ID` or `APPLE_PRIVATE_KEY` environment variables
- **Solution:** Add both variables to Railway environment

### "Failed to exchange authorization code" Error
- **Possible Causes:**
  - Invalid or expired authorization code
  - Incorrect redirect URI
  - Invalid client secret (check Key ID and Private Key)
  - Service ID not properly configured
- **Solution:** Check Railway logs for detailed error messages from Apple

### Code Exchange Returns 401
- **Check:**
  - Private key format (must include PEM headers)
  - Key ID matches the key used
  - Team ID is correct
  - Client ID matches Service ID
  - Authorization code hasn't expired (codes expire quickly)

## Security Notes

1. **CSRF Protection:** State parameter is verified against stored nonce
2. **Token Verification:** All tokens are verified using Apple's public keys
3. **Nonce Validation:** Nonce is verified when provided
4. **Secure Storage:** Private key stored only in Railway environment variables (never committed)

## Files Modified
- `env.example`
- `ENV_VARIABLES_FOR_PRODUCTION.txt`
- `hooks/useAppleSignIn.ts`
- `app/auth/apple.tsx`
- `services/api.ts`
- `services/authService.ts`
- `contexts/AuthContext.tsx`
- `services/Server/main.js`

## Next Steps
1. Add `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` to Railway environment
2. Deploy changes to production
3. Test end-to-end Apple Sign-In flow
4. Monitor logs for any errors
5. Verify iOS native flow still works

