-- Create app_versions table for managing app update files
CREATE TABLE IF NOT EXISTS app_versions (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios')),
  s3_key TEXT NOT NULL,
  download_url TEXT NOT NULL,
  release_notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_size BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(version, platform)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_versions_platform_active ON app_versions(platform, is_active);
CREATE INDEX IF NOT EXISTS idx_app_versions_version ON app_versions(version);

-- Create trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_app_versions_updated_at') THEN
    CREATE TRIGGER update_app_versions_updated_at 
    BEFORE UPDATE ON app_versions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

