-- Analytics Hardening Migration (idempotent)

-- Ensure qr_scans has expected columns
ALTER TABLE IF EXISTS qr_scans
  ADD COLUMN IF NOT EXISTS visitor_id UUID,
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_qr_scans_visitor_id_scanned_at ON qr_scans(visitor_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_code_id_scanned_at ON qr_scans(qr_code_id, scanned_at);

-- Soft dedupe (prevent high-frequency duplicates per minute)
DO $$
BEGIN
  -- Some Postgres versions require unique index names globally; choose a stable name
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = ANY(current_schemas(false)) AND indexname = 'uq_qr_scans_minute_dedupe'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_qr_scans_minute_dedupe
             ON qr_scans (qr_code_id, visitor_id, date_trunc(''minute'', scanned_at))
             WHERE visitor_id IS NOT NULL';
  END IF;
END$$;

-- Ensure plays tables indexes
CREATE INDEX IF NOT EXISTS idx_media_plays_session_id ON media_plays(session_id);
CREATE INDEX IF NOT EXISTS idx_media_plays_played_at ON media_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_playlist_plays_session_id ON playlist_plays(session_id);
CREATE INDEX IF NOT EXISTS idx_playlist_plays_played_at ON playlist_plays(played_at);


