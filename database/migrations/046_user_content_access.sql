-- Durable user-to-content access for open-access lead gates and purchases.

CREATE TABLE IF NOT EXISTS user_content_access (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('playlist', 'slideshow')),
  content_id INTEGER NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'open_access_lead',
  lead_id INTEGER REFERENCES preview_phone_leads(id) ON DELETE SET NULL,
  purchase_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_user_content_access_user
  ON user_content_access(user_id);

CREATE INDEX IF NOT EXISTS idx_user_content_access_content
  ON user_content_access(content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_user_content_access_lead
  ON user_content_access(lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE preview_phone_leads
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_preview_phone_leads_user
  ON preview_phone_leads(user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE user_content_access IS
  'Remembers authenticated user access to open-access content so lead gates are not shown repeatedly.';
