-- Open-access lead capture for unlocked playlist/slideshow QR flows.

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS require_phone_for_open_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE slideshows
  ADD COLUMN IF NOT EXISTS require_phone_for_open_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE preview_phone_leads
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS open_access_unlocked_at TIMESTAMP;

ALTER TABLE qr_scans
  ADD COLUMN IF NOT EXISTS preview_phone_lead_id INTEGER REFERENCES preview_phone_leads(id) ON DELETE SET NULL;

ALTER TABLE media_plays
  ADD COLUMN IF NOT EXISTS preview_phone_lead_id INTEGER REFERENCES preview_phone_leads(id) ON DELETE SET NULL;

ALTER TABLE playlist_plays
  ADD COLUMN IF NOT EXISTS preview_phone_lead_id INTEGER REFERENCES preview_phone_leads(id) ON DELETE SET NULL;

ALTER TABLE slideshow_plays
  ADD COLUMN IF NOT EXISTS preview_phone_lead_id INTEGER REFERENCES preview_phone_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_playlists_open_access_phone
  ON playlists(require_phone_for_open_access);

CREATE INDEX IF NOT EXISTS idx_slideshows_open_access_phone
  ON slideshows(require_phone_for_open_access);

CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_open_access
  ON preview_phone_leads(owner_user_id, lead_source, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_scans_preview_phone_lead
  ON qr_scans(preview_phone_lead_id);

CREATE INDEX IF NOT EXISTS idx_media_plays_preview_phone_lead
  ON media_plays(preview_phone_lead_id);

CREATE INDEX IF NOT EXISTS idx_playlist_plays_preview_phone_lead
  ON playlist_plays(preview_phone_lead_id);

CREATE INDEX IF NOT EXISTS idx_slideshow_plays_preview_phone_lead
  ON slideshow_plays(preview_phone_lead_id);
