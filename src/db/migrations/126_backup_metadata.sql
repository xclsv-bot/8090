-- UP
CREATE TABLE IF NOT EXISTS backup_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size BIGINT NOT NULL CHECK (size >= 0),
  location TEXT NOT NULL,
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backup_records_type_timestamp
  ON backup_records(type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_backup_records_verified_at
  ON backup_records(verified_at);

CREATE TABLE IF NOT EXISTS backup_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  test_type VARCHAR(64) NOT NULL,
  result VARCHAR(32) NOT NULL CHECK (result IN ('passed', 'failed', 'partial')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_backup_tests_date
  ON backup_tests(test_date DESC);

CREATE INDEX IF NOT EXISTS idx_backup_tests_type
  ON backup_tests(test_type);

-- DOWN
DROP TABLE IF EXISTS backup_tests;
DROP TABLE IF EXISTS backup_records;
