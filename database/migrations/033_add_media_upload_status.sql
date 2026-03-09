-- Add upload workflow columns for secure direct-to-S3 media ingestion
ALTER TABLE media ADD COLUMN IF NOT EXISTS upload_status VARCHAR(32) NOT NULL DEFAULT 'ready';
ALTER TABLE media ADD COLUMN IF NOT EXISTS scan_status VARCHAR(32);
ALTER TABLE media ADD COLUMN IF NOT EXISTS scan_details JSONB;
ALTER TABLE media ADD COLUMN IF NOT EXISTS scan_started_at TIMESTAMP;
ALTER TABLE media ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMP;
ALTER TABLE media ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE media ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_media_upload_status ON media(upload_status);
CREATE INDEX IF NOT EXISTS idx_media_scan_status ON media(scan_status);
