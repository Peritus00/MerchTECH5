-- Extend qr_scans with privacy-preserving fields and helpful indexes

-- New metadata columns (nullable, added idempotently)
ALTER TABLE IF EXISTS qr_scans
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS visitor_id UUID,
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100);

-- Helpful indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_qr_scans_visitor_id_scanned_at ON qr_scans(visitor_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_code_id_scanned_at ON qr_scans(qr_code_id, scanned_at);

-- Note: We intentionally do not remove ip_address for backward-compat; server will stop writing it.

