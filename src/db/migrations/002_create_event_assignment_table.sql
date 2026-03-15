-- WO-133: Core Platform Schema Updates
-- 002_create_event_assignment_table.sql
-- UP

CREATE TABLE IF NOT EXISTS event_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  role VARCHAR(100) NOT NULL DEFAULT 'ambassador',
  scheduled_start TIME,
  scheduled_end TIME,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  hours_worked DECIMAL(6, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, ambassador_id)
);

DO $$
BEGIN
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS role VARCHAR(100) DEFAULT 'ambassador';
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS scheduled_start TIME;
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS scheduled_end TIME;
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ;
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(6, 2);
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
END $$;

CREATE INDEX IF NOT EXISTS idx_event_assignments_event_id ON event_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_ambassador_id ON event_assignments(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_checkin_checkout ON event_assignments(check_in_time, check_out_time);

-- DOWN

DROP INDEX IF EXISTS idx_event_assignments_checkin_checkout;
DROP INDEX IF EXISTS idx_event_assignments_ambassador_id;
DROP INDEX IF EXISTS idx_event_assignments_event_id;
DROP TABLE IF EXISTS event_assignments;
