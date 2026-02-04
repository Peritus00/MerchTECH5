# Elastic Beanstalk Deployment Guide

## Overview
This guide explains how to create a backend-only zip file for Elastic Beanstalk deployment. The backend runs the Express server from `services/Server/main.js` and does NOT include the Expo mobile app.

## What Changed
- Added `Procfile` to tell EB to run `npm run server:prod` instead of `npm start` (which runs Expo)
- This keeps local development (`npm start`) working for Expo while production uses the backend

## Creating the EB Deployment Zip

### Step 1: Create a clean directory for the zip
```bash
mkdir eb-deploy
cd eb-deploy
```

### Step 2: Copy required files and folders

**Required files (root level):**
- `package.json` - Dependencies and scripts
- `package-lock.json` - Locked dependency versions
- `Procfile` - Tells EB to run the backend server
- `.env.production` (optional, if you want to include default env vars - EB will override with environment variables)

**Required folders:**
- `services/` - Contains the entire backend server code
  - `services/Server/` - Main Express server
  - `services/Server/config/` - Server configuration
  - `services/Server/middleware/` - Express middleware
  - `services/Server/uploads/` - Upload directory (will be created if missing)

**DO NOT include:**
- `app/` - Expo mobile app (not needed for backend)
- `assets/` - Mobile app assets
- `attached_assets/` - Mobile app assets
- `components/` - React Native components
- `contexts/` - React contexts
- `hooks/` - React hooks
- `utils/` - Frontend utilities (unless backend uses them - check imports)
- `types/` - TypeScript types (unless backend uses them)
- `public/` - Frontend public files (unless backend serves them)
- `database/` - SQL migration files (if not needed at runtime)
- `scripts/` - Development scripts (unless needed by backend)
- `test-*.js` - Test files
- `*.md` - Documentation files
- `node_modules/` - Will be installed by EB
- `.git/` - Git repository
- `.env` - Environment file (use EB environment variables instead)

### Step 3: Create the zip file

**IMPORTANT:** The zip file must have files at the root level, NOT in a nested folder.

**Correct structure:**
```
eb-deploy.zip
├── package.json
├── package-lock.json
├── Procfile
└── services/
    └── Server/
        └── ...
```

**WRONG structure (nested folder):**
```
eb-deploy.zip
└── eb-deploy/          ← This will cause "Cannot find module" errors
    ├── package.json
    └── services/
```

**Command to create zip (from inside eb-deploy directory):**
```bash
# On macOS/Linux:
zip -r ../eb-backend-deploy.zip . -x "*.git*" "*.DS_Store"

# Or use Finder/File Explorer to zip the folder, then unzip and re-zip to ensure no nested folder
```

**Command to create zip (from parent directory):**
```bash
cd eb-deploy
zip -r ../eb-backend-deploy.zip . -x "*.git*" "*.DS_Store"
```

### Step 4: Verify zip structure

Before uploading, verify the zip structure:
```bash
unzip -l eb-backend-deploy.zip | head -20
```

You should see `package.json` and `Procfile` at the root, not nested in a folder.

### Step 5: Upload to Elastic Beanstalk

1. Go to your EB environment in AWS Console
2. Click "Upload and deploy"
3. Upload `eb-backend-deploy.zip`
4. Deploy

## Environment Variables

Make sure these are set in your EB environment configuration:
- `PORT` - Will be set to 8080 by EB automatically
- `DATABASE_URL` - Your PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `AWS_ACCESS_KEY_ID` - AWS credentials for S3
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `STRIPE_SECRET_KEY` - Stripe API key (if using Stripe)
- `BREVO_SMTP_KEY` - Email service key (if using email)
- `NODE_ENV` - Set to `production`

## Troubleshooting

### "Cannot find module" error
- **Cause:** Zip file has a nested folder (e.g., `eb-deploy/package.json` instead of `package.json`)
- **Fix:** Re-zip ensuring files are at the root level

### "ENOSPC: System limit for number of file watchers"
- **Cause:** `npm start` is running Expo instead of the backend
- **Fix:** Ensure `Procfile` exists and contains `web: npm run server:prod`

### "Connection refused" on port 8080
- **Cause:** Server isn't starting or listening on the wrong port
- **Fix:** Check logs to see if server started. Server should listen on `process.env.PORT` (8080 in EB)

### Health checks failing
- **Cause:** Server not responding on port 8080
- **Fix:** Check that `services/Server/main.js` listens on `process.env.PORT || 5001` (EB sets PORT=8080)

## Quick Reference

**Minimum zip contents:**
```
package.json
package-lock.json
Procfile
services/
  Server/
    main.js
    config/
    middleware/
    s3Service.js
    socialAuthService.js
```

**Procfile contents:**
```
web: npm run server:prod
```

**package.json script (already exists):**
```json
"server:prod": "NODE_ENV=production node ./services/Server/main.js"
```
