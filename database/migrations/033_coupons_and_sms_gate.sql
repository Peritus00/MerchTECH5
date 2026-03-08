-- Coupon + SMS Preview Gate
-- Tables for coupons, consent, delivery events, and feature settings

-- Coupons (product and signup discounts)
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  discount_value DECIMAL(10,2) NOT NULL,
  max_redemptions INTEGER,
  expires_at TIMESTAMP,
  is_signup_offer BOOLEAN DEFAULT FALSE,
  intro_period_months INTEGER, -- For subscription: discount applies for N months after redemption
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code)
);

-- Map coupons to items (product, playlist, or slideshow; empty = sitewide/signup)
CREATE TABLE IF NOT EXISTS coupon_item_map (
  id SERIAL PRIMARY KEY,
  coupon_id INTEGER REFERENCES coupons(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_one_item CHECK (
    (CASE WHEN product_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN playlist_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN slideshow_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

-- Redemption tracking
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id SERIAL PRIMARY KEY,
  coupon_id INTEGER REFERENCES coupons(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  order_id VARCHAR(255),
  stripe_session_id VARCHAR(255),
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Marketing SMS consent (required before sending coupon texts)
CREATE TABLE IF NOT EXISTS marketing_sms_consents (
  id SERIAL PRIMARY KEY,
  phone_e164 VARCHAR(20) NOT NULL,
  consent_copy_version TEXT,
  consented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(phone_e164)
);

-- SMS delivery events (Brevo message IDs, status)
CREATE TABLE IF NOT EXISTS marketing_sms_events (
  id SERIAL PRIMARY KEY,
  phone_e164 VARCHAR(20) NOT NULL,
  consent_id INTEGER REFERENCES marketing_sms_consents(id) ON DELETE SET NULL,
  coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  provider_message_id VARCHAR(100),
  provider_response JSONB,
  status VARCHAR(50) DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feature settings (preview gate skip toggle, admin overrides)
CREATE TABLE IF NOT EXISTS user_feature_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, setting_key)
);

-- System-wide preview gate settings (skip allowed, etc.)
CREATE TABLE IF NOT EXISTS system_feature_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupons_owner ON coupons(owner_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupon_item_map_coupon ON coupon_item_map(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_marketing_sms_events_phone ON marketing_sms_events(phone_e164);
CREATE INDEX IF NOT EXISTS idx_user_feature_settings_user ON user_feature_settings(user_id);
