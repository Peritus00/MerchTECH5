-- Event Access Control: scanning, sync, and provider connections
-- Part 4 of 4: scan events, ticket zone state, scanner devices, providers

-- Scanner devices (created before scan_events since scan_events has a FK to it)
CREATE TABLE IF NOT EXISTS scanner_devices (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  device_name VARCHAR(100),
  last_preflight_at TIMESTAMPTZ,
  roster_version VARCHAR(64),
  clock_drift_ms INTEGER,                   -- measured during last pre-flight; logged for post-event audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scanner_devices_event ON scanner_devices(event_id);

-- Scan events (append-only audit log)
CREATE TABLE IF NOT EXISTS scan_events (
  id SERIAL PRIMARY KEY,
  client_scan_uuid UUID NOT NULL UNIQUE,    -- set by scanner device; dedupes offline batch replays
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  zone_id INTEGER REFERENCES event_zones(id) ON DELETE SET NULL,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('entry','exit')),
  result VARCHAR(7) NOT NULL CHECK (result IN ('granted','denied')),
  deny_reason VARCHAR(50),
  validation_mode_used VARCHAR(15) NOT NULL CHECK (validation_mode_used IN ('strict','trust','manual_override')),
  was_offline BOOLEAN NOT NULL DEFAULT FALSE,
  device_id INTEGER REFERENCES scanner_devices(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL,          -- device clock
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_events_event ON scan_events(event_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_ticket ON scan_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_scanned_at ON scan_events(event_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_events_uuid ON scan_events(client_scan_uuid);

-- Materialized ticket occupancy per zone (maintained transactionally with scan_events)
-- Gate decisions read this table; never computed on the fly
CREATE TABLE IF NOT EXISTS ticket_zone_state (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES event_zones(id) ON DELETE CASCADE,
  is_inside BOOLEAN NOT NULL DEFAULT FALSE,
  entries_used INTEGER NOT NULL DEFAULT 0,
  exits_used INTEGER NOT NULL DEFAULT 0,
  last_reset_on DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_zone_state_ticket ON ticket_zone_state(ticket_id);

-- Ticket provider connections (no uniqueness constraint; multiple active connections per event allowed)
CREATE TABLE IF NOT EXISTS ticket_provider_connections (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('in_house','csv','eventbrite','tixr','dice','ticketmaster','see_tickets')),
  external_event_id VARCHAR(255),
  credentials_encrypted TEXT,              -- provider API key or token; AES-256-GCM encrypted at rest
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_provider_connections_event ON ticket_provider_connections(event_id);

-- External ticket type → access level mapping
-- Unmapped external types grant nothing; import returns warning count for unmapped types
CREATE TABLE IF NOT EXISTS ticket_provider_type_map (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES ticket_provider_connections(id) ON DELETE CASCADE,
  external_ticket_type VARCHAR(255) NOT NULL,
  access_level_id INTEGER NOT NULL REFERENCES access_levels(id) ON DELETE CASCADE,
  UNIQUE (connection_id, external_ticket_type)
);

CREATE INDEX IF NOT EXISTS idx_tptm_connection ON ticket_provider_type_map(connection_id);

-- Ticket sync run history
CREATE TABLE IF NOT EXISTS ticket_sync_runs (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES ticket_provider_connections(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  cursor VARCHAR(500),                      -- provider-specific pagination cursor for delta sync
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errored INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ticket_sync_runs_connection ON ticket_sync_runs(connection_id);
