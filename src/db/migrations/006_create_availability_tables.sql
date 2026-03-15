-- WO-133: Core Platform Schema Updates
-- 006_create_availability_tables.sql
-- UP

CREATE TABLE IF NOT EXISTS ambassador_general_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  is_active BOOLEAN NOT NULL DEFAULT true,
  preferred_regions TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_ambassador_day_time UNIQUE (ambassador_id, day_of_week, start_time)
);

CREATE TABLE IF NOT EXISTS ambassador_availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT false,
  all_day BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_exception_date_slot UNIQUE (ambassador_id, exception_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_ambassador_general_availability_ambassador_day
  ON ambassador_general_availability(ambassador_id, day_of_week)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ambassador_availability_exceptions_ambassador_date
  ON ambassador_availability_exceptions(ambassador_id, exception_date);

-- DOWN

DROP INDEX IF EXISTS idx_ambassador_availability_exceptions_ambassador_date;
DROP INDEX IF EXISTS idx_ambassador_general_availability_ambassador_day;
DROP TABLE IF EXISTS ambassador_availability_exceptions;
DROP TABLE IF EXISTS ambassador_general_availability;
