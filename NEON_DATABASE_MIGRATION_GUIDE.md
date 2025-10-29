# Neon Database Migration Guide

## Goal
Migrate all data from old database (`ep-patient-waterfall-a66aspku`) to new database (`ep-falling-bar-aes0772o`) and make it primary.

## ⚠️ Important Safety Steps

### Before You Start:
1. ✅ Have both database connection strings ready
2. ✅ Test that new database is accessible
3. ✅ Verify you're logged in to Railway and Neon
4. ✅ Do this during low-traffic time if possible

## Step-by-Step Migration Process

### Phase 1: Backup Current Data (Safety First!)

**In Neon Dashboard - Old Database (`ep-patient-waterfall` branch):**

1. Go to SQL Editor
2. Select the branch with `ep-patient-waterfall-a66aspku`
3. **Create a backup** using Neon's built-in backup feature:
   - Click branch settings → "Create backup" or "Restore"
   - Or use Neon's point-in-time restore capability

**Alternative - Export via pg_dump:**
```bash
# Get connection string for OLD database (ep-patient-waterfall)
OLD_DB="postgresql://neondb_owner:npg_eMNC8h2HySbs@ep-patient-waterfall-a66aspku.us-west-2.aws.neon.tech/neondb?sslmode=require"

# Export all data
pg_dump "$OLD_DB" > merchtech_backup_$(date +%Y%m%d).sql
```

### Phase 2: Use Neon's Built-in Branch Copy (RECOMMENDED)

**This is the SAFEST and EASIEST method:**

1. **In Neon Dashboard:**
   - Go to the branch with `ep-patient-waterfall-a66aspku` (your current production)
   - Click **"More"** → **"Copy branch"**
   - Name it: "new-production" or similar
   - This creates an exact copy with all data

2. **Run demographics migrations on the NEW branch:**
   - Switch to the newly copied branch in SQL Editor
   - Run the demographics migrations (you already have the SQL)

3. **Get the new connection string:**
   - Click on the new branch
   - Copy the connection string

4. **Update Railway:**
   - Go to Railway dashboard → Your service → Variables
   - Update `DATABASE_URL` to the new branch's connection string
   - Railway will redeploy automatically

### Phase 3: Manual Data Migration (If Branch Copy Not Available)

**If you can't use branch copy, use pg_dump/restore:**

**Step 1: Prepare New Database**

In Neon SQL Editor on `ep-falling-bar-aes0772o` branch:

```sql
-- Run ALL your existing migrations first
-- This creates the schema structure
```

**Step 2: Export from Old Database**

```bash
# Connection string for OLD database
OLD_DB="postgresql://neondb_owner:npg_eMNC8h2HySbs@ep-patient-waterfall-a66aspku.us-west-2.aws.neon.tech/neondb?sslmode=require"

# Connection string for NEW database (get this from Neon for ep-falling-bar branch)
NEW_DB="postgresql://neondb_owner:YOUR_PASSWORD@ep-falling-bar-aes0772o.us-west-2.aws.neon.tech/neondb?sslmode=require"

# Export data only (not schema)
pg_dump "$OLD_DB" --data-only --no-owner --no-privileges > data_only.sql

# Import into new database
psql "$NEW_DB" < data_only.sql
```

**Step 3: Run Demographics Migrations**

On NEW database, run:
```sql
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS user_provided_age_range TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS user_provided_gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_range TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
```

### Phase 4: Switch Railway to New Database

1. **Test the new database first** (optional but recommended):
   - In Railway, create a new environment variable: `DATABASE_URL_NEW`
   - Set it to your new database connection string
   - Test that it connects

2. **Switch to new database:**
   - In Railway Variables, update `DATABASE_URL` to new connection string
   - Railway will automatically redeploy
   - Monitor the deployment

3. **Verify everything works:**
   - Check your app loads
   - Test QR codes work
   - Check analytics shows data
   - Test demographics survey

### Phase 5: Cleanup

After verifying everything works for 24-48 hours:
- Keep the old database for a week as backup
- Then you can delete it or archive it

## 🎯 RECOMMENDED APPROACH

**I strongly recommend Option 1: Neon Branch Copy**

It's the safest because:
- ✅ Exact copy of all data
- ✅ No manual export/import
- ✅ No risk of data loss
- ✅ Can easily rollback if needed
- ✅ Takes 1-2 minutes

## Need Help?

I can create scripts to automate any of these steps. Which approach would you like to use?

1. **Neon Branch Copy** (recommended, safest)
2. **pg_dump/restore migration** (more control)
3. **Just run migrations on current database** (easiest, no data movement)

