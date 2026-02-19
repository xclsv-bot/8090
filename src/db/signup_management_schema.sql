-- Sign-Up Management Extended Schema
-- WO-66: Sign-up management data models and database extensions
-- Phase 10: AI extraction, Customer.io sync, and audit tracking

-- ============================================
-- NEW ENUM TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE signup_source_type AS ENUM ('event', 'solo');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE extraction_status AS ENUM ('pending', 'reviewed', 'confirmed', 'skipped');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sync_phase AS ENUM ('initial', 'enriched');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE signup_audit_action AS ENUM (
        'submitted',
        'duplicate_detected',
        'extraction_started',
        'extraction_completed',
        'extraction_failed',
        'extraction_reviewed',
        'customerio_synced',
        'customerio_sync_failed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- EXTEND SIGNUPS TABLE
-- ============================================

-- Add new columns to support sign-up management
DO $$ BEGIN
    -- Source tracking
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS source_type signup_source_type DEFAULT 'event';
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS solo_chat_id UUID;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
    
    -- AI extraction fields
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS extraction_status extraction_status DEFAULT 'pending';
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS extraction_confidence DECIMAL(5, 2);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS bet_amount DECIMAL(12, 2);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS team_bet_on VARCHAR(255);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS odds VARCHAR(50);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS extraction_reviewed_by UUID REFERENCES ambassadors(id);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS extraction_reviewed_at TIMESTAMPTZ;
    
    -- Customer.io sync fields
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customerio_synced BOOLEAN DEFAULT false;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customerio_synced_at TIMESTAMPTZ;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customerio_contact_id VARCHAR(255);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customerio_sync_failed BOOLEAN DEFAULT false;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customerio_sync_error TEXT;
    
    -- Image reference (S3)
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS image_url VARCHAR(1024);
    
    -- CPA locking
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS cpa_applied DECIMAL(10, 2);
    
    -- Updated at for tracking changes
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
END $$;

-- ============================================
-- SIGNUP EXTRACTION JOB TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS signup_extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    status job_status NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    ai_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_signup_extraction_job UNIQUE (signup_id)
);

COMMENT ON TABLE signup_extraction_jobs IS 'Tracks AI extraction jobs for bet slip image processing';
COMMENT ON COLUMN signup_extraction_jobs.ai_response IS 'Full AI service response for debugging and audit';

-- ============================================
-- SIGNUP CUSTOMERIO SYNC JOB TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS signup_customerio_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    status job_status NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    sync_phase sync_phase NOT NULL DEFAULT 'initial',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE signup_customerio_sync_jobs IS 'Tracks Customer.io sync jobs with two-phase support';
COMMENT ON COLUMN signup_customerio_sync_jobs.sync_phase IS 'initial = after submission, enriched = after extraction confirmation';

-- Index for finding jobs by signup (allow multiple per signup for different phases)
CREATE INDEX IF NOT EXISTS idx_customerio_sync_signup_phase 
    ON signup_customerio_sync_jobs(signup_id, sync_phase);

-- Unique constraint for signup_id + sync_phase combination (for upsert support)
-- This allows one job per phase per signup
DO $$ BEGIN
    ALTER TABLE signup_customerio_sync_jobs 
        ADD CONSTRAINT unique_signup_customerio_sync_phase UNIQUE (signup_id, sync_phase);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- SIGNUP AUDIT LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS signup_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    action signup_audit_action NOT NULL,
    user_id UUID REFERENCES ambassadors(id),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE signup_audit_log IS 'Records all significant sign-up actions for accountability and debugging';

-- ============================================
-- IDEMPOTENCY KEY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS signup_idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE signup_idempotency_keys IS 'Maps idempotency keys to sign-up records for deduplication';
COMMENT ON COLUMN signup_idempotency_keys.expires_at IS '24 hours after creation for automatic cleanup';

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Sign-Up table indexes for new columns
CREATE INDEX IF NOT EXISTS idx_signups_source_type ON signups(source_type);
CREATE INDEX IF NOT EXISTS idx_signups_solo_chat ON signups(solo_chat_id) WHERE solo_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signups_idempotency ON signups(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signups_extraction_status ON signups(extraction_status);
CREATE INDEX IF NOT EXISTS idx_signups_customerio_synced ON signups(customerio_synced);
CREATE INDEX IF NOT EXISTS idx_signups_customerio_sync_failed ON signups(customerio_sync_failed) WHERE customerio_sync_failed = true;

-- Duplicate detection index (email + operator_id + date in UTC)
-- This supports the query: email + operator + DATE(submitted_at AT TIME ZONE 'UTC')
CREATE INDEX IF NOT EXISTS idx_signups_duplicate_detection 
    ON signups(customer_email, operator_id, (DATE(submitted_at AT TIME ZONE 'UTC')));

-- Extraction review queue - prioritize by confidence (low first) and pending status
CREATE INDEX IF NOT EXISTS idx_signups_extraction_review_queue 
    ON signups(extraction_confidence ASC NULLS LAST, submitted_at DESC) 
    WHERE extraction_status = 'pending';

-- Extraction job indexes
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_signup ON signup_extraction_jobs(signup_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON signup_extraction_jobs(status);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_retry ON signup_extraction_jobs(next_retry_at) 
    WHERE status = 'pending' AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_pending ON signup_extraction_jobs(created_at) 
    WHERE status = 'pending';

-- Customer.io sync job indexes
CREATE INDEX IF NOT EXISTS idx_customerio_jobs_signup ON signup_customerio_sync_jobs(signup_id);
CREATE INDEX IF NOT EXISTS idx_customerio_jobs_status ON signup_customerio_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_customerio_jobs_retry ON signup_customerio_sync_jobs(next_retry_at) 
    WHERE status IN ('pending', 'failed') AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customerio_jobs_failed ON signup_customerio_sync_jobs(updated_at DESC) 
    WHERE status = 'failed';

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_signup ON signup_audit_log(signup_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON signup_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON signup_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON signup_audit_log(user_id) WHERE user_id IS NOT NULL;

-- Idempotency key indexes
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON signup_idempotency_keys(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON signup_idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_signup ON signup_idempotency_keys(signup_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at for signups table
DO $$ BEGIN
    CREATE TRIGGER signups_updated_at
        BEFORE UPDATE ON signups
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at for extraction jobs
DO $$ BEGIN
    CREATE TRIGGER extraction_jobs_updated_at
        BEFORE UPDATE ON signup_extraction_jobs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at for customerio sync jobs
DO $$ BEGIN
    CREATE TRIGGER customerio_sync_jobs_updated_at
        BEFORE UPDATE ON signup_customerio_sync_jobs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- CONSTRAINTS
-- ============================================

-- Ensure extraction_confidence is between 0 and 100 when set
DO $$ BEGIN
    ALTER TABLE signups ADD CONSTRAINT chk_extraction_confidence 
        CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 100));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Ensure bet_amount is positive when set
DO $$ BEGIN
    ALTER TABLE signups ADD CONSTRAINT chk_bet_amount_positive 
        CHECK (bet_amount IS NULL OR bet_amount >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Ensure cpa_applied is non-negative when set
DO $$ BEGIN
    ALTER TABLE signups ADD CONSTRAINT chk_cpa_applied_nonnegative 
        CHECK (cpa_applied IS NULL OR cpa_applied >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Ensure attempt counts are non-negative
DO $$ BEGIN
    ALTER TABLE signup_extraction_jobs ADD CONSTRAINT chk_extraction_attempt_count 
        CHECK (attempt_count >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE signup_customerio_sync_jobs ADD CONSTRAINT chk_sync_attempt_count 
        CHECK (attempt_count >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
