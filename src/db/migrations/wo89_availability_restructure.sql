-- WO-89: Availability System Restructure Migration
-- Adds timezone support to general availability
-- Adds is_available field to exceptions (allows marking specific dates as available/unavailable)

-- ============================================
-- SCHEMA CHANGES
-- ============================================

-- Add timezone column to general availability
ALTER TABLE ambassador_general_availability 
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/New_York';

-- Add is_available column to exceptions (default false = unavailable, true = available override)
ALTER TABLE ambassador_availability_exceptions
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT false;

-- Update column comments for clarity
COMMENT ON COLUMN ambassador_general_availability.timezone IS 'IANA timezone identifier for this availability pattern';
COMMENT ON COLUMN ambassador_availability_exceptions.is_available IS 'true = available override, false = unavailable exception';

-- Add index for efficient availability lookups
CREATE INDEX IF NOT EXISTS idx_exceptions_is_available 
ON ambassador_availability_exceptions(ambassador_id, exception_date, is_available);

-- ============================================
-- MIGRATION HELPER FUNCTION
-- ============================================

-- Function to migrate old availability data to new structure (idempotent)
CREATE OR REPLACE FUNCTION migrate_availability_data()
RETURNS TABLE(
  ambassadors_migrated INTEGER,
  availability_patterns INTEGER,
  exceptions_updated INTEGER
) AS $$
DECLARE
  v_ambassadors INTEGER := 0;
  v_patterns INTEGER := 0;
  v_exceptions INTEGER := 0;
BEGIN
  -- Update any null timezones to default
  UPDATE ambassador_general_availability 
  SET timezone = 'America/New_York' 
  WHERE timezone IS NULL;
  GET DIAGNOSTICS v_patterns = ROW_COUNT;
  
  -- Update any null is_available to false (unavailable)
  UPDATE ambassador_availability_exceptions 
  SET is_available = false 
  WHERE is_available IS NULL;
  GET DIAGNOSTICS v_exceptions = ROW_COUNT;
  
  -- Count unique ambassadors with availability data
  SELECT COUNT(DISTINCT ambassador_id) INTO v_ambassadors
  FROM ambassador_general_availability;
  
  RETURN QUERY SELECT v_ambassadors, v_patterns, v_exceptions;
END;
$$ LANGUAGE plpgsql;
