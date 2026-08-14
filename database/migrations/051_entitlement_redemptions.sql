-- Migration 051: Entitlement Redemptions
-- Tracks POS token redemptions with idempotency support

BEGIN;

-- Drink / food token redemption log
CREATE TABLE IF NOT EXISTS entitlement_redemptions (
  id                   BIGSERIAL PRIMARY KEY,
  idempotency_key      UUID        NOT NULL UNIQUE,
  ticket_id            BIGINT      NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  token_type           TEXT        NOT NULL CHECK (token_type IN ('drink','food')),
  quantity             INT         NOT NULL DEFAULT 1 CHECK (quantity > 0),
  redeemed_by_user_id  INT         REFERENCES users(id) ON DELETE SET NULL,
  device_id            TEXT,
  balance_after        INT         NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'success' CHECK (status IN ('success','reversed')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_redemptions_ticket
  ON entitlement_redemptions(ticket_id);

CREATE INDEX IF NOT EXISTS idx_entitlement_redemptions_idempotency
  ON entitlement_redemptions(idempotency_key);

-- Add drink / food token columns to tickets if they don't exist
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS drink_tokens_remaining INT NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS food_tokens_remaining  INT NOT NULL DEFAULT 0;

-- Add drink / food token allotments to ticket_types
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS drink_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS food_tokens  INT NOT NULL DEFAULT 0;

-- Add qr_visible_from to events (gate for digital ticket QR unlock)
ALTER TABLE events ADD COLUMN IF NOT EXISTS qr_visible_from TIMESTAMPTZ;

COMMIT;
