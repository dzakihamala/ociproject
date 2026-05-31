-- Antrian & rate limit pengumpulan (banyak siswa upload bersamaan)
CREATE TABLE IF NOT EXISTS submit_slots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submit_slots_task_expires
  ON submit_slots (task_id, expires_at);

CREATE TABLE IF NOT EXISTS submit_rate_buckets (
  bucket_key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submit_rate_expires
  ON submit_rate_buckets (expires_at);
