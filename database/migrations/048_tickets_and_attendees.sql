-- Event Access Control: tickets and attendees
-- Part 2 of 4: attendees, ticket types, tickets, orders

-- Attendees (PII table; access controlled by role)
CREATE TABLE IF NOT EXISTS attendees (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255),
  email VARCHAR(255),
  photo_s3_key VARCHAR(500),
  photo_status VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (photo_status IN ('none','pending','approved')),
  source VARCHAR(20) NOT NULL DEFAULT 'in_house' CHECK (source IN ('in_house','csv','eventbrite','tixr','dice','ticketmaster','see_tickets')),
  external_id VARCHAR(255),                 -- provider's attendee ID for delta sync
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendees_event ON attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_attendees_email ON attendees(event_id, email);
CREATE INDEX IF NOT EXISTS idx_attendees_updated ON attendees(event_id, updated_at);

-- Ticket types (sellable SKUs; one per access level)
CREATE TABLE IF NOT EXISTS ticket_types (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  access_level_id INTEGER NOT NULL REFERENCES access_levels(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  quantity_total INTEGER,                   -- NULL = unlimited
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0, -- soft-reserve for in-flight Stripe sessions
  sales_start TIMESTAMPTZ,
  sales_end TIMESTAMPTZ,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id);

-- Tickets (stable entitlements)
-- public_code is the QR identifier.
-- IMPORTANT: public_code ROTATES on transfer.
--   Transfer: old ticket gets revoked_at + revoked_reason = 'transferred',
--   new ticket row is created with a fresh public_code UUID.
--   Any printed credential referencing the old public_code is invalidated.
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  public_code UUID NOT NULL DEFAULT gen_random_uuid(),
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_id INTEGER REFERENCES attendees(id) ON DELETE SET NULL,
  ticket_type_id INTEGER REFERENCES ticket_types(id) ON DELETE SET NULL,
  drink_tokens_remaining INTEGER NOT NULL DEFAULT 0, -- copied from access_level at issuance
  food_tokens_remaining INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(50) CHECK (revoked_reason IN ('transferred','voided','duplicate','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tickets_public_code ON tickets(public_code);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_attendee ON tickets(attendee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(event_id, updated_at);

-- In-house ticket orders (Stripe fulfillment)
CREATE TABLE IF NOT EXISTS event_ticket_orders (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id INTEGER REFERENCES ticket_types(id) ON DELETE SET NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,   -- idempotency key
  quantity INTEGER NOT NULL DEFAULT 1,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  attendee_email VARCHAR(255),
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_ticket_orders_event ON event_ticket_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_orders_session ON event_ticket_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_orders_status ON event_ticket_orders(status) WHERE status = 'pending';

-- Link existing order_items to products (nullable; ticket items use product_name as the text label)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
