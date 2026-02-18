-- Event Management Extended Schema
-- WO-28: Event Management data models and state machine

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE event_type AS ENUM ('activation', 'promotion', 'tournament', 'watch_party', 'corporate', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE assignment_status AS ENUM ('pending', 'confirmed', 'declined', 'cancelled', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- ALTER EXISTING EVENTS TABLE
-- ============================================

-- Add columns if they don't exist
DO $$ BEGIN
    ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type event_type DEFAULT 'activation';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_contact_name VARCHAR(255);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_contact_phone VARCHAR(50);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_contact_email VARCHAR(255);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS expected_attendance INTEGER;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS actual_attendance INTEGER;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS budget DECIMAL(10, 2);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(10, 2);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS min_ambassadors INTEGER DEFAULT 1;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS max_ambassadors INTEGER;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS required_skill_level ambassador_skill_level;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS region VARCHAR(100);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/New_York';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES events(id);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
END $$;

-- ============================================
-- NEW TABLES
-- ============================================

-- Event State History: Track state machine transitions
CREATE TABLE IF NOT EXISTS event_state_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    from_status event_status,
    to_status event_status NOT NULL,
    changed_by UUID,
    change_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event Checklists: Pre-event tasks
CREATE TABLE IF NOT EXISTS event_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_by UUID,
    completed_at TIMESTAMPTZ,
    due_date DATE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event Operators: Which operators are being promoted at event
CREATE TABLE IF NOT EXISTS event_operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    promo_materials TEXT,
    special_instructions TEXT,
    signup_goal INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_event_operator UNIQUE (event_id, operator_id)
);

-- Event Materials: Supplies needed for event
CREATE TABLE IF NOT EXISTS event_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    material_name VARCHAR(255) NOT NULL,
    quantity INTEGER DEFAULT 1,
    is_provided BOOLEAN DEFAULT false,
    provided_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event Notes: Team notes and updates
CREATE TABLE IF NOT EXISTS event_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    author_id UUID,
    note_type VARCHAR(50) DEFAULT 'general',  -- 'general', 'issue', 'update', 'internal'
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event Metrics: Post-event performance tracking
CREATE TABLE IF NOT EXISTS event_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    total_signups INTEGER DEFAULT 0,
    validated_signups INTEGER DEFAULT 0,
    total_ambassadors INTEGER DEFAULT 0,
    total_hours DECIMAL(8, 2) DEFAULT 0,
    total_cost DECIMAL(10, 2) DEFAULT 0,
    cost_per_signup DECIMAL(10, 2),
    revenue_attributed DECIMAL(12, 2),
    roi DECIMAL(8, 2),
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_event_metrics UNIQUE (event_id)
);

-- ALTER event_assignments to add more fields
DO $$ BEGIN
    ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS status assignment_status DEFAULT 'pending';
    ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
    ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS declined_reason TEXT;
    ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS pay_rate DECIMAL(10, 2);
    ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS bonus_amount DECIMAL(10, 2);
    ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS total_signups INTEGER DEFAULT 0;
END $$;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_region ON events(region);
CREATE INDEX IF NOT EXISTS idx_events_recurring ON events(is_recurring) WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_state_history_event ON event_state_history(event_id);
CREATE INDEX IF NOT EXISTS idx_state_history_created ON event_state_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checklists_event ON event_checklists(event_id);
CREATE INDEX IF NOT EXISTS idx_checklists_pending ON event_checklists(is_completed) WHERE is_completed = false;

CREATE INDEX IF NOT EXISTS idx_event_operators_event ON event_operators(event_id);
CREATE INDEX IF NOT EXISTS idx_event_operators_operator ON event_operators(operator_id);

CREATE INDEX IF NOT EXISTS idx_event_notes_event ON event_notes(event_id);
CREATE INDEX IF NOT EXISTS idx_event_notes_pinned ON event_notes(is_pinned) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS idx_assignments_status ON event_assignments(status);
