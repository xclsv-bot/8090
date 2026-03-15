-- WO-133: Core Platform Schema Updates
-- 003_update_ambassador_table.sql
-- UP

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ambassadors' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ambassadors' AND column_name = 'clerk_user_id'
  ) THEN
    ALTER TABLE ambassadors RENAME COLUMN user_id TO clerk_user_id;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE ambassadors ALTER COLUMN clerk_user_id DROP NOT NULL;
  ALTER TABLE ambassadors ALTER COLUMN phone DROP NOT NULL;
  ALTER TABLE ambassadors ADD COLUMN IF NOT EXISTS notes TEXT;
END $$;

DO $$
DECLARE
  has_trainee BOOLEAN;
  has_standard BOOLEAN;
  has_senior BOOLEAN;
  has_lead BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ambassador_skill_level' AND e.enumlabel = 'trainee'
  ) INTO has_trainee;
  SELECT EXISTS(
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ambassador_skill_level' AND e.enumlabel = 'standard'
  ) INTO has_standard;
  SELECT EXISTS(
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ambassador_skill_level' AND e.enumlabel = 'senior'
  ) INTO has_senior;
  SELECT EXISTS(
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ambassador_skill_level' AND e.enumlabel = 'lead'
  ) INTO has_lead;

  IF NOT (has_trainee AND has_standard AND has_senior AND has_lead) THEN
    CREATE TYPE ambassador_skill_level_wo133 AS ENUM ('trainee', 'standard', 'senior', 'lead');

    ALTER TABLE ambassadors
      ALTER COLUMN skill_level TYPE ambassador_skill_level_wo133
      USING (
        CASE
          WHEN skill_level::text IN ('junior') THEN 'trainee'
          WHEN skill_level::text IN ('intermediate') THEN 'standard'
          WHEN skill_level::text IN ('expert') THEN 'senior'
          ELSE skill_level::text
        END
      )::ambassador_skill_level_wo133;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'required_skill_level'
    ) THEN
      ALTER TABLE events
        ALTER COLUMN required_skill_level TYPE ambassador_skill_level_wo133
        USING (
          CASE
            WHEN required_skill_level IS NULL THEN NULL
            WHEN required_skill_level::text IN ('junior') THEN 'trainee'
            WHEN required_skill_level::text IN ('intermediate') THEN 'standard'
            WHEN required_skill_level::text IN ('expert') THEN 'senior'
            ELSE required_skill_level::text
          END
        )::ambassador_skill_level_wo133;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'skill_level_suggestions' AND column_name = 'current_level'
    ) THEN
      ALTER TABLE skill_level_suggestions
        ALTER COLUMN current_level TYPE ambassador_skill_level_wo133
        USING (
          CASE
            WHEN current_level::text IN ('junior') THEN 'trainee'
            WHEN current_level::text IN ('intermediate') THEN 'standard'
            WHEN current_level::text IN ('expert') THEN 'senior'
            ELSE current_level::text
          END
        )::ambassador_skill_level_wo133,
        ALTER COLUMN suggested_level TYPE ambassador_skill_level_wo133
        USING (
          CASE
            WHEN suggested_level::text IN ('junior') THEN 'trainee'
            WHEN suggested_level::text IN ('intermediate') THEN 'standard'
            WHEN suggested_level::text IN ('expert') THEN 'senior'
            ELSE suggested_level::text
          END
        )::ambassador_skill_level_wo133;
    END IF;

    DROP TYPE ambassador_skill_level;
    ALTER TYPE ambassador_skill_level_wo133 RENAME TO ambassador_skill_level;
  END IF;
END $$;

-- DOWN

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ambassadors' AND column_name = 'clerk_user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ambassadors' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE ambassadors RENAME COLUMN clerk_user_id TO user_id;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE ambassadors DROP COLUMN IF EXISTS notes;
END $$;
