-- XCLSV Core Platform Database Schema
-- WO-20: Core shared data models

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE event_status AS ENUM ('planned', 'confirmed', 'active', 'completed', 'cancelled');
CREATE TYPE ambassador_skill_level AS ENUM ('trainee', 'standard', 'senior', 'lead');
CREATE TYPE compensation_type AS ENUM ('per_signup', 'hourly', 'hybrid');
CREATE TYPE ambassador_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE validation_status AS ENUM ('pending', 'validated', 'rejected', 'duplicate');
CREATE TYPE pay_period_status AS ENUM ('open', 'closed', 'processing', 'paid');
CREATE TYPE bonus_scope AS ENUM ('event', 'ambassador', 'pay_period');

-- ============================================
-- TABLES
-- ============================================

-- Events: Central organizing unit
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue VARCHAR(255),
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    status event_status NOT NULL DEFAULT 'planned',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ambassadors: Team members with compensation structures
CREATE TABLE ambassadors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    skill_level ambassador_skill_level NOT NULL DEFAULT 'trainee',
    compensation_type compensation_type NOT NULL DEFAULT 'per_signup',
    hourly_rate DECIMAL(10, 2),
    per_signup_rate DECIMAL(10, 2),
    status ambassador_status NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pay Periods: Weekly payroll cycles (Monday-Sunday ET)
CREATE TABLE pay_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status pay_period_status NOT NULL DEFAULT 'open',
    total_signups INTEGER DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    processed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- SignUps: Customer registrations via ambassadors
CREATE TABLE signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    pay_period_id UUID REFERENCES pay_periods(id) ON DELETE SET NULL,
    customer_first_name VARCHAR(100) NOT NULL,
    customer_last_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    operator_id INTEGER NOT NULL,
    operator_name VARCHAR(100),
    validation_status validation_status NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event Assignments: Link ambassadors to events
CREATE TABLE event_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    role VARCHAR(100) DEFAULT 'ambassador',
    scheduled_start TIME,
    scheduled_end TIME,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    hours_worked DECIMAL(5, 2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id, ambassador_id)
);

-- Bonus Thresholds: Flexible bonus configuration
CREATE TABLE bonus_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    threshold_count INTEGER NOT NULL,
    bonus_amount DECIMAL(10, 2) NOT NULL,
    scope bonus_scope NOT NULL DEFAULT 'event',
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    ambassador_id UUID REFERENCES ambassadors(id) ON DELETE CASCADE,
    pay_period_id UUID REFERENCES pay_periods(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Events
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_city_state ON events(city, state);

-- Ambassadors
CREATE INDEX idx_ambassadors_email ON ambassadors(email);
CREATE INDEX idx_ambassadors_clerk_id ON ambassadors(clerk_user_id);
CREATE INDEX idx_ambassadors_status ON ambassadors(status);

-- SignUps
CREATE INDEX idx_signups_event ON signups(event_id);
CREATE INDEX idx_signups_ambassador ON signups(ambassador_id);
CREATE INDEX idx_signups_pay_period ON signups(pay_period_id);
CREATE INDEX idx_signups_status ON signups(validation_status);
CREATE INDEX idx_signups_submitted ON signups(submitted_at);
CREATE INDEX idx_signups_operator ON signups(operator_id);

-- Pay Periods
CREATE INDEX idx_pay_periods_dates ON pay_periods(start_date, end_date);
CREATE INDEX idx_pay_periods_status ON pay_periods(status);

-- Event Assignments
CREATE INDEX idx_assignments_event ON event_assignments(event_id);
CREATE INDEX idx_assignments_ambassador ON event_assignments(ambassador_id);

-- Bonus Thresholds
CREATE INDEX idx_bonus_scope ON bonus_thresholds(scope);
CREATE INDEX idx_bonus_active ON bonus_thresholds(is_active);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ambassadors_updated_at
    BEFORE UPDATE ON ambassadors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
