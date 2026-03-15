-- WO-133: Core Platform Schema Updates
-- 001_update_event_table.sql
-- UP

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'title'
  ) THEN
    ALTER TABLE events RENAME COLUMN name TO title;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'scheduled_date'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'event_date'
  ) THEN
    ALTER TABLE events RENAME COLUMN scheduled_date TO event_date;
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('activation', 'promotion', 'tournament', 'watch_party', 'corporate', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type event_type DEFAULT 'activation';
  ALTER TABLE events ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS location_address_line_1 VARCHAR(255);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS location_address_line_2 VARCHAR(255);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS location_city VARCHAR(100);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS location_state VARCHAR(50);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS location_postal_code VARCHAR(20);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS location_country VARCHAR(100);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time TIME;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/New_York';
  ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_contact_name VARCHAR(255);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_contact_phone VARCHAR(50);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_contact_email VARCHAR(255);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS min_ambassadors INTEGER DEFAULT 1;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS max_ambassadors INTEGER;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS required_skill_level ambassador_skill_level;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS notes TEXT;
END $$;

-- Ensure status enum has WO-133 values
DO $$
DECLARE
  has_planned BOOLEAN;
  has_confirmed BOOLEAN;
  has_active BOOLEAN;
  has_completed BOOLEAN;
  has_cancelled BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'event_status' AND e.enumlabel = 'planned'
  ) INTO has_planned;

  SELECT EXISTS(
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'event_status' AND e.enumlabel = 'confirmed'
  ) INTO has_confirmed;

  SELECT EXISTS(
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'event_status' AND e.enumlabel = 'active'
  ) INTO has_active;

  SELECT EXISTS(
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'event_status' AND e.enumlabel = 'completed'
  ) INTO has_completed;

  SELECT EXISTS(
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'event_status' AND e.enumlabel = 'cancelled'
  ) INTO has_cancelled;

  IF NOT (has_planned AND has_confirmed AND has_active AND has_completed AND has_cancelled) THEN
    CREATE TYPE event_status_wo133 AS ENUM ('planned', 'confirmed', 'active', 'completed', 'cancelled');

    ALTER TABLE events
      ALTER COLUMN status DROP DEFAULT,
      ALTER COLUMN status TYPE event_status_wo133
      USING (
        CASE
          WHEN status::text IN ('scheduled', 'draft') THEN 'planned'
          WHEN status::text IN ('ready') THEN 'confirmed'
          WHEN status::text IN ('in_progress', 'live') THEN 'active'
          WHEN status::text IN ('done') THEN 'completed'
          WHEN status::text IN ('canceled') THEN 'cancelled'
          ELSE status::text
        END
      )::event_status_wo133,
      ALTER COLUMN status SET DEFAULT 'planned';

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'event_state_history' AND column_name = 'from_status'
    ) THEN
      ALTER TABLE event_state_history
        ALTER COLUMN from_status TYPE event_status_wo133
        USING (
          CASE
            WHEN from_status IS NULL THEN NULL
            WHEN from_status::text IN ('scheduled', 'draft') THEN 'planned'
            WHEN from_status::text IN ('ready') THEN 'confirmed'
            WHEN from_status::text IN ('in_progress', 'live') THEN 'active'
            WHEN from_status::text IN ('done') THEN 'completed'
            WHEN from_status::text IN ('canceled') THEN 'cancelled'
            ELSE from_status::text
          END
        )::event_status_wo133,
        ALTER COLUMN to_status TYPE event_status_wo133
        USING (
          CASE
            WHEN to_status::text IN ('scheduled', 'draft') THEN 'planned'
            WHEN to_status::text IN ('ready') THEN 'confirmed'
            WHEN to_status::text IN ('in_progress', 'live') THEN 'active'
            WHEN to_status::text IN ('done') THEN 'completed'
            WHEN to_status::text IN ('canceled') THEN 'cancelled'
            ELSE to_status::text
          END
        )::event_status_wo133;
    END IF;

    DROP TYPE event_status;
    ALTER TYPE event_status_wo133 RENAME TO event_status;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);

-- DOWN

DROP INDEX IF EXISTS idx_events_event_date;
DROP INDEX IF EXISTS idx_events_event_type;

DO $$
BEGIN
  ALTER TABLE events DROP COLUMN IF EXISTS location_name;
  ALTER TABLE events DROP COLUMN IF EXISTS location_address_line_1;
  ALTER TABLE events DROP COLUMN IF EXISTS location_address_line_2;
  ALTER TABLE events DROP COLUMN IF EXISTS location_city;
  ALTER TABLE events DROP COLUMN IF EXISTS location_state;
  ALTER TABLE events DROP COLUMN IF EXISTS location_postal_code;
  ALTER TABLE events DROP COLUMN IF EXISTS location_country;
  ALTER TABLE events DROP COLUMN IF EXISTS timezone;
  ALTER TABLE events DROP COLUMN IF EXISTS venue_contact_name;
  ALTER TABLE events DROP COLUMN IF EXISTS venue_contact_phone;
  ALTER TABLE events DROP COLUMN IF EXISTS venue_contact_email;
  ALTER TABLE events DROP COLUMN IF EXISTS min_ambassadors;
  ALTER TABLE events DROP COLUMN IF EXISTS max_ambassadors;
  ALTER TABLE events DROP COLUMN IF EXISTS required_skill_level;
  ALTER TABLE events DROP COLUMN IF EXISTS cancelled_at;
  ALTER TABLE events DROP COLUMN IF EXISTS cancelled_reason;
  ALTER TABLE events DROP COLUMN IF EXISTS completed_at;

  -- Keep notes/start_time if these are part of base schema in current env.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE events DROP COLUMN event_type;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'title'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'name'
  ) THEN
    ALTER TABLE events RENAME COLUMN title TO name;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'event_date'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'scheduled_date'
  ) THEN
    ALTER TABLE events RENAME COLUMN event_date TO scheduled_date;
  END IF;
END $$;

DROP TYPE IF EXISTS event_type;
