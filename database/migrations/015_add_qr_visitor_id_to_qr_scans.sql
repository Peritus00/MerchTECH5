-- Add optional qr_visitor_id and helpful index for dedupe/grouping.
-- Project already uses visitor_id (UUID) and uq_qr_scans_minute_dedupe.
-- This migration is safe to run multiple times.

ALTER TABLE qr_scans
  ADD COLUMN IF NOT EXISTS qr_visitor_id TEXT;

-- Backfill qr_visitor_id from visitor_id when present (idempotent)
UPDATE qr_scans
SET qr_visitor_id = COALESCE(qr_visitor_id, visitor_id::text)
WHERE visitor_id IS NOT NULL;

-- Non-unique helper index to accelerate lookups/grouping by visitor within time ranges
CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_visitor
  ON qr_scans (qr_code_id, qr_visitor_id, scanned_at DESC);


