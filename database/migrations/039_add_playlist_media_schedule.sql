-- Per-playlist media scheduling (calendar / recurring within a date window)
ALTER TABLE playlist_media
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS schedule_end_date DATE NULL,
  ADD COLUMN IF NOT EXISTS schedule_exact_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule_recurring_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
