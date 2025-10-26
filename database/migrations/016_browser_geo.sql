-- Add browser geolocation columns and consent metadata to qr_scans

ALTER TABLE qr_scans
  ADD COLUMN IF NOT EXISTS geo_lat NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geo_lng NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geo_accuracy_m INTEGER,
  ADD COLUMN IF NOT EXISTS geo_consent TEXT;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_scanned_at ON qr_scans (qr_code_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scans_location_source ON qr_scans (location_source);

COMMENT ON COLUMN qr_scans.geo_lat IS 'Rounded browser-provided latitude (no raw IPs stored)';
COMMENT ON COLUMN qr_scans.geo_lng IS 'Rounded browser-provided longitude (no raw IPs stored)';
COMMENT ON COLUMN qr_scans.geo_accuracy_m IS 'Accuracy in meters from browser geolocation';
COMMENT ON COLUMN qr_scans.geo_consent IS 'How geo was consented: browser-granted | user-provided | implicit-auto';


