-- Payroll & Compensation Schema
-- WO-47: Payroll data models and calculation engine

-- ============================================
-- ALTER PAY_PERIODS TABLE
-- ============================================

DO $$ BEGIN
    ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS payroll_run_at TIMESTAMPTZ;
    ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS payroll_run_by UUID;
    ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS total_base_pay DECIMAL(12, 2) DEFAULT 0;
    ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS total_bonuses DECIMAL(12, 2) DEFAULT 0;
    ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS total_deductions DECIMAL(12, 2) DEFAULT 0;
    ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS total_net_pay DECIMAL(12, 2) DEFAULT 0;
END $$;

-- ============================================
-- TABLES
-- ============================================

-- Ambassador Pay Statements: Individual pay records per period
CREATE TABLE IF NOT EXISTS ambassador_pay_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    pay_period_id UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
    -- Earnings
    total_signups INTEGER DEFAULT 0,
    validated_signups INTEGER DEFAULT 0,
    total_hours DECIMAL(8, 2) DEFAULT 0,
    base_pay DECIMAL(10, 2) DEFAULT 0,
    signup_pay DECIMAL(10, 2) DEFAULT 0,
    hourly_pay DECIMAL(10, 2) DEFAULT 0,
    -- Bonuses
    event_bonuses DECIMAL(10, 2) DEFAULT 0,
    volume_bonuses DECIMAL(10, 2) DEFAULT 0,
    other_bonuses DECIMAL(10, 2) DEFAULT 0,
    total_bonuses DECIMAL(10, 2) DEFAULT 0,
    -- Deductions
    deductions DECIMAL(10, 2) DEFAULT 0,
    deduction_notes TEXT,
    -- Totals
    gross_pay DECIMAL(10, 2) DEFAULT 0,
    net_pay DECIMAL(10, 2) DEFAULT 0,
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft, approved, paid, disputed
    approved_at TIMESTAMPTZ,
    approved_by UUID,
    paid_at TIMESTAMPTZ,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_ambassador_period UNIQUE (ambassador_id, pay_period_id)
);

-- Pay Statement Line Items: Detailed breakdown
CREATE TABLE IF NOT EXISTS pay_statement_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES ambassador_pay_statements(id) ON DELETE CASCADE,
    line_type VARCHAR(50) NOT NULL,  -- 'signup', 'hourly', 'bonus', 'deduction', 'adjustment'
    description VARCHAR(500) NOT NULL,
    quantity DECIMAL(10, 2),
    rate DECIMAL(10, 2),
    amount DECIMAL(10, 2) NOT NULL,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    signup_id UUID REFERENCES signups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bonus Rules: Configurable bonus calculations
CREATE TABLE IF NOT EXISTS bonus_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(100) NOT NULL,  -- 'volume', 'validation_rate', 'event_completion', 'referral'
    conditions JSONB NOT NULL,  -- {"min_signups": 10, "validation_rate_min": 0.8}
    bonus_amount DECIMAL(10, 2),
    bonus_percentage DECIMAL(5, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_date DATE,
    end_date DATE,
    applies_to VARCHAR(50) DEFAULT 'all',  -- 'all', 'trainee', 'standard', etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment History: Track all payments
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    statement_id UUID REFERENCES ambassador_pay_statements(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,  -- 'ach', 'check', 'venmo', 'paypal', 'cash'
    payment_reference VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, completed, failed, reversed
    processed_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pay Rate History: Track rate changes
CREATE TABLE IF NOT EXISTS pay_rate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    rate_type VARCHAR(50) NOT NULL,  -- 'hourly', 'per_signup'
    old_rate DECIMAL(10, 2),
    new_rate DECIMAL(10, 2) NOT NULL,
    effective_date DATE NOT NULL,
    changed_by UUID,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_statements_ambassador ON ambassador_pay_statements(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_statements_period ON ambassador_pay_statements(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_statements_status ON ambassador_pay_statements(status);

CREATE INDEX IF NOT EXISTS idx_line_items_statement ON pay_statement_line_items(statement_id);
CREATE INDEX IF NOT EXISTS idx_line_items_type ON pay_statement_line_items(line_type);

CREATE INDEX IF NOT EXISTS idx_bonus_rules_active ON bonus_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_bonus_rules_type ON bonus_rules(rule_type);

CREATE INDEX IF NOT EXISTS idx_payment_history_ambassador ON payment_history(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);

CREATE INDEX IF NOT EXISTS idx_rate_history_ambassador ON pay_rate_history(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_rate_history_effective ON pay_rate_history(effective_date);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER statements_updated_at
    BEFORE UPDATE ON ambassador_pay_statements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER bonus_rules_updated_at
    BEFORE UPDATE ON bonus_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
