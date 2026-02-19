-- Historical Data Import Schema Migration
-- Work Order: WO-77
-- Database: PostgreSQL (Neon)
-- Created: 2025-02-19
--
-- This migration creates all tables required for the historical data import feature.
-- Run with: psql $DATABASE_URL -f 001_create_historical_import_tables.sql

BEGIN;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE ambassador_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE event_status AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE operator_type AS ENUM ('SPORTSBOOK', 'CASINO', 'DFS', 'POKER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE operator_status AS ENUM ('ACTIVE', 'INACTIVE', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE venue_type AS ENUM ('STADIUM', 'ARENA', 'BAR', 'RESTAURANT', 'CASINO', 'CONVENTION_CENTER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE venue_status AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE import_job_status AS ENUM ('PENDING', 'PARSING', 'PARSED', 'VALIDATING', 'VALIDATED', 'RECONCILING', 'RECONCILED', 'AWAITING_CONFIRMATION', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE import_phase AS ENUM ('UPLOAD', 'PARSE', 'VALIDATE', 'RECONCILE', 'CONFIRM', 'EXECUTE', 'COMPLETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE import_data_type AS ENUM ('SIGN_UPS', 'BUDGETS_ACTUALS', 'PAYROLL', 'AMBASSADORS', 'EVENTS', 'EVENT_ASSIGNMENTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE validation_mode AS ENUM ('STRICT', 'PERMISSIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE validation_status AS ENUM ('PENDING', 'VALID', 'INVALID', 'WARNING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE reconciliation_status AS ENUM ('PENDING', 'MATCHED', 'AMBIGUOUS', 'NEW_RECORD', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE record_import_status AS ENUM ('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE entity_type AS ENUM ('AMBASSADOR', 'EVENT', 'OPERATOR', 'VENUE', 'SIGN_UP', 'BUDGET', 'PAYROLL', 'EVENT_ASSIGNMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE match_type AS ENUM ('EXACT', 'FUZZY', 'NEW_RECORD', 'AMBIGUOUS', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE reconciliation_decision AS ENUM ('USE_EXISTING', 'CREATE_NEW', 'MERGE', 'SKIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE import_operation AS ENUM ('CREATE', 'UPDATE', 'LINK', 'SKIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'IMPORT_STARTED', 'FILE_UPLOADED', 'FILE_PARSED', 'VALIDATION_STARTED', 
        'VALIDATION_COMPLETED', 'RECONCILIATION_STARTED', 'RECONCILIATION_DECISION', 
        'RECONCILIATION_COMPLETED', 'IMPORT_CONFIRMED', 'IMPORT_EXECUTED', 
        'IMPORT_COMPLETED', 'IMPORT_FAILED', 'IMPORT_CANCELLED', 'RECORD_CREATED', 
        'RECORD_UPDATED', 'RECORD_LINKED', 'RECORD_SKIPPED', 'USER_OVERRIDE',
        'ROLLBACK_INITIATED', 'ROLLBACK_COMPLETED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE audit_severity AS ENUM ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE sign_up_status AS ENUM ('PENDING', 'VERIFIED', 'FTD_COMPLETE', 'DISPUTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE budget_record_type AS ENUM ('BUDGET', 'ACTUAL', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payroll_status AS ENUM ('PENDING', 'APPROVED', 'PAID', 'DISPUTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE assignment_status AS ENUM ('ASSIGNED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- MASTER ENTITY TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS ambassadors (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    external_id TEXT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    status ambassador_status NOT NULL DEFAULT 'ACTIVE',
    tier TEXT,
    referral_code TEXT UNIQUE,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_import TEXT
);

CREATE INDEX IF NOT EXISTS idx_ambassadors_email ON ambassadors(email);
CREATE INDEX IF NOT EXISTS idx_ambassadors_name ON ambassadors(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_ambassadors_referral_code ON ambassadors(referral_code);
CREATE INDEX IF NOT EXISTS idx_ambassadors_status ON ambassadors(status);
CREATE INDEX IF NOT EXISTS idx_ambassadors_created_by_import ON ambassadors(created_by_import);

CREATE TABLE IF NOT EXISTS operators (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    external_id TEXT UNIQUE,
    name TEXT NOT NULL,
    short_name TEXT,
    type operator_type NOT NULL DEFAULT 'SPORTSBOOK',
    website TEXT,
    affiliate_url TEXT,
    status operator_status NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_import TEXT
);

CREATE INDEX IF NOT EXISTS idx_operators_name ON operators(name);
CREATE INDEX IF NOT EXISTS idx_operators_short_name ON operators(short_name);
CREATE INDEX IF NOT EXISTS idx_operators_status ON operators(status);
CREATE INDEX IF NOT EXISTS idx_operators_created_by_import ON operators(created_by_import);

CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    external_id TEXT UNIQUE,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    capacity INTEGER,
    type venue_type NOT NULL DEFAULT 'OTHER',
    status venue_status NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_import TEXT
);

CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(name);
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(city, state);
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status);
CREATE INDEX IF NOT EXISTS idx_venues_created_by_import ON venues(created_by_import);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    external_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    status event_status NOT NULL DEFAULT 'SCHEDULED',
    venue_id TEXT REFERENCES venues(id),
    operator_id TEXT REFERENCES operators(id),
    budget DECIMAL(12, 2),
    actual_spend DECIMAL(12, 2),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_import TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_operator_id ON events(operator_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_by_import ON events(created_by_import);

-- =============================================================================
-- IMPORT JOB TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    job_number SERIAL UNIQUE,
    file_name TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT,
    
    status import_job_status NOT NULL DEFAULT 'PENDING',
    phase import_phase NOT NULL DEFAULT 'UPLOAD',
    
    data_types import_data_type[] NOT NULL DEFAULT '{}',
    validation_mode validation_mode NOT NULL DEFAULT 'STRICT',
    
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

CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_phase ON import_jobs(phase);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON import_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_file_hash ON import_jobs(file_hash);

-- =============================================================================
-- PARSED RECORDS (Staging Table)
-- =============================================================================

CREATE TABLE IF NOT EXISTS parsed_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    record_type import_data_type NOT NULL,
    
    raw_data JSONB NOT NULL,
    normalized_data JSONB,
    
    validation_status validation_status NOT NULL DEFAULT 'PENDING',
    validation_errors JSONB,
    validation_warnings JSONB,
    
    reconciliation_status reconciliation_status NOT NULL DEFAULT 'PENDING',
    
    import_status record_import_status NOT NULL DEFAULT 'PENDING',
    imported_entity_id TEXT,
    imported_entity_type TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parsed_records_import_job_id ON parsed_records(import_job_id);
CREATE INDEX IF NOT EXISTS idx_parsed_records_row_number ON parsed_records(row_number);
CREATE INDEX IF NOT EXISTS idx_parsed_records_record_type ON parsed_records(record_type);
CREATE INDEX IF NOT EXISTS idx_parsed_records_validation_status ON parsed_records(validation_status);
CREATE INDEX IF NOT EXISTS idx_parsed_records_reconciliation_status ON parsed_records(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_parsed_records_import_status ON parsed_records(import_status);
CREATE INDEX IF NOT EXISTS idx_parsed_records_job_validation ON parsed_records(import_job_id, validation_status);

-- =============================================================================
-- RECONCILIATION MATCHES
-- =============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_matches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    parsed_record_id TEXT REFERENCES parsed_records(id) ON DELETE SET NULL,
    
    entity_type entity_type NOT NULL,
    imported_value TEXT NOT NULL,
    imported_fields JSONB,
    
    match_type match_type NOT NULL,
    match_confidence REAL,
    match_method TEXT,
    
    matched_ambassador_id TEXT REFERENCES ambassadors(id),
    matched_event_id TEXT REFERENCES events(id),
    matched_operator_id TEXT REFERENCES operators(id),
    matched_venue_id TEXT REFERENCES venues(id),
    
    candidate_matches JSONB,
    
    user_decision reconciliation_decision,
    decision_notes TEXT,
    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    
    final_entity_id TEXT,
    was_created BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_import_job_id ON reconciliation_matches(import_job_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_parsed_record_id ON reconciliation_matches(parsed_record_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_entity_type ON reconciliation_matches(entity_type);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_match_type ON reconciliation_matches(match_type);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_user_decision ON reconciliation_matches(user_decision);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_ambassador ON reconciliation_matches(matched_ambassador_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_event ON reconciliation_matches(matched_event_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_operator ON reconciliation_matches(matched_operator_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_venue ON reconciliation_matches(matched_venue_id);

-- =============================================================================
-- IMPORT RESULTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS import_results (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    entity_type entity_type NOT NULL,
    entity_id TEXT NOT NULL,
    operation import_operation NOT NULL,
    
    parsed_record_ids TEXT[] NOT NULL DEFAULT '{}',
    row_numbers INTEGER[] NOT NULL DEFAULT '{}',
    
    imported_data JSONB NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_results_import_job_id ON import_results(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_results_entity_type ON import_results(entity_type);
CREATE INDEX IF NOT EXISTS idx_import_results_entity_id ON import_results(entity_id);
CREATE INDEX IF NOT EXISTS idx_import_results_operation ON import_results(operation);

-- =============================================================================
-- AUDIT TRAIL
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_trail_entries (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_job_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL,
    
    action audit_action NOT NULL,
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
    
    severity audit_severity NOT NULL DEFAULT 'INFO',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_import_job_id ON audit_trail_entries(import_job_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail_entries(action);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail_entries(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON audit_trail_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_severity ON audit_trail_entries(severity);

-- =============================================================================
-- BUSINESS DATA TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS sign_ups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    ambassador_id TEXT NOT NULL REFERENCES ambassadors(id),
    event_id TEXT REFERENCES events(id),
    operator_id TEXT NOT NULL REFERENCES operators(id),
    
    sign_up_date TIMESTAMPTZ NOT NULL,
    ftd_date TIMESTAMPTZ,
    ftd_amount DECIMAL(12, 2),
    
    customer_name TEXT,
    customer_email TEXT,
    customer_state TEXT,
    
    status sign_up_status NOT NULL DEFAULT 'PENDING',
    commission_rate DECIMAL(5, 4),
    commission_amount DECIMAL(12, 2),
    
    source TEXT,
    notes TEXT,
    metadata JSONB,
    
    import_job_id TEXT,
    imported_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sign_ups_ambassador_id ON sign_ups(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_sign_ups_event_id ON sign_ups(event_id);
CREATE INDEX IF NOT EXISTS idx_sign_ups_operator_id ON sign_ups(operator_id);
CREATE INDEX IF NOT EXISTS idx_sign_ups_sign_up_date ON sign_ups(sign_up_date);
CREATE INDEX IF NOT EXISTS idx_sign_ups_status ON sign_ups(status);
CREATE INDEX IF NOT EXISTS idx_sign_ups_import_job_id ON sign_ups(import_job_id);

CREATE TABLE IF NOT EXISTS budget_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    event_id TEXT NOT NULL REFERENCES events(id),
    
    record_type budget_record_type NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    
    budget_amount DECIMAL(12, 2),
    actual_amount DECIMAL(12, 2),
    variance DECIMAL(12, 2),
    
    effective_date TIMESTAMPTZ NOT NULL,
    notes TEXT,
    metadata JSONB,
    
    import_job_id TEXT,
    imported_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_records_event_id ON budget_records(event_id);
CREATE INDEX IF NOT EXISTS idx_budget_records_record_type ON budget_records(record_type);
CREATE INDEX IF NOT EXISTS idx_budget_records_category ON budget_records(category);
CREATE INDEX IF NOT EXISTS idx_budget_records_effective_date ON budget_records(effective_date);
CREATE INDEX IF NOT EXISTS idx_budget_records_import_job_id ON budget_records(import_job_id);

CREATE TABLE IF NOT EXISTS payroll_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    ambassador_id TEXT NOT NULL REFERENCES ambassadors(id),
    
    pay_period_start TIMESTAMPTZ NOT NULL,
    pay_period_end TIMESTAMPTZ NOT NULL,
    payment_date TIMESTAMPTZ,
    
    gross_amount DECIMAL(12, 2) NOT NULL,
    deductions DECIMAL(12, 2) NOT NULL DEFAULT 0,
    net_amount DECIMAL(12, 2) NOT NULL,
    
    status payroll_status NOT NULL DEFAULT 'PENDING',
    payment_method TEXT,
    payment_reference TEXT,
    
    breakdown JSONB,
    notes TEXT,
    metadata JSONB,
    
    import_job_id TEXT,
    imported_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_records_ambassador_id ON payroll_records(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_pay_period ON payroll_records(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON payroll_records(status);
CREATE INDEX IF NOT EXISTS idx_payroll_records_payment_date ON payroll_records(payment_date);
CREATE INDEX IF NOT EXISTS idx_payroll_records_import_job_id ON payroll_records(import_job_id);

CREATE TABLE IF NOT EXISTS event_assignments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    event_id TEXT NOT NULL REFERENCES events(id),
    ambassador_id TEXT NOT NULL REFERENCES ambassadors(id),
    
    role TEXT NOT NULL,
    hours_worked DECIMAL(5, 2),
    hourly_rate DECIMAL(8, 2),
    total_pay DECIMAL(12, 2),
    
    status assignment_status NOT NULL DEFAULT 'ASSIGNED',
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    
    notes TEXT,
    metadata JSONB,
    
    import_job_id TEXT,
    imported_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(event_id, ambassador_id)
);

CREATE INDEX IF NOT EXISTS idx_event_assignments_event_id ON event_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_ambassador_id ON event_assignments(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_status ON event_assignments(status);
CREATE INDEX IF NOT EXISTS idx_event_assignments_import_job_id ON event_assignments(import_job_id);

-- =============================================================================
-- TRIGGERS FOR updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
DO $$ 
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
        AND table_name IN (
            'ambassadors', 'operators', 'venues', 'events',
            'import_jobs', 'parsed_records', 'reconciliation_matches',
            'sign_ups', 'budget_records', 'payroll_records', 'event_assignments'
        )
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END $$;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE ambassadors IS 'Master table for brand ambassadors who generate signups';
COMMENT ON TABLE operators IS 'Master table for sportsbook/casino operators';
COMMENT ON TABLE venues IS 'Master table for event venues';
COMMENT ON TABLE events IS 'Master table for events where signups occur';
COMMENT ON TABLE import_jobs IS 'Tracks historical data import jobs through their lifecycle';
COMMENT ON TABLE parsed_records IS 'Staging table for validated records before final import';
COMMENT ON TABLE reconciliation_matches IS 'Records entity matching decisions during import';
COMMENT ON TABLE import_results IS 'Final imported records linked to their import jobs';
COMMENT ON TABLE audit_trail_entries IS 'Complete audit history for compliance and troubleshooting';
COMMENT ON TABLE sign_ups IS 'Customer signups attributed to ambassadors';
COMMENT ON TABLE budget_records IS 'Event budget and actual spend records';
COMMENT ON TABLE payroll_records IS 'Ambassador payroll records';
COMMENT ON TABLE event_assignments IS 'Ambassador assignments to events';

COMMIT;
