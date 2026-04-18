-- Preview phone leads (verified gate before preview) + slideshow phone gate parity

-- Per-slideshow preview phone requirement (matches playlists.require_phone_for_preview)
ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS require_phone_for_preview BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_slideshows_require_phone_for_preview ON slideshows(require_phone_for_preview);

-- Lead capture for locked content with phone-gated preview
CREATE TABLE IF NOT EXISTS preview_phone_leads (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('playlist', 'slideshow')),
  content_id INTEGER NOT NULL,
  phone_e164 VARCHAR(20) NOT NULL,
  coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  public_poll_token UUID NOT NULL DEFAULT gen_random_uuid(),
  verification_token_hash VARCHAR(64) NOT NULL,
  verification_expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  last_sms_sent_at TIMESTAMP,
  transactional_consent_copy_version TEXT,
  terms_consented BOOLEAN NOT NULL DEFAULT false,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  marketing_consent_copy_version TEXT,
  marketing_consented_at TIMESTAMP,
  unlock_jti VARCHAR(64),
  unlock_expires_at TIMESTAMP,
  qr_code_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_preview_phone_leads_poll_token ON preview_phone_leads(public_poll_token);
CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_owner ON preview_phone_leads(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_content ON preview_phone_leads(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_phone ON preview_phone_leads(phone_e164);
CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_verification_hash ON preview_phone_leads(verification_token_hash);

CREATE TABLE IF NOT EXISTS preview_phone_lead_events (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES preview_phone_leads(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  meta JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_preview_phone_lead_events_lead ON preview_phone_lead_events(lead_id);
