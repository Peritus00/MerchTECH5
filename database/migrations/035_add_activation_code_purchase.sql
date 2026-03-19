-- Activation code purchase flow: pricing and purchase-tracking for Stripe fulfillment

-- Add price_cents to activation_codes (default $5.00)
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS price_cents INTEGER DEFAULT 500;

-- Purchase intent table: stores guest phone + content before Stripe checkout completes.
-- Webhook uses stripe_session_id for idempotent fulfillment.
CREATE TABLE IF NOT EXISTS activation_code_purchases (
  id SERIAL PRIMARY KEY,
  stripe_session_id TEXT UNIQUE NOT NULL,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
  slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  phone_e164 TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 500,
  max_uses INTEGER DEFAULT 1,
  expires_at TIMESTAMP DEFAULT NULL,
  activation_code_id INTEGER REFERENCES activation_codes(id) ON DELETE SET NULL,
  fulfilled_at TIMESTAMP DEFAULT NULL,
  sms_sent_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_code_purchases_session ON activation_code_purchases(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_activation_code_purchases_created_by ON activation_code_purchases(created_by);
CREATE INDEX IF NOT EXISTS idx_activation_code_purchases_fulfilled ON activation_code_purchases(fulfilled_at) WHERE fulfilled_at IS NOT NULL;
