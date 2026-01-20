-- Add QR code delegate assignments
CREATE TABLE IF NOT EXISTS qr_code_delegates (
  id SERIAL PRIMARY KEY,
  qr_code_id INTEGER REFERENCES qr_codes(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP DEFAULT NULL
);

-- Ensure only one active assignment per user per QR code
CREATE UNIQUE INDEX IF NOT EXISTS uniq_qr_code_delegate_active
  ON qr_code_delegates(qr_code_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qr_code_delegates_qr_code_id
  ON qr_code_delegates(qr_code_id);

CREATE INDEX IF NOT EXISTS idx_qr_code_delegates_user_id
  ON qr_code_delegates(user_id);
