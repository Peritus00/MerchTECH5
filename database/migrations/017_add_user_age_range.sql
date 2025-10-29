-- User Age Range Enhancement
-- Adds column to store user-provided age range for demographic analytics

-- Add user-provided age range column to qr_scans
ALTER TABLE IF EXISTS qr_scans
  ADD COLUMN IF NOT EXISTS user_provided_age_range TEXT;

-- Create index for age range analytics queries
CREATE INDEX IF NOT EXISTS idx_qr_scans_age_range 
  ON qr_scans(user_provided_age_range) 
  WHERE user_provided_age_range IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN qr_scans.user_provided_age_range IS 
  'User-provided age range (e.g., "18-24", "25-34", etc.) for demographic analytics';

