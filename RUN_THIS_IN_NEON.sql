-- =============================================================================
-- DEMOGRAPHICS MIGRATIONS - Run this in Neon Dashboard
-- =============================================================================
-- This adds all necessary columns for age and gender demographics tracking
-- Safe to run multiple times (uses IF NOT EXISTS)
-- =============================================================================

-- MIGRATION 017: Add user_provided_age_range to qr_scans table
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS qr_scans
  ADD COLUMN IF NOT EXISTS user_provided_age_range TEXT;

CREATE INDEX IF NOT EXISTS idx_qr_scans_age_range 
  ON qr_scans(user_provided_age_range) 
  WHERE user_provided_age_range IS NOT NULL;

COMMENT ON COLUMN qr_scans.user_provided_age_range IS 
  'User-provided age range (e.g., "18-24", "25-34", etc.) for demographic analytics';

-- MIGRATION 018: Add user_provided_gender to qr_scans table
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS qr_scans
  ADD COLUMN IF NOT EXISTS user_provided_gender TEXT;

CREATE INDEX IF NOT EXISTS idx_qr_scans_gender 
  ON qr_scans(user_provided_gender) 
  WHERE user_provided_gender IS NOT NULL;

COMMENT ON COLUMN qr_scans.user_provided_gender IS 
  'User-provided gender identity (Male, Female, Non-binary, Prefer not to say, Open-ended) for demographic analytics';

-- MIGRATION 019: Add age_range and gender to users table
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS age_range TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT;

CREATE INDEX IF NOT EXISTS idx_users_age_range 
  ON users(age_range) 
  WHERE age_range IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_gender 
  ON users(gender) 
  WHERE gender IS NOT NULL;

COMMENT ON COLUMN users.age_range IS 
  'User age range (e.g., "18-24", "25-34") for demographic analytics';

COMMENT ON COLUMN users.gender IS 
  'User gender identity (Male, Female, Non-binary, Prefer not to say, Open-ended) for demographic analytics';

-- =============================================================================
-- VERIFICATION QUERIES (run these after to confirm)
-- =============================================================================

-- Check if columns were created
SELECT 
  table_name, 
  column_name 
FROM information_schema.columns 
WHERE table_name IN ('qr_scans', 'users') 
  AND column_name IN ('user_provided_age_range', 'user_provided_gender', 'age_range', 'gender')
ORDER BY table_name, column_name;

-- Should return 4 rows:
-- qr_scans | user_provided_age_range
-- qr_scans | user_provided_gender
-- users    | age_range
-- users    | gender

