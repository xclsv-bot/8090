-- WO-92: Historical Sign-Up Import
-- Creates tables for tracking sign-up import jobs

-- ============================================
-- IMPORT LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS signup_import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'processing',
    imported_by VARCHAR(255),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    rollback_at TIMESTAMPTZ,
    
    -- Counts
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    created_signups INTEGER DEFAULT 0,
    skipped_duplicates INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    
    -- Details
    options JSONB,
    errors JSONB,
    warnings JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing/filtering
CREATE INDEX IF NOT EXISTS idx_signup_import_logs_status ON signup_import_logs(status);
CREATE INDEX IF NOT EXISTS idx_signup_import_logs_started ON signup_import_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_import_logs_imported_by ON signup_import_logs(imported_by);

-- ============================================
-- ROW DETAIL TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS signup_import_row_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_log_id UUID NOT NULL REFERENCES signup_import_logs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- success, skipped, error
    action VARCHAR(50), -- created, duplicate, etc.
    message TEXT,
    
    -- Resolved references
    signup_id UUID REFERENCES signups(id) ON DELETE SET NULL,
    customer_email VARCHAR(255),
    operator_id INTEGER,
    ambassador_id UUID,
    cpa_applied DECIMAL(10, 2),
    
    -- Raw data
    raw_data JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_signup_import_row_details_log ON signup_import_row_details(import_log_id);
CREATE INDEX IF NOT EXISTS idx_signup_import_row_details_status ON signup_import_row_details(status);
CREATE INDEX IF NOT EXISTS idx_signup_import_row_details_signup ON signup_import_row_details(signup_id);

-- ============================================
-- ADD IMPORT TRACKING TO SIGNUPS
-- ============================================

-- Add import_batch_id to signups if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'signups' AND column_name = 'import_batch_id'
    ) THEN
        ALTER TABLE signups ADD COLUMN import_batch_id UUID REFERENCES signup_import_logs(id) ON DELETE SET NULL;
        CREATE INDEX idx_signups_import_batch ON signups(import_batch_id);
    END IF;
END $$;

-- Add customer_state to signups if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'signups' AND column_name = 'customer_state'
    ) THEN
        ALTER TABLE signups ADD COLUMN customer_state VARCHAR(2);
        CREATE INDEX idx_signups_customer_state ON signups(customer_state);
    END IF;
END $$;

-- Add source_type to signups if not exists (might already exist from WO-66)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'signups' AND column_name = 'source_type'
    ) THEN
        ALTER TABLE signups ADD COLUMN source_type VARCHAR(50) DEFAULT 'event';
    END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE signup_import_logs IS 'Tracks historical sign-up import jobs (WO-92)';
COMMENT ON TABLE signup_import_row_details IS 'Per-row details of sign-up imports (WO-92)';
COMMENT ON COLUMN signups.import_batch_id IS 'References the import job that created this signup (WO-92)';
