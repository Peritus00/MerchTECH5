-- Create system_settings table for system-wide configuration
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on setting_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- Insert initial signups_enabled setting (default to true)
INSERT INTO system_settings (setting_key, setting_value, updated_at)
VALUES ('signups_enabled', 'true', CURRENT_TIMESTAMP)
ON CONFLICT (setting_key) DO NOTHING;
