-- Event Access Control: core event entities
-- Part 1 of 4: events, zones, access levels, staff, signing keys

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(100) NOT NULL,           -- e.g. 'America/Chicago'; enforces UTC rule at DB level
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  event_year INTEGER,
  capacity INTEGER,
  validation_mode VARCHAR(10) NOT NULL DEFAULT 'strict' CHECK (validation_mode IN ('strict','trust')),
  qr_visible_from TIMESTAMPTZ,              -- NULL = immediately visible
  daily_reset_time TIME NOT NULL DEFAULT '04:00:00', -- evaluated in event timezone; configurable by admin
  photo_retention_days INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status) WHERE deleted_at IS NULL;

-- Event days (multi-day / camping support)
CREATE TABLE IF NOT EXISTS event_days (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  day_number INTEGER NOT NULL,              -- 1-indexed, used for day_bitmap in signed payloads
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_days_event ON event_days(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_days_number ON event_days(event_id, day_number);

-- Event zones
CREATE TABLE IF NOT EXISTS event_zones (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  zone_type VARCHAR(20) NOT NULL CHECK (zone_type IN ('outer_space','interior')),
  parent_zone_id INTEGER REFERENCES event_zones(id) ON DELETE SET NULL, -- nesting; no token inheritance
  capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_zones_event ON event_zones(event_id);

-- Access levels (the canonical entitlement concept)
CREATE TABLE IF NOT EXISTS access_levels (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7),                         -- hex color for zone strip display
  requires_credential BOOLEAN NOT NULL DEFAULT FALSE,
  counts_toward_capacity BOOLEAN NOT NULL DEFAULT TRUE,
  is_infinite_access BOOLEAN NOT NULL DEFAULT FALSE, -- staff/talent bypass normal counts
  credential_template_id INTEGER,           -- FK added after migration 049
  drink_tokens_default INTEGER NOT NULL DEFAULT 0,
  food_tokens_default INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_levels_event ON access_levels(event_id);

-- Per access-level per zone token configuration
CREATE TABLE IF NOT EXISTS access_level_zone_tokens (
  id SERIAL PRIMARY KEY,
  access_level_id INTEGER NOT NULL REFERENCES access_levels(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES event_zones(id) ON DELETE CASCADE,
  entry_limit INTEGER,                      -- NULL = unlimited
  exit_limit INTEGER,                       -- NULL = unlimited
  window_start_time TIME,                   -- evaluated in event timezone
  window_end_time TIME,
  reset_policy VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (reset_policy IN ('daily','camping','none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (access_level_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_alzt_access_level ON access_level_zone_tokens(access_level_id);
CREATE INDEX IF NOT EXISTS idx_alzt_zone ON access_level_zone_tokens(zone_id);

-- Event staff and roles
CREATE TABLE IF NOT EXISTS event_staff (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','event_manager','door_scanner','credential_desk','seller')),
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Only one active role per user per event
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_staff_active
  ON event_staff(event_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_staff_event ON event_staff(event_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_user ON event_staff(user_id);

-- Per-event ECDSA signing keys (private key lives in env vars only, never in DB)
CREATE TABLE IF NOT EXISTS event_signing_keys (
  key_id VARCHAR(64) PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  algorithm VARCHAR(20) NOT NULL DEFAULT 'ECDSA-P256',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_signing_keys_event ON event_signing_keys(event_id);
