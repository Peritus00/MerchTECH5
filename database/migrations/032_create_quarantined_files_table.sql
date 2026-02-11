-- Create quarantined_files table for tracking malware-detected uploads
-- Used when ClamAV scan detects infected files - metadata stored for audit, no file content

CREATE TABLE IF NOT EXISTS quarantined_files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  scan_result JSONB,
  quarantined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  s3_key VARCHAR(500),
  ip_address INET,
  user_agent TEXT,
  upload_endpoint VARCHAR(255),
  virus_names TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_quarantined_files_user_id ON quarantined_files(user_id);
CREATE INDEX IF NOT EXISTS idx_quarantined_files_quarantined_at ON quarantined_files(quarantined_at);
CREATE INDEX IF NOT EXISTS idx_quarantined_files_upload_endpoint ON quarantined_files(upload_endpoint);
