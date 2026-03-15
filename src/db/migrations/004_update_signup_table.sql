-- WO-133: Core Platform Schema Updates
-- 004_update_signup_table.sql
-- UP

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signups' AND column_name = 'customer_name'
  ) THEN
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_first_name VARCHAR(100);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_last_name VARCHAR(100);

    UPDATE signups
    SET customer_first_name = split_part(customer_name, ' ', 1),
        customer_last_name = COALESCE(NULLIF(substr(customer_name, strpos(customer_name || ' ', ' ') + 1), ''), '')
    WHERE (customer_first_name IS NULL OR customer_last_name IS NULL)
      AND customer_name IS NOT NULL;

    ALTER TABLE signups DROP COLUMN customer_name;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signups' AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signups' AND column_name = 'validation_status'
  ) THEN
    ALTER TABLE signups RENAME COLUMN status TO validation_status;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signup_source_type') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signup_source_type_wo133') THEN
      CREATE TYPE signup_source_type_wo133 AS ENUM ('event', 'import');
    END IF;

    UPDATE signups
    SET source_type = 'event'
    WHERE source_type::text NOT IN ('event', 'import');

    ALTER TABLE signups
      ALTER COLUMN source_type TYPE signup_source_type_wo133
      USING (
        CASE
          WHEN source_type::text = 'import' THEN 'import'
          ELSE 'event'
        END
      )::signup_source_type_wo133,
      ALTER COLUMN source_type SET DEFAULT 'event';

    DROP TYPE signup_source_type;
    ALTER TYPE signup_source_type_wo133 RENAME TO signup_source_type;
  ELSE
    BEGIN
      CREATE TYPE signup_source_type AS ENUM ('event', 'import');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    ALTER TABLE signups ADD COLUMN IF NOT EXISTS source_type signup_source_type DEFAULT 'event';
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE signups ADD COLUMN IF NOT EXISTS import_batch_id UUID;
  ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_state VARCHAR(50);
  ALTER TABLE signups ADD COLUMN IF NOT EXISTS pay_period_id UUID;
  ALTER TABLE signups ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
  ALTER TABLE signups ADD COLUMN IF NOT EXISTS notes TEXT;

  ALTER TABLE signups
    ADD CONSTRAINT signups_pay_period_id_fkey
    FOREIGN KEY (pay_period_id) REFERENCES pay_periods(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE signups ALTER COLUMN event_id DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE signups DROP COLUMN IF EXISTS bet_slip_image_url;
ALTER TABLE signups DROP COLUMN IF EXISTS cpa_amount;

CREATE INDEX IF NOT EXISTS idx_signups_source_type_v2 ON signups(source_type);
CREATE INDEX IF NOT EXISTS idx_signups_import_batch_id ON signups(import_batch_id);

-- DOWN

DROP INDEX IF EXISTS idx_signups_import_batch_id;
DROP INDEX IF EXISTS idx_signups_source_type_v2;

ALTER TABLE signups DROP COLUMN IF EXISTS import_batch_id;
ALTER TABLE signups DROP COLUMN IF EXISTS rejection_reason;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signups' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signups' AND column_name = 'validation_status'
  ) THEN
    ALTER TABLE signups RENAME COLUMN validation_status TO status;
  END IF;
END $$;
