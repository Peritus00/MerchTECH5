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

### Step 6: Post-deploy verification (recommended)

After deployment, verify the app is healthy before considering the release successful:

```bash
# Replace with your EB URL or production domain
API_BASE_URL=https://www.merchtrader.org node scripts/verify-deployment-health.js
```

- Exit 0 = healthy; exit 1 = fail rollout (investigate logs, consider rollback).
- See [OUTAGE_RUNBOOK.md](OUTAGE_RUNBOOK.md) for recovery steps.

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

### ClamAV Malware Scanning (Optional)

To enable malware scanning on uploaded files:

- `CLAMAV_URL` - ClamAV daemon URL. Examples:
  - `tcp://clamav-host:3310` - Direct clamd TCP (recommended)
  - `localhost:3310` - Same as above for local ClamAV
  - `http://clamav-rest-api:8080` - REST API wrapper URL
- `ENABLE_MALWARE_SCAN` - Set to `true` to enable (default: `true` when CLAMAV_URL is set). Set to `false` to disable.
- `SCAN_TIMEOUT_MS` - Max scan time floor per file in ms (default: 180000). Actual timeout scales up automatically for large files.

## ClamAV Setup

### Option 1: Docker (recommended for local dev and EC2)

```bash
docker-compose -f docker-compose.clamav.yml up -d
```

Set `CLAMAV_URL=tcp://localhost:3310` (or your ClamAV host). Allow 1-2 minutes for virus definitions to download on first start.

Always pull a fresh image before first deploy and when troubleshooting update failures:

```bash
docker compose -f docker-compose.clamav.yml pull
docker compose -f docker-compose.clamav.yml up -d
```

### Option 2: EC2 host install (advanced)

1. Launch an EC2 instance (t3.small or larger) in the same VPC as your EB environment.
2. Prefer Docker on that host (Option 1) to avoid outdated distro ClamAV packages.
3. If you must use host packages, use a current distro/repo that provides ClamAV 1.x and verify version with `clamd --version`.
4. Start `clamd` and ensure `freshclam` updates succeed.
5. Open port 3310 in the security group for traffic from your EB instances.
6. Set `CLAMAV_URL=tcp://<ec2-private-ip>:3310` in EB environment variables.

### Option 3: Disable Scanning

If ClamAV is not configured, uploads will work without scanning. File magic byte validation still runs to prevent MIME spoofing.

## Database Migration

Run the quarantine table migration if using malware scanning:

```bash
psql $DATABASE_URL -f database/migrations/032_create_quarantined_files_table.sql
```

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
      fileValidator.js
      clamavScanner.js
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
