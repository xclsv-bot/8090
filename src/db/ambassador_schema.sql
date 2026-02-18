-- Ambassador Management Extended Schema
-- WO-9: Ambassador data models and core database schema

-- ============================================
-- ENUM TYPES (if not exists)
-- ============================================

DO $$ BEGIN
    CREATE TYPE skill_level_change_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'status_change', 'skill_change');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABLES
-- ============================================

-- Ambassador Performance History: 90-day rolling performance tracking
CREATE TABLE IF NOT EXISTS ambassador_performance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_signups INTEGER NOT NULL DEFAULT 0,
    validated_signups INTEGER NOT NULL DEFAULT 0,
    rejected_signups INTEGER NOT NULL DEFAULT 0,
    total_events INTEGER NOT NULL DEFAULT 0,
    total_hours DECIMAL(8, 2) DEFAULT 0,
    performance_score DECIMAL(5, 2),  -- Calculated score 0-100
    validation_rate DECIMAL(5, 2),     -- Percentage of validated signups
    avg_signups_per_event DECIMAL(5, 2),
    notes TEXT,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_period CHECK (period_end >= period_start),
    CONSTRAINT unique_ambassador_period UNIQUE (ambassador_id, period_start, period_end)
);

-- Skill Level Suggestions: Manual confirmation workflow
CREATE TABLE IF NOT EXISTS skill_level_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    current_level ambassador_skill_level NOT NULL,
    suggested_level ambassador_skill_level NOT NULL,
    reason TEXT NOT NULL,
    supporting_data JSONB,  -- Performance metrics that triggered suggestion
    status skill_level_change_status NOT NULL DEFAULT 'pending',
    suggested_by UUID,  -- User who made suggestion (null if system)
    reviewed_by UUID,   -- User who approved/rejected
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT different_levels CHECK (current_level != suggested_level)
);

-- Ambassador Audit Log: Compliance and change tracking
CREATE TABLE IF NOT EXISTS ambassador_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    action audit_action NOT NULL,
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    changed_by UUID,  -- User who made the change
    change_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ambassador Availability Snapshots: Heatmap data storage
CREATE TABLE IF NOT EXISTS ambassador_availability_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    availability_data JSONB NOT NULL,  -- Hourly availability slots
    -- Example: {"slots": [{"hour": 9, "available": true}, {"hour": 10, "available": true}]}
    total_available_hours INTEGER NOT NULL DEFAULT 0,
    preferred_regions TEXT[],  -- Array of preferred city/state
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_ambassador_date UNIQUE (ambassador_id, snapshot_date)
);

-- Ambassador Emergency Contacts (compliance)
CREATE TABLE IF NOT EXISTS ambassador_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    contact_name VARCHAR(200) NOT NULL,
    relationship VARCHAR(100),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ambassador Documents (W9, ID, etc.)
CREATE TABLE IF NOT EXISTS ambassador_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,  -- 'w9', 'id', 'contract', etc.
    file_key VARCHAR(500) NOT NULL,  -- S3 key
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_by UUID,
    verified_at TIMESTAMPTZ,
    verified_by UUID,
    expires_at DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Performance History
CREATE INDEX IF NOT EXISTS idx_perf_history_ambassador ON ambassador_performance_history(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_perf_history_period ON ambassador_performance_history(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_perf_history_score ON ambassador_performance_history(performance_score DESC);

-- Skill Level Suggestions
CREATE INDEX IF NOT EXISTS idx_skill_suggestions_ambassador ON skill_level_suggestions(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_skill_suggestions_status ON skill_level_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_skill_suggestions_pending ON skill_level_suggestions(status) WHERE status = 'pending';

-- Audit Log
CREATE INDEX IF NOT EXISTS idx_audit_ambassador ON ambassador_audit_log(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON ambassador_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON ambassador_audit_log(created_at DESC);

-- Availability Snapshots
CREATE INDEX IF NOT EXISTS idx_availability_ambassador ON ambassador_availability_snapshots(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_availability_date ON ambassador_availability_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_availability_dow ON ambassador_availability_snapshots(day_of_week);

-- Documents
CREATE INDEX IF NOT EXISTS idx_docs_ambassador ON ambassador_documents(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON ambassador_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_docs_active ON ambassador_documents(is_active) WHERE is_active = true;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at for availability snapshots
CREATE OR REPLACE TRIGGER availability_snapshots_updated_at
    BEFORE UPDATE ON ambassador_availability_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at for emergency contacts
CREATE OR REPLACE TRIGGER emergency_contacts_updated_at
    BEFORE UPDATE ON ambassador_emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
