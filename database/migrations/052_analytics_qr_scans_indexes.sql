-- Analytics performance indexes for qr_scans dedup and time-range queries
-- Idempotent — safe to run on every deploy

CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_code_scanned_at ON qr_scans(qr_code_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_scans_visitor_id_scanned_at ON qr_scans(visitor_id, scanned_at DESC)
  WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_visitor_id_scanned_at ON qr_scans(qr_visitor_id, scanned_at DESC)
  WHERE qr_visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qr_scans_scanned_at ON qr_scans(scanned_at DESC);
