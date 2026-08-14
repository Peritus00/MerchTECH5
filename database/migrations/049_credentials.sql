-- Event Access Control: credentials and print pipeline
-- Part 3 of 4: credential templates, credentials, photo deletion audit

-- Credential templates (per access level, per stock type)
CREATE TABLE IF NOT EXISTS credential_templates (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  access_level_id INTEGER REFERENCES access_levels(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  stock VARCHAR(20) NOT NULL CHECK (stock IN ('laminate_3x4','cr80')),
  width_mm NUMERIC(6,2) NOT NULL,           -- laminate_3x4: 76x102; cr80: 85.6x54
  height_mm NUMERIC(6,2) NOT NULL,
  orientation VARCHAR(10) NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape')),
  bleed_mm NUMERIC(4,2) NOT NULL DEFAULT 3,
  has_back BOOLEAN NOT NULL DEFAULT FALSE,
  front_layout JSONB,
  back_layout JSONB,
  artwork_s3_key VARCHAR(500),
  show_photo BOOLEAN NOT NULL DEFAULT TRUE,
  show_zone_strip BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credential_templates_event ON credential_templates(event_id);

-- Add FK from access_levels to credential_templates (deferred until template is created)
ALTER TABLE access_levels
  ADD COLUMN IF NOT EXISTS credential_template_id INTEGER REFERENCES credential_templates(id) ON DELETE SET NULL;

-- Credentials (printed artifacts; one ticket can have many over time, only one active)
CREATE TABLE IF NOT EXISTS credentials (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Sequential per event for manual audit. Generated with:
  --   SELECT COALESCE(MAX(credential_number),0)+1 FROM credentials WHERE event_id=$1 FOR UPDATE
  -- Gaps are accepted (tolerated on rollback).
  credential_number INTEGER NOT NULL,
  stock VARCHAR(20) NOT NULL CHECK (stock IN ('laminate_3x4','cr80')),
  template_id INTEGER REFERENCES credential_templates(id) ON DELETE SET NULL,
  -- ECDSA-signed payload: { public_code, access_level_id, event_id, day_bitmap, expiry }
  -- day_bitmap is an integer bitmask: bit N set = valid on event_days.day_number = N+1
  signed_payload TEXT,
  signing_key_id VARCHAR(64) REFERENCES event_signing_keys(key_id) ON DELETE SET NULL,
  chip_uid VARCHAR(64),                     -- RFID hook; unused initially
  printed_at TIMESTAMPTZ,
  printed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided','superseded')),
  reprint_of_credential_id INTEGER REFERENCES credentials(id) ON DELETE SET NULL,
  void_reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credential_number ON credentials(event_id, credential_number);
CREATE INDEX IF NOT EXISTS idx_credentials_ticket ON credentials(ticket_id);
CREATE INDEX IF NOT EXISTS idx_credentials_event ON credentials(event_id);
-- Only one active credential per ticket
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credentials_active_per_ticket
  ON credentials(ticket_id)
  WHERE status = 'active';

-- Photo deletion audit log (manual admin-triggered cleanup)
CREATE TABLE IF NOT EXISTS photo_deletion_audit (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  attendee_id INTEGER REFERENCES attendees(id) ON DELETE SET NULL,
  s3_key VARCHAR(500) NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_photo_deletion_audit_event ON photo_deletion_audit(event_id);
