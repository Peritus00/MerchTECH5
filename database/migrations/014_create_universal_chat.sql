-- Migration to create universal chat system
-- Transform chat from playlist-specific to platform-wide with filtering

-- Create new universal_chat_messages table
CREATE TABLE IF NOT EXISTS universal_chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'general', -- general, store_promotion, product_showcase
  related_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  related_store_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  product_category VARCHAR(100), -- Music, Film, Literature, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  reply_to_id INTEGER REFERENCES universal_chat_messages(id) ON DELETE SET NULL
);

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_universal_chat_user_id ON universal_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_universal_chat_created_at ON universal_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_universal_chat_message_type ON universal_chat_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_universal_chat_product_category ON universal_chat_messages(product_category);
CREATE INDEX IF NOT EXISTS idx_universal_chat_related_store ON universal_chat_messages(related_store_user_id);
CREATE INDEX IF NOT EXISTS idx_universal_chat_related_product ON universal_chat_messages(related_product_id);
CREATE INDEX IF NOT EXISTS idx_universal_chat_not_deleted ON universal_chat_messages(created_at DESC) WHERE is_deleted = FALSE;

-- Create composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_universal_chat_store_filter 
ON universal_chat_messages(related_store_user_id, created_at DESC) 
WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_universal_chat_category_filter 
ON universal_chat_messages(product_category, created_at DESC) 
WHERE is_deleted = FALSE;

-- Add trigger for updated_at column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_universal_chat_messages_updated_at') THEN
    CREATE TRIGGER update_universal_chat_messages_updated_at 
    BEFORE UPDATE ON universal_chat_messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Migrate existing chat_messages to universal_chat_messages
-- This preserves existing chat history
INSERT INTO universal_chat_messages (user_id, message, message_type, created_at, updated_at, is_deleted)
SELECT 
  user_id, 
  message, 
  'general' as message_type,
  created_at, 
  updated_at, 
  is_deleted
FROM chat_messages
WHERE NOT EXISTS (
  SELECT 1 FROM universal_chat_messages ucm 
  WHERE ucm.user_id = chat_messages.user_id 
  AND ucm.message = chat_messages.message 
  AND ucm.created_at = chat_messages.created_at
);

-- Create function to get product category from product ID
CREATE OR REPLACE FUNCTION get_product_category(product_id INTEGER)
RETURNS VARCHAR(100) AS $$
DECLARE
  category VARCHAR(100);
BEGIN
  SELECT p.category INTO category FROM products p WHERE p.id = product_id;
  RETURN category;
END;
$$ LANGUAGE plpgsql;

-- Add comments to document the new table
COMMENT ON TABLE universal_chat_messages IS 'Universal platform-wide chat system with filtering capabilities';
COMMENT ON COLUMN universal_chat_messages.message_type IS 'Type of message: general, store_promotion, product_showcase';
COMMENT ON COLUMN universal_chat_messages.related_product_id IS 'Product being discussed/promoted in this message';
COMMENT ON COLUMN universal_chat_messages.related_store_user_id IS 'Store owner if this is a store-related message';
COMMENT ON COLUMN universal_chat_messages.product_category IS 'Category of related product for filtering';
COMMENT ON COLUMN universal_chat_messages.reply_to_id IS 'ID of message this is replying to (for threading)'; 