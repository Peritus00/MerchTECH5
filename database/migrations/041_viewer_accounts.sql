-- Viewer-only accounts: account_type on users + system settings for viewer signups/upgrades

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(32) NOT NULL DEFAULT 'creator';

COMMENT ON COLUMN users.account_type IS 'creator = full app features (tier-limited); viewer = read-only consumer with activation-code access only';

-- Optional check constraint (PostgreSQL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_account_type_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_account_type_check
      CHECK (account_type IN ('creator', 'viewer'));
  END IF;
END $$;

INSERT INTO system_settings (setting_key, setting_value, updated_at)
VALUES ('viewer_signups_enabled', 'false', CURRENT_TIMESTAMP)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, updated_at)
VALUES ('viewer_upgrades_enabled', 'true', CURRENT_TIMESTAMP)
ON CONFLICT (setting_key) DO NOTHING;
