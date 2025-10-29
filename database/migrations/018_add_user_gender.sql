-- User Gender Enhancement
-- Adds column to store user-provided gender for demographic analytics

-- Add user-provided gender column to qr_scans
ALTER TABLE IF EXISTS qr_scans
  ADD COLUMN IF NOT EXISTS user_provided_gender TEXT;

-- Create index for gender analytics queries
CREATE INDEX IF NOT EXISTS idx_qr_scans_gender 
  ON qr_scans(user_provided_gender) 
  WHERE user_provided_gender IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN qr_scans.user_provided_gender IS 
  'User-provided gender identity (Male, Female, Non-binary, Prefer not to say, Open-ended) for demographic analytics';

