-- Create activity_logs table for comprehensive user action tracking
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,  -- e.g., 'LOGIN', 'CREATE_PRODUCT', 'DELETE_MEDIA'
  resource_type VARCHAR(50),          -- e.g., 'product', 'qr_code', 'playlist'
  resource_id INTEGER,                 -- ID of the affected resource
  ip_address INET,
  user_agent TEXT,
  request_method VARCHAR(10),          -- GET, POST, PUT, PATCH, DELETE
  endpoint VARCHAR(255),                -- API endpoint path
  status_code INTEGER,                 -- HTTP status code
  metadata JSONB DEFAULT '{}',          -- Additional context (request body, query params, etc.)
  error_message TEXT,                  -- If action failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_endpoint ON activity_logs(endpoint);

-- Add can_view_logs column to users table for permission management
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_logs BOOLEAN DEFAULT FALSE;

-- Create index for log viewing permission queries
CREATE INDEX IF NOT EXISTS idx_users_can_view_logs ON users(can_view_logs);

