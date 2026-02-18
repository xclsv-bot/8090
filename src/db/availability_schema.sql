-- Ambassador Availability & Event Scheduling Schema
-- WO-34: Ambassador Availability data model and confirmation system

-- ============================================
-- TABLES
-- ============================================

-- General Availability: Weekly recurring availability
CREATE TABLE IF NOT EXISTS ambassador_general_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    preferred_regions TEXT[],
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT unique_ambassador_day_time UNIQUE (ambassador_id, day_of_week, start_time)
);

-- Availability Exceptions: One-off unavailability
CREATE TABLE IF NOT EXISTS ambassador_availability_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    all_day BOOLEAN DEFAULT true,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_exception UNIQUE (ambassador_id, exception_date, start_time)
);

-- Event Scheduling Requests: Invitations to events
CREATE TABLE IF NOT EXISTS event_scheduling_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    requested_by UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, accepted, declined, expired
    response_deadline TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    decline_reason TEXT,
    priority INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_event_ambassador_request UNIQUE (event_id, ambassador_id)
);

-- Availability Conflicts: Track scheduling conflicts
CREATE TABLE IF NOT EXISTS scheduling_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    conflicting_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    conflict_type VARCHAR(100) NOT NULL,  -- 'double_booked', 'unavailable', 'travel_time'
    resolved BOOLEAN DEFAULT false,
    resolution_notes TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_general_avail_ambassador ON ambassador_general_availability(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_general_avail_day ON ambassador_general_availability(day_of_week);
CREATE INDEX IF NOT EXISTS idx_general_avail_active ON ambassador_general_availability(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_exceptions_ambassador ON ambassador_availability_exceptions(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_date ON ambassador_availability_exceptions(exception_date);

CREATE INDEX IF NOT EXISTS idx_scheduling_event ON event_scheduling_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_ambassador ON event_scheduling_requests(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_status ON event_scheduling_requests(status);
CREATE INDEX IF NOT EXISTS idx_scheduling_pending ON event_scheduling_requests(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_conflicts_ambassador ON scheduling_conflicts(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON scheduling_conflicts(resolved) WHERE resolved = false;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER general_availability_updated_at
    BEFORE UPDATE ON ambassador_general_availability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
