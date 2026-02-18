-- Financial Management Schema
-- WO-36: Financial data models and expense attribution system

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE expense_category AS ENUM ('payroll', 'materials', 'travel', 'venue', 'marketing', 'software', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_status AS ENUM ('pending', 'approved', 'rejected', 'paid', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE revenue_type AS ENUM ('cpa', 'rev_share', 'bonus', 'referral', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABLES
-- ============================================

-- Expenses: All platform expenses
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category expense_category NOT NULL,
    description VARCHAR(500) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status expense_status NOT NULL DEFAULT 'pending',
    -- Attribution
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    ambassador_id UUID REFERENCES ambassadors(id) ON DELETE SET NULL,
    pay_period_id UUID REFERENCES pay_periods(id) ON DELETE SET NULL,
    -- Receipts
    receipt_file_key VARCHAR(500),
    receipt_file_name VARCHAR(255),
    vendor_name VARCHAR(255),
    -- Approval workflow
    submitted_by UUID,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    paid_at TIMESTAMPTZ,
    payment_reference VARCHAR(255),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Revenue Records: Track incoming revenue
CREATE TABLE IF NOT EXISTS revenue_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revenue_type revenue_type NOT NULL,
    description VARCHAR(500),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    -- Attribution
    operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    pay_period_id UUID REFERENCES pay_periods(id) ON DELETE SET NULL,
    signup_id UUID REFERENCES signups(id) ON DELETE SET NULL,
    -- Timing
    revenue_date DATE NOT NULL,
    received_at TIMESTAMPTZ,
    -- External reference
    external_reference VARCHAR(255),
    invoice_number VARCHAR(100),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Budget Allocations
CREATE TABLE IF NOT EXISTS budget_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category expense_category NOT NULL,
    allocated_amount DECIMAL(12, 2) NOT NULL,
    spent_amount DECIMAL(12, 2) DEFAULT 0,
    remaining_amount DECIMAL(12, 2),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    -- Scope
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    region VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Financial Reports: Cached report data
CREATE TABLE IF NOT EXISTS financial_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(100) NOT NULL,  -- 'weekly_pnl', 'monthly_summary', 'event_roi'
    report_date DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    total_revenue DECIMAL(14, 2),
    total_expenses DECIMAL(14, 2),
    net_profit DECIMAL(14, 2),
    report_data JSONB,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by UUID
);

-- Expense Approvals: Workflow tracking
CREATE TABLE IF NOT EXISTS expense_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'approved', 'rejected', 'requested_changes'
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_event ON expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_ambassador ON expenses(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_expenses_pay_period ON expenses(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_expenses_submitted ON expenses(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_type ON revenue_records(revenue_type);
CREATE INDEX IF NOT EXISTS idx_revenue_operator ON revenue_records(operator_id);
CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_records(revenue_date);
CREATE INDEX IF NOT EXISTS idx_revenue_event ON revenue_records(event_id);

CREATE INDEX IF NOT EXISTS idx_budget_period ON budget_allocations(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_budget_category ON budget_allocations(category);

CREATE INDEX IF NOT EXISTS idx_reports_type ON financial_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_date ON financial_reports(report_date);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER budget_updated_at
    BEFORE UPDATE ON budget_allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate remaining budget
CREATE OR REPLACE FUNCTION update_budget_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_amount = NEW.allocated_amount - NEW.spent_amount;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER budget_remaining_trigger
    BEFORE INSERT OR UPDATE ON budget_allocations
    FOR EACH ROW EXECUTE FUNCTION update_budget_remaining();
