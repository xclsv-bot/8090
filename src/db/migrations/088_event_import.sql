-- Event Import Schema
-- WO-88: Historical event data import system

-- ============================================
-- EXTEND EXISTING TABLES
-- ============================================

-- Add event-specific columns to financial_import_logs if they don't exist
ALTER TABLE financial_import_logs 
    ADD COLUMN IF NOT EXISTS created_events INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_events INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_performance_records INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duplicates_found INTEGER DEFAULT 0;

-- Add import_type to event_import_logs (reuse existing table)
-- The import_type column already exists, we just add 'historical_events' as a valid value

-- ============================================
-- NEW TABLES
-- ============================================

-- Event Import Audit Log: Track all event import actions for compliance
CREATE TABLE IF NOT EXISTS event_import_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL,  -- References financial_import_logs but no FK for flexibility
    
    -- Action details
    action VARCHAR(100) NOT NULL,  -- 'create_event', 'update_event', 'link_ambassador', etc.
    entity_type VARCHAR(50) NOT NULL,  -- 'event', 'assignment', 'performance_history'
    entity_id UUID,  -- The created/updated entity's ID
    
    -- Details and context
    details JSONB,  -- Structured action details
    
    -- User/timing
    performed_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_event_import_audit_import ON event_import_audit_log(import_id);
CREATE INDEX IF NOT EXISTS idx_event_import_audit_action ON event_import_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_event_import_audit_entity ON event_import_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_event_import_audit_created ON event_import_audit_log(created_at DESC);

-- Index on import_type for filtering event imports
CREATE INDEX IF NOT EXISTS idx_import_logs_historical_events 
    ON financial_import_logs(import_type) 
    WHERE import_type = 'historical_events';
