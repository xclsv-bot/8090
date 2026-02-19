-- Historical Data Import - Import-Specific Tables Only
-- Work Order: WO-77
-- Database: PostgreSQL (Neon)
-- 
-- This migration adds ONLY the import-related tables, preserving existing master tables.
-- All enums are prefixed with 'hist_import_' to avoid conflicts.

BEGIN;

-- =============================================================================
-- ENUM TYPES FOR IMPORT SYSTEM (namespaced to avoid conflicts)
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE hist_import_job_status AS ENUM ('PENDING', 'PARSING', 'PARSED', 'VALIDATING', 'VALIDATED', 'RECONCILING', 'RECONCILED', 'AWAITING_CONFIRMATION', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_phase AS ENUM ('UPLOAD', 'PARSE', 'VALIDATE', 'RECONCILE', 'CONFIRM', 'EXECUTE', 'COMPLETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_data_type AS ENUM ('SIGN_UPS', 'BUDGETS_ACTUALS', 'PAYROLL', 'AMBASSADORS', 'EVENTS', 'EVENT_ASSIGNMENTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_validation_mode AS ENUM ('STRICT', 'PERMISSIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_validation_status AS ENUM ('PENDING', 'VALID', 'INVALID', 'WARNING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_reconciliation_status AS ENUM ('PENDING', 'MATCHED', 'AMBIGUOUS', 'NEW_RECORD', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_record_status AS ENUM ('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_entity_type AS ENUM ('AMBASSADOR', 'EVENT', 'OPERATOR', 'VENUE', 'SIGN_UP', 'BUDGET', 'PAYROLL', 'EVENT_ASSIGNMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_match_type AS ENUM ('EXACT', 'FUZZY', 'NEW_RECORD', 'AMBIGUOUS', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_recon_decision AS ENUM ('USE_EXISTING', 'CREATE_NEW', 'MERGE', 'SKIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_operation AS ENUM ('CREATE', 'UPDATE', 'LINK', 'SKIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_audit_action AS ENUM (
        'IMPORT_STARTED', 'FILE_UPLOADED', 'FILE_PARSED', 'VALIDATION_STARTED', 
        'VALIDATION_COMPLETED', 'RECONCILIATION_STARTED', 'RECONCILIATION_DECISION', 
        'RECONCILIATION_COMPLETED', 'IMPORT_CONFIRMED', 'IMPORT_EXECUTED', 
        'IMPORT_COMPLETED', 'IMPORT_FAILED', 'IMPORT_CANCELLED', 'RECORD_CREATED', 
        'RECORD_UPDATED', 'RECORD_LINKED', 'RECORD_SKIPPED', 'USER_OVERRIDE',
        'ROLLBACK_INITIATED', 'ROLLBACK_COMPLETED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hist_import_audit_severity AS ENUM ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- IMPORT JOB TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS hist_import_jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    job_number SERIAL UNIQUE,
    file_name TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT,
    
    status hist_import_job_status NOT NULL DEFAULT 'PENDING',
    phase hist_import_phase NOT NULL DEFAULT 'UPLOAD',
    
    data_types hist_import_data_type[] NOT NULL DEFAULT '{}',
    validation_mode hist_import_validation_mode NOT NULL DEFAULT 'STRICT',
    
    -- Statistics
    total_rows INTEGER,
    parsed_rows INTEGER,
    valid_rows INTEGER,
    invalid_rows INTEGER,
    imported_rows INTEGER,
    skipped_rows INTEGER,
    
    -- Timestamps
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    parsed_at TIMESTAMPTZ,
    validated_at TIMESTAMPTZ,
    reconciled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- User tracking
    created_by TEXT NOT NULL,
    confirmed_by TEXT,
    
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_import_jobs_status ON hist_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_hist_import_jobs_phase ON hist_import_jobs(phase);
CREATE INDEX IF NOT EXISTS idx_hist_import_jobs_created_by ON hist_import_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_hist_import_jobs_created_at ON hist_import_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_hist_import_jobs_file_hash ON hist_import_jobs(file_hash);

-- =============================================================================
-- PARSED RECORDS (Staging Table)
-- =============================================================================

CREATE TABLE IF NOT EXISTS hist_import_parsed_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT NOT NULL REFERENCES hist_import_jobs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    record_type hist_import_data_type NOT NULL,
    
    raw_data JSONB NOT NULL,
    normalized_data JSONB,
    
    validation_status hist_import_validation_status NOT NULL DEFAULT 'PENDING',
    validation_errors JSONB,
    validation_warnings JSONB,
    
    reconciliation_status hist_import_reconciliation_status NOT NULL DEFAULT 'PENDING',
    
    import_status hist_import_record_status NOT NULL DEFAULT 'PENDING',
    imported_entity_id TEXT,
    imported_entity_type TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_parsed_records_job_id ON hist_import_parsed_records(import_job_id);
CREATE INDEX IF NOT EXISTS idx_hist_parsed_records_row_number ON hist_import_parsed_records(row_number);
CREATE INDEX IF NOT EXISTS idx_hist_parsed_records_record_type ON hist_import_parsed_records(record_type);
CREATE INDEX IF NOT EXISTS idx_hist_parsed_records_validation_status ON hist_import_parsed_records(validation_status);
CREATE INDEX IF NOT EXISTS idx_hist_parsed_records_reconciliation_status ON hist_import_parsed_records(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_hist_parsed_records_import_status ON hist_import_parsed_records(import_status);
CREATE INDEX IF NOT EXISTS idx_hist_parsed_records_job_validation ON hist_import_parsed_records(import_job_id, validation_status);

-- =============================================================================
-- RECONCILIATION MATCHES
-- =============================================================================

CREATE TABLE IF NOT EXISTS hist_import_reconciliation_matches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT NOT NULL REFERENCES hist_import_jobs(id) ON DELETE CASCADE,
    parsed_record_id TEXT REFERENCES hist_import_parsed_records(id) ON DELETE SET NULL,
    
    entity_type hist_import_entity_type NOT NULL,
    imported_value TEXT NOT NULL,
    imported_fields JSONB,
    
    match_type hist_import_match_type NOT NULL,
    match_confidence REAL,
    match_method TEXT,
    
    -- References to existing master tables (using TEXT for UUID compatibility)
    matched_ambassador_id TEXT, -- References ambassadors.id (uuid)
    matched_event_id TEXT,      -- References events.id (uuid)
    matched_operator_id TEXT,   -- References operators.id (uuid)
    matched_venue_id TEXT,      -- For future venue table
    
    candidate_matches JSONB,
    
    user_decision hist_import_recon_decision,
    decision_notes TEXT,
    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    
    final_entity_id TEXT,
    was_created BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_job_id ON hist_import_reconciliation_matches(import_job_id);
CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_parsed_record_id ON hist_import_reconciliation_matches(parsed_record_id);
CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_entity_type ON hist_import_reconciliation_matches(entity_type);
CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_match_type ON hist_import_reconciliation_matches(match_type);
CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_user_decision ON hist_import_reconciliation_matches(user_decision);
CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_ambassador ON hist_import_reconciliation_matches(matched_ambassador_id);
CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_event ON hist_import_reconciliation_matches(matched_event_id);
CREATE INDEX IF NOT EXISTS idx_hist_recon_matches_operator ON hist_import_reconciliation_matches(matched_operator_id);

-- =============================================================================
-- IMPORT RESULTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS hist_import_results (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT NOT NULL REFERENCES hist_import_jobs(id) ON DELETE CASCADE,
    entity_type hist_import_entity_type NOT NULL,
    entity_id TEXT NOT NULL,
    operation hist_import_operation NOT NULL,
    
    parsed_record_ids TEXT[] NOT NULL DEFAULT '{}',
    row_numbers INTEGER[] NOT NULL DEFAULT '{}',
    
    imported_data JSONB NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_import_results_job_id ON hist_import_results(import_job_id);
CREATE INDEX IF NOT EXISTS idx_hist_import_results_entity_type ON hist_import_results(entity_type);
CREATE INDEX IF NOT EXISTS idx_hist_import_results_entity_id ON hist_import_results(entity_id);
CREATE INDEX IF NOT EXISTS idx_hist_import_results_operation ON hist_import_results(operation);

-- =============================================================================
-- IMPORT AUDIT TRAIL
-- =============================================================================

CREATE TABLE IF NOT EXISTS hist_import_audit_trail (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT REFERENCES hist_import_jobs(id) ON DELETE SET NULL,
    
    action hist_import_audit_action NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    
    summary TEXT NOT NULL,
    details JSONB,
    previous_state JSONB,
    new_state JSONB,
    
    user_id TEXT NOT NULL,
    user_email TEXT,
    ip_address TEXT,
    user_agent TEXT,
    
    severity hist_import_audit_severity NOT NULL DEFAULT 'INFO',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_audit_trail_job_id ON hist_import_audit_trail(import_job_id);
CREATE INDEX IF NOT EXISTS idx_hist_audit_trail_action ON hist_import_audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_hist_audit_trail_entity ON hist_import_audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_hist_audit_trail_user_id ON hist_import_audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_hist_audit_trail_created_at ON hist_import_audit_trail(created_at);
CREATE INDEX IF NOT EXISTS idx_hist_audit_trail_severity ON hist_import_audit_trail(severity);

-- =============================================================================
-- TRIGGERS FOR updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION hist_import_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to import tables
DROP TRIGGER IF EXISTS update_hist_import_jobs_updated_at ON hist_import_jobs;
CREATE TRIGGER update_hist_import_jobs_updated_at
    BEFORE UPDATE ON hist_import_jobs
    FOR EACH ROW EXECUTE FUNCTION hist_import_update_updated_at();

DROP TRIGGER IF EXISTS update_hist_parsed_records_updated_at ON hist_import_parsed_records;
CREATE TRIGGER update_hist_parsed_records_updated_at
    BEFORE UPDATE ON hist_import_parsed_records
    FOR EACH ROW EXECUTE FUNCTION hist_import_update_updated_at();

DROP TRIGGER IF EXISTS update_hist_recon_matches_updated_at ON hist_import_reconciliation_matches;
CREATE TRIGGER update_hist_recon_matches_updated_at
    BEFORE UPDATE ON hist_import_reconciliation_matches
    FOR EACH ROW EXECUTE FUNCTION hist_import_update_updated_at();

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE hist_import_jobs IS 'Tracks historical data import jobs through their lifecycle';
COMMENT ON TABLE hist_import_parsed_records IS 'Staging table for validated records before final import';
COMMENT ON TABLE hist_import_reconciliation_matches IS 'Records entity matching decisions during import';
COMMENT ON TABLE hist_import_results IS 'Final imported records linked to their import jobs';
COMMENT ON TABLE hist_import_audit_trail IS 'Complete audit history for import compliance and troubleshooting';

COMMIT;
