-- User-Provided Location Enhancement
-- Adds columns to store user-provided city/state for more accurate analytics

-- Add user-provided location columns to qr_scans
ALTER TABLE IF EXISTS qr_scans
  ADD COLUMN IF NOT EXISTS user_provided_city TEXT,
  ADD COLUMN IF NOT EXISTS user_provided_state TEXT,
  ADD COLUMN IF NOT EXISTS user_provided_zip TEXT,
  ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'auto';

-- Create index for user-provided location queries
CREATE INDEX IF NOT EXISTS idx_qr_scans_user_location 
  ON qr_scans(user_provided_city, user_provided_state) 
  WHERE user_provided_city IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN qr_scans.location_source IS 
  'Source of location data: auto (IP/headers), user (self-reported), unknown';

-- Update existing rows to mark as 'auto' if they have geo data
UPDATE qr_scans 
SET location_source = 'auto' 
WHERE location_source IS NULL 
  AND (city IS NOT NULL OR country_code IS NOT NULL);

-- Mark rows without any geo data as 'unknown'
UPDATE qr_scans 
SET location_source = 'unknown' 
WHERE location_source IS NULL;

