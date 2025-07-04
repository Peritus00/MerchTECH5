-- Migration 005: Add S3 key column to media table
-- This allows us to track which files are stored in S3 and their keys for deletion

ALTER TABLE media ADD COLUMN s3_key VARCHAR(500);

-- Add index for S3 key lookups
CREATE INDEX idx_media_s3_key ON media(s3_key) WHERE s3_key IS NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN media.s3_key IS 'S3 object key for files stored in AWS S3 bucket'; 