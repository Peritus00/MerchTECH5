-- Orders and Order Items tables for normalized sales data

-- orders: one per Stripe checkout session
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stripe_session_id TEXT UNIQUE NOT NULL,
  total_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'usd',
  customer_email TEXT,
  purchased_at TIMESTAMP DEFAULT NOW()
);

-- order_items: expanded from Stripe line items
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount INTEGER NOT NULL DEFAULT 0
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_purchased_at ON orders(purchased_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Dedupe protection for items per order
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = ANY(current_schemas(false)) AND indexname = 'uq_order_item_dedupe'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_order_item_dedupe ON order_items(order_id, product_name, amount)';
  END IF;
END$$;



