# Vercel Environment Variables Checklist

## Required Environment Variables for Vercel (Frontend)

Vercel is the **frontend** deployment, so it needs:

### ✅ Required Variables

1. **`EXPO_PUBLIC_NODE_ENV`** = `production`
   - This tells the frontend to use production API URL
   - If not set, it defaults to development mode

2. **`EXPO_PUBLIC_API_URL`** = `https://merchtech5-production.up.railway.app/api`
   - This is the backend API URL
   - Only needed if `EXPO_PUBLIC_NODE_ENV` is not set to "production"
   - If `NODE_ENV=production`, the code hardcodes the Railway URL

3. **`EXPO_PUBLIC_FRONTEND_URL`** = `https://www.merchtrader.org`
   - Frontend URL for redirects and links

4. **`EXPO_PUBLIC_GOOGLE_CLIENT_ID`** = `587879962618-hrknoc2i6g1jecittiro88qceavhj4ea.apps.googleusercontent.com`
   - Google OAuth client ID for web sign-in

### ❌ NOT Needed in Vercel

- `DATABASE_URL` - This is ONLY for the backend (Railway)
- `JWT_SECRET` - Backend only
- `BREVO_SMTP_KEY` - Backend only
- Any other backend secrets

## How to Verify

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Check that `EXPO_PUBLIC_NODE_ENV` is set to `production`
3. Verify `EXPO_PUBLIC_API_URL` points to Railway backend (optional if NODE_ENV is production)
4. After updating, Vercel will auto-redeploy

## Current Configuration

Based on `vercel.json`, these are set:
- `NODE_ENV`: `production`
- `EXPO_PUBLIC_NODE_ENV`: `production`
- `EXPO_PUBLIC_API_URL`: `https://merchtech5-production.up.railway.app/api`
- `EXPO_PUBLIC_FRONTEND_URL`: `https://www.merchtrader.org`

## Testing After Fix

1. Wait for Vercel to redeploy (usually 1-2 minutes)
2. Try logging in with `perrie.benton@gmail.com` / `Kerrie321$`
3. Check browser console for any API connection errors
4. Verify the login request goes to `https://merchtech5-production.up.railway.app/api/auth/login`

