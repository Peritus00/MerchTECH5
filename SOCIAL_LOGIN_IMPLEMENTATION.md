# Social Login (Google & Apple) Implementation Summary

## Overview
This document summarizes the implementation of Google Sign-In and Apple Sign-In functionality for the MerchTech app. Users can now sign up/sign in with Google or Apple, and link/unlink these providers from their profile settings.

## What Was Implemented

### 1. Database Schema Updates ✅
- **Migration File**: `database/migrations/026_add_social_login_fields.sql`
- Added `google_id` and `apple_id` columns to users table (with unique constraints)
- Added `provider_metadata` JSONB column for storing OAuth provider data
- Made `password_hash` nullable (social login users don't have passwords)
- Added indexes for faster lookups

### 2. Backend Implementation ✅

#### Social Auth Service (`services/Server/socialAuthService.js`)
- `verifyGoogleToken()` - Verifies Google ID tokens using google-auth-library
- `verifyAppleToken()` - Verifies Apple identity tokens using JWKS
- `findOrCreateSocialUser()` - Finds existing user or creates new one by provider ID/email
- `linkSocialProvider()` - Links a provider to an existing user account
- `unlinkSocialProvider()` - Unlinks a provider (with safety checks)

#### API Endpoints (`services/Server/main.js`)
- `POST /api/auth/google` - Google sign-in/sign-up endpoint
- `POST /api/auth/apple` - Apple sign-in/sign-up endpoint
- `POST /api/profile/link-google` - Link Google account to existing user
- `POST /api/profile/link-apple` - Link Apple account to existing user
- `POST /api/profile/unlink-google` - Unlink Google account
- `POST /api/profile/unlink-apple` - Unlink Apple account

#### User Transformation
- Added `transformUser()` helper function to convert database users to frontend format
- Includes `googleId` and `appleId` fields in user objects

### 3. Mobile Implementation ✅

#### Hooks
- `hooks/useGoogleSignIn.ts` - Google sign-in hook using expo-auth-session
- `hooks/useAppleSignIn.ts` - Apple sign-in hook using expo-apple-authentication

#### Auth Service Updates (`services/authService.ts`)
- Added `socialLogin()` method to handle social authentication

#### Auth Context Updates (`contexts/AuthContext.tsx`)
- Added `socialLogin()` method to context interface
- Integrated social login flows into global auth state

#### API Service Updates (`services/api.ts`)
- Added `googleSignIn()` and `appleSignIn()` to `authAPI`
- Added `profileAPI` with link/unlink methods for Google and Apple

#### Profile Screen Updates (`app/(tabs)/settings/profile.tsx`)
- Added "Connected Accounts" section showing Google and Apple status
- Added Link/Unlink buttons for each provider
- Integrated with hooks for seamless account management

#### App Configuration (`app.json`)
- Added `expo-apple-authentication` plugin
- Enabled Apple Sign-In capability for iOS
- Added Google Services file reference for Android

### 4. Type Updates ✅
- Updated `User` type (`types/index.ts`) to include `googleId` and `appleId` fields

## Configuration Required

### Environment Variables

#### Backend (.env)
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here

# Apple OAuth
APPLE_CLIENT_ID=your_apple_service_id_here
APPLE_TEAM_ID=your_apple_team_id_here
```

#### Mobile (app.json / environment)
```bash
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
```

### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials:
   - Application type: Web application (for backend)
   - Authorized redirect URIs: Your backend URL + `/api/auth/google/callback`
   - Also create iOS/Android OAuth clients if needed
5. Copy the Client ID to `GOOGLE_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_CLIENT_ID`

### Apple Developer Setup

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Navigate to Certificates, Identifiers & Profiles
3. Enable "Sign in with Apple" capability for your app identifier
4. Create a Service ID for Sign in with Apple:
   - Configure domains and redirect URLs
   - Note the Service ID (this is your `APPLE_CLIENT_ID`)
5. Update `app.json` with your Apple Team ID:
   ```json
   {
     "plugins": [
       [
         "expo-apple-authentication",
         {
           "appleTeamId": "YOUR_APPLE_TEAM_ID"
         }
       ]
     ]
   }
   ```

### Database Migration

Run the migration to add social login fields:
```bash
# Connect to your Neon database and run:
psql $DATABASE_URL -f database/migrations/026_add_social_login_fields.sql
```

Or apply it through your database management tool.

## Testing Checklist

### Google Sign-In
- [ ] First-time Google sign-up creates new user account
- [ ] Returning Google sign-in logs in existing user
- [ ] Linking Google account to existing email/password account works
- [ ] Unlinking Google account works (if other auth methods exist)
- [ ] Cannot unlink last authentication method

### Apple Sign-In
- [ ] First-time Apple sign-up creates new user account
- [ ] Returning Apple sign-in logs in existing user
- [ ] Linking Apple account to existing email/password account works
- [ ] Unlinking Apple account works (if other auth methods exist)
- [ ] Cannot unlink last authentication method

### Edge Cases
- [ ] User with existing email tries to sign in with Google/Apple (should link automatically)
- [ ] User tries to link provider already linked to another account (should fail)
- [ ] User tries to unlink last auth method (should fail with helpful message)
- [ ] Social login user tries to use email/password login (should show helpful error)

## Security Considerations

1. **Token Verification**: All tokens are verified server-side using official Google/Apple libraries
2. **Nonce Validation**: Apple tokens use nonce for replay attack prevention
3. **Account Linking**: Prevents linking providers already associated with other accounts
4. **Last Auth Method**: Prevents users from unlinking their last authentication method
5. **Email Verification**: Social login emails are marked as verified if provider confirms them

## Known Limitations

1. **Apple Sign-In**: Only available on iOS devices (as per Apple's requirements)
2. **Google Sign-In**: Requires proper OAuth configuration in Google Cloud Console
3. **Email on Apple**: Apple may not provide email on subsequent sign-ins (only on first authorization)

## Next Steps

1. Configure Google OAuth credentials in Google Cloud Console
2. Configure Apple Sign-In in Apple Developer Portal
3. Update environment variables with OAuth client IDs
4. Run database migration
5. Test on real iOS and Android devices
6. Update privacy policy and terms of service to mention Google/Apple sign-in usage

## Files Modified/Created

### Created
- `database/migrations/026_add_social_login_fields.sql`
- `services/Server/socialAuthService.js`
- `hooks/useGoogleSignIn.ts`
- `hooks/useAppleSignIn.ts`
- `SOCIAL_LOGIN_IMPLEMENTATION.md`

### Modified
- `services/Server/main.js` - Added social auth endpoints
- `services/authService.ts` - Added socialLogin method
- `contexts/AuthContext.tsx` - Added socialLogin to context
- `services/api.ts` - Added social auth API methods
- `app/(tabs)/settings/profile.tsx` - Added connected accounts UI
- `app.json` - Added Apple Sign-In plugin and config
- `types/index.ts` - Added googleId and appleId to User type
- `package.json` - Added dependencies (google-auth-library, jwks-rsa, expo-auth-session, expo-apple-authentication, expo-crypto)

## Dependencies Added

```json
{
  "google-auth-library": "^latest",
  "jwks-rsa": "^latest",
  "expo-auth-session": "^7.0.9",
  "expo-apple-authentication": "^8.0.7",
  "expo-crypto": "^15.0.7"
}
```

## Support

For issues or questions:
1. Check that all environment variables are set correctly
2. Verify OAuth credentials are properly configured
3. Ensure database migration has been run
4. Check server logs for detailed error messages

