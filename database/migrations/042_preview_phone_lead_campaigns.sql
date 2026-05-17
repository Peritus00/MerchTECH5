-- SMS campaigns from verified preview phone leads (marketing opt-in recipients only for automated send)

CREATE TABLE IF NOT EXISTS preview_phone_lead_campaigns (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_body TEXT NOT NULL,
  recipient_total INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_preview_phone_lead_campaigns_owner
  ON preview_phone_lead_campaigns(owner_user_id);

CREATE TABLE IF NOT EXISTS preview_phone_lead_campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES preview_phone_lead_campaigns(id) ON DELETE CASCADE,
  phone_e164 VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_preview_phone_lead_campaign_recipients_campaign
  ON preview_phone_lead_campaign_recipients(campaign_id);
