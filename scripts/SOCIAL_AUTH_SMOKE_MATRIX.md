# Social Auth Smoke Test Matrix

Run this checklist before release and after any auth-related changes.

## Android Google

| Scenario | Steps | Expected |
|----------|-------|----------|
| Success | Tap "Continue with Google", pick account | Lands on dashboard, user logged in |
| Cancel | Tap "Continue with Google", tap back/cancel | Returns to login, no error |
| Invalid token | (Manual: send bad token to API) | 401, clear error message |

## iOS Apple Native

| Scenario | Steps | Expected |
|----------|-------|----------|
| Success | Tap "Continue with Apple", complete flow | Lands on dashboard, user logged in |
| Cancel | Tap "Continue with Apple", cancel | Returns to login, no error |
| Nonce mismatch | (Backend test) | 401, clear error |

## Web Google

| Scenario | Steps | Expected |
|----------|-------|----------|
| Success | Click "Continue with Google", pick account | Redirects to /auth/google, then dashboard |
| Callback route | Visit /auth/google directly (no token) | Shows "No authentication token" or similar, not "This screen does not exist" |
| Cancel | Click "Continue with Google", close popup/cancel | Returns to login |

## Web Apple

| Scenario | Steps | Expected |
|----------|-------|----------|
| Success | Click "Continue with Apple", complete flow | Redirects to /auth/apple, then dashboard |
| Callback route | Visit /auth/apple directly (no code) | Shows error or "No token", not "This screen does not exist" |
| State mismatch | (Backend test) | Redirect to /auth/apple?error=... |

## Profile Linking

| Scenario | Steps | Expected |
|----------|-------|----------|
| Link Google (native) | Profile > Link Google, pick account | "Google account linked successfully" |
| Link Google (web) | Profile > Link Google, complete OAuth | Redirects back, "Google account linked" |
| Link Apple (iOS) | Profile > Link Apple, complete flow | "Apple account linked successfully" |
| Unlink | Profile > Unlink | "Unlinked successfully" |

## Deploy Gate (pre-release)

```bash
node scripts/verify-social-auth.js
```

- GOOGLE_CLIENT_ID set
- Health endpoint reports socialAuth.google
- /auth/google and /auth/apple return 200 (not 404)
