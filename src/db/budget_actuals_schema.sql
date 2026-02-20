-- Budget & Actuals Schema
-- WO-82: Historical financial data import system

-- ============================================
-- TABLES
-- ============================================

-- Event Budgets: Detailed budget projections per event
CREATE TABLE IF NOT EXISTS event_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Cost Categories (matching CSV columns)
    budget_staff DECIMAL(12, 2) DEFAULT 0,
    budget_reimbursements DECIMAL(12, 2) DEFAULT 0,
    budget_rewards DECIMAL(12, 2) DEFAULT 0,
    budget_base DECIMAL(12, 2) DEFAULT 0,
    budget_bonus_kickback DECIMAL(12, 2) DEFAULT 0,
    budget_parking DECIMAL(12, 2) DEFAULT 0,
    budget_setup DECIMAL(12, 2) DEFAULT 0,
    budget_additional_1 DECIMAL(12, 2) DEFAULT 0,
    budget_additional_2 DECIMAL(12, 2) DEFAULT 0,
    budget_additional_3 DECIMAL(12, 2) DEFAULT 0,
    budget_additional_4 DECIMAL(12, 2) DEFAULT 0,
    budget_total DECIMAL(12, 2) DEFAULT 0,
    
    -- Projections
    projected_signups INTEGER DEFAULT 0,
    projected_revenue DECIMAL(12, 2) DEFAULT 0,
    projected_profit DECIMAL(12, 2) DEFAULT 0,
    projected_margin_percent DECIMAL(5, 2),
    
    -- Metadata
    import_batch_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_event_budget UNIQUE (event_id)
);

-- Event Actuals: Actual costs and revenue per event
CREATE TABLE IF NOT EXISTS event_actuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Cost Categories (matching CSV columns)
    actual_staff DECIMAL(12, 2) DEFAULT 0,
    actual_reimbursements DECIMAL(12, 2) DEFAULT 0,
    actual_rewards DECIMAL(12, 2) DEFAULT 0,
    actual_base DECIMAL(12, 2) DEFAULT 0,
    actual_bonus_kickback DECIMAL(12, 2) DEFAULT 0,
    actual_parking DECIMAL(12, 2) DEFAULT 0,
    actual_setup DECIMAL(12, 2) DEFAULT 0,
    actual_additional_1 DECIMAL(12, 2) DEFAULT 0,
    actual_additional_2 DECIMAL(12, 2) DEFAULT 0,
    actual_additional_3 DECIMAL(12, 2) DEFAULT 0,
    actual_additional_4 DECIMAL(12, 2) DEFAULT 0,
    actual_total DECIMAL(12, 2) DEFAULT 0,
    
    -- Results
    actual_signups INTEGER DEFAULT 0,
    actual_revenue DECIMAL(12, 2) DEFAULT 0,
    actual_profit DECIMAL(12, 2) DEFAULT 0,
    actual_margin_percent DECIMAL(5, 2),
    
    -- Metadata
    import_batch_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_event_actuals UNIQUE (event_id)
);

-- Financial Import Logs: Track all import operations
CREATE TABLE IF NOT EXISTS financial_import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Import info
    import_type VARCHAR(50) NOT NULL,  -- 'budget_actuals', 'revenue', 'expenses'
    filename VARCHAR(500),
    file_hash VARCHAR(64),  -- SHA256 of file for deduplication
    
    -- Results
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    created_events INTEGER DEFAULT 0,
    created_budgets INTEGER DEFAULT 0,
    created_actuals INTEGER DEFAULT 0,
    updated_budgets INTEGER DEFAULT 0,
    updated_actuals INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    
    -- Error details
    errors JSONB,  -- Array of {row, message}
    warnings JSONB,  -- Array of {row, message}
    
    -- User/timing
    imported_by VARCHAR(255),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Import Row Details: Track each row's processing result
CREATE TABLE IF NOT EXISTS financial_import_row_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_log_id UUID NOT NULL REFERENCES financial_import_logs(id) ON DELETE CASCADE,
    
    row_number INTEGER NOT NULL,
    row_type VARCHAR(20),  -- 'Budget' or 'Actual'
    event_name VARCHAR(500),
    event_date DATE,
    
    -- Processing result
    status VARCHAR(50) NOT NULL,  -- 'success', 'skipped', 'error', 'warning'
    action VARCHAR(50),  -- 'created_event', 'created_budget', 'created_actuals', 'updated_budget', 'updated_actuals', 'skipped'
    event_id UUID REFERENCES events(id),
    message TEXT,
    
    -- Original row data for debugging
    raw_data JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Venue Performance Scores: Aggregate venue metrics for predictive planning
CREATE TABLE IF NOT EXISTS venue_performance_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID,  -- Optional reference to venues table
    venue_name VARCHAR(500) NOT NULL,  -- Denormalized for venues without venue_id
    
    -- Aggregated metrics
    total_events INTEGER DEFAULT 0,
    total_signups INTEGER DEFAULT 0,
    total_revenue DECIMAL(14, 2) DEFAULT 0,
    total_cost DECIMAL(14, 2) DEFAULT 0,
    total_profit DECIMAL(14, 2) DEFAULT 0,
    
    -- Averages
    avg_signups_per_event DECIMAL(8, 2),
    avg_revenue_per_event DECIMAL(12, 2),
    avg_cost_per_event DECIMAL(12, 2),
    avg_profit_per_event DECIMAL(12, 2),
    avg_margin_percent DECIMAL(5, 2),
    
    -- Performance score (0-100)
    performance_score DECIMAL(5, 2),
    
    -- Last event info
    last_event_date DATE,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_venue_score UNIQUE (venue_name)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_event_budgets_event ON event_budgets(event_id);
CREATE INDEX IF NOT EXISTS idx_event_budgets_import ON event_budgets(import_batch_id);

CREATE INDEX IF NOT EXISTS idx_event_actuals_event ON event_actuals(event_id);
CREATE INDEX IF NOT EXISTS idx_event_actuals_import ON event_actuals(import_batch_id);

CREATE INDEX IF NOT EXISTS idx_import_logs_status ON financial_import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_type ON financial_import_logs(import_type);
CREATE INDEX IF NOT EXISTS idx_import_logs_created ON financial_import_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_row_details_log ON financial_import_row_details(import_log_id);
CREATE INDEX IF NOT EXISTS idx_import_row_details_status ON financial_import_row_details(status);

CREATE INDEX IF NOT EXISTS idx_venue_scores_name ON venue_performance_scores(venue_name);
CREATE INDEX IF NOT EXISTS idx_venue_scores_score ON venue_performance_scores(performance_score DESC);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER event_budgets_updated_at
    BEFORE UPDATE ON event_budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER event_actuals_updated_at
    BEFORE UPDATE ON event_actuals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER venue_scores_updated_at
    BEFORE UPDATE ON venue_performance_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
