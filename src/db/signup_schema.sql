-- Sign-Up Management Extended Schema
-- WO-52: Sign-up data models and core submission system

-- ============================================
-- ALTER EXISTING SIGNUPS TABLE
-- ============================================

DO $$ BEGIN
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_address VARCHAR(255);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_city VARCHAR(100);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_state VARCHAR(50);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_zip VARCHAR(20);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS customer_dob DATE;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS bet_slip_image_key VARCHAR(500);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS promo_code_used VARCHAR(100);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS device_type VARCHAR(50);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS ip_address INET;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS user_agent TEXT;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'app';
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS duplicate_of_id UUID REFERENCES signups(id);
END $$;

-- ============================================
-- NEW TABLES
-- ============================================

-- Signup Validation Queue: For manual review
CREATE TABLE IF NOT EXISTS signup_validation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    queue_reason VARCHAR(100) NOT NULL,  -- 'bet_slip_unclear', 'duplicate_check', 'manual_review'
    priority INTEGER DEFAULT 0,
    assigned_to UUID,
    assigned_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_signup_queue UNIQUE (signup_id)
);

-- Signup Status History: Track validation workflow
CREATE TABLE IF NOT EXISTS signup_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    from_status validation_status,
    to_status validation_status NOT NULL,
    changed_by UUID,
    change_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Signup Verification Attempts: Track operator verification
CREATE TABLE IF NOT EXISTS signup_verification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    verification_method VARCHAR(100) NOT NULL,  -- 'api', 'manual', 'file_import'
    verification_result VARCHAR(50),  -- 'success', 'failed', 'pending'
    operator_response JSONB,
    error_message TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Duplicate Detection Log
CREATE TABLE IF NOT EXISTS signup_duplicate_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    matched_signup_id UUID REFERENCES signups(id),
    match_type VARCHAR(100) NOT NULL,  -- 'email', 'phone', 'name_dob', 'bet_slip'
    match_confidence DECIMAL(5, 2),
    is_confirmed_duplicate BOOLEAN,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bulk Import Batches
CREATE TABLE IF NOT EXISTS signup_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(100) NOT NULL,  -- 'whatsapp_scrape', 'csv_import', 'api_sync'
    file_name VARCHAR(255),
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    successful_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    duplicate_records INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    error_log JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link imports to signups
CREATE TABLE IF NOT EXISTS signup_import_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES signup_import_batches(id) ON DELETE CASCADE,
    signup_id UUID REFERENCES signups(id) ON DELETE SET NULL,
    row_number INTEGER,
    raw_data JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_signups_customer_email ON signups(customer_email);
CREATE INDEX IF NOT EXISTS idx_signups_customer_phone ON signups(customer_phone);
CREATE INDEX IF NOT EXISTS idx_signups_external ON signups(external_id);
CREATE INDEX IF NOT EXISTS idx_signups_duplicate ON signups(is_duplicate) WHERE is_duplicate = true;
CREATE INDEX IF NOT EXISTS idx_signups_source ON signups(source);

CREATE INDEX IF NOT EXISTS idx_validation_queue_priority ON signup_validation_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_validation_queue_assigned ON signup_validation_queue(assigned_to);

CREATE INDEX IF NOT EXISTS idx_status_history_signup ON signup_status_history(signup_id);
CREATE INDEX IF NOT EXISTS idx_status_history_created ON signup_status_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_batches_status ON signup_import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_source ON signup_import_batches(source);

CREATE INDEX IF NOT EXISTS idx_import_items_batch ON signup_import_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_items_status ON signup_import_items(status);
