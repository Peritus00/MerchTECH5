# Password Reset Link 404 Fix

## Issue
Password reset emails are generating links that point to `https://app.merchtech.net/auth/reset-password`, but clicking these links results in a 404 "DEPLOYMENT_NOT_FOUND" error.

## Root Cause
The production server's `FRONTEND_URL` environment variable is set to `https://app.merchtech.net`, but the web app is actually deployed at `https://www.merchtrader.org` (as configured in `vercel.json`).

## Solution

### 1. Update Railway Environment Variable
The `FRONTEND_URL` environment variable in Railway must be set to match the actual deployed domain:

```
FRONTEND_URL=https://www.merchtrader.org
```

### 2. Code Fix Applied
Updated the default fallback URL in `services/Server/main.js` to use `https://www.merchtrader.org` instead of `https://app.merchtrader.org` to match the production deployment.

### 3. Verify Deployment
Ensure that `https://www.merchtrader.org` is properly configured in Vercel and that the web app is deployed there.

## Testing
After updating the environment variable:
1. Request a new password reset email
2. Verify the link points to `https://www.merchtrader.org/auth/reset-password?token=...`
3. Click the link and confirm it loads the reset password page

## Notes
- The reset password route exists at `app/auth/reset-password.tsx`
- The route should work once the correct domain is used
- The `vercel.json` catch-all route (`"src": "/(.*)", "dest": "/index.html"`) handles all routes including `/auth/reset-password`
- Also fixed email verification endpoints to use the same FRONTEND_URL configuration

## Status
✅ **COMPLETED**: Railway environment variable updated to `https://www.merchtrader.org`
✅ **COMPLETED**: Code updated to use correct default domain
✅ **COMPLETED**: Email verification endpoints also fixed for consistency

