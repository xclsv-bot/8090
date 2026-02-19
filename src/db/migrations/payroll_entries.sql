-- Payroll Entries: Historical and direct payroll records
-- This complements the calculated payroll from signups/assignments

CREATE TABLE IF NOT EXISTS payroll_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_name VARCHAR(200) NOT NULL,
    ambassador_id UUID REFERENCES ambassadors(id) ON DELETE SET NULL,
    event_name VARCHAR(300),
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    work_date DATE NOT NULL,
    scheduled_hours DECIMAL(5, 2),
    hours_worked DECIMAL(5, 2),
    solos INTEGER DEFAULT 0,
    bonus DECIMAL(10, 2) DEFAULT 0,
    reimbursements DECIMAL(10, 2) DEFAULT 0,
    other DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    pay_date DATE,
    notes TEXT,
    source VARCHAR(50) DEFAULT 'import',
    import_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payroll_entries_ambassador ON payroll_entries(ambassador_id);
CREATE INDEX idx_payroll_entries_date ON payroll_entries(work_date);
CREATE INDEX idx_payroll_entries_pay_date ON payroll_entries(pay_date);
CREATE INDEX idx_payroll_entries_status ON payroll_entries(status);
