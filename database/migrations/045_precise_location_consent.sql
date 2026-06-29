-- Lead-level precise browser geolocation consent (opt-in research)

ALTER TABLE preview_phone_leads
  ADD COLUMN IF NOT EXISTS precise_location_consent_status TEXT DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS precise_location_consented_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS precise_location_accuracy_m INTEGER,
  ADD COLUMN IF NOT EXISTS precise_location_source_scan_id INTEGER REFERENCES qr_scans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_precise_location_consent
  ON preview_phone_leads(precise_location_consent_status)
  WHERE verified_at IS NOT NULL;

COMMENT ON COLUMN preview_phone_leads.precise_location_consent_status IS
  'Opt-in precise location: granted | denied | unavailable | not_requested';
COMMENT ON COLUMN preview_phone_leads.precise_location_consented_at IS
  'When the lead last answered the precise location prompt';
COMMENT ON COLUMN preview_phone_leads.precise_location_accuracy_m IS
  'Browser-reported accuracy in meters when consent was granted';
COMMENT ON COLUMN preview_phone_leads.precise_location_source_scan_id IS
  'qr_scans row upgraded with browser coordinates for this lead';
