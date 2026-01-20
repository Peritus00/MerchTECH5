-- Track QR code delete requests from delegates
CREATE TABLE IF NOT EXISTS qr_code_delete_requests (
  id SERIAL PRIMARY KEY,
  qr_code_id INTEGER REFERENCES qr_codes(id) ON DELETE CASCADE,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP DEFAULT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_qr_code_delete_requests_qr_code_id
  ON qr_code_delete_requests(qr_code_id);

CREATE INDEX IF NOT EXISTS idx_qr_code_delete_requests_status
  ON qr_code_delete_requests(status);
