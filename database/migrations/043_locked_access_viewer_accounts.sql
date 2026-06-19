-- Locked-content viewer account flow: activation-code + verified phone creates viewer profiles.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_phone_e164 ON users(phone_e164);

ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS email_marketing_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS email_marketing_consent_copy_version TEXT;
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS email_marketing_consented_at TIMESTAMP;
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS activation_code_id INTEGER REFERENCES activation_codes(id) ON DELETE SET NULL;
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS pending_username VARCHAR(255);
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS pending_password_hash VARCHAR(255);
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS completed_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMP;
ALTER TABLE preview_phone_leads ADD COLUMN IF NOT EXISTS lead_source VARCHAR(40) NOT NULL DEFAULT 'preview_gate';

CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_email ON preview_phone_leads(email);
CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_activation_code ON preview_phone_leads(activation_code_id);
CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_completed_user ON preview_phone_leads(completed_user_id);
CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_source ON preview_phone_leads(lead_source);
