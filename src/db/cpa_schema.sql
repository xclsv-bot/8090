-- CPA Management Schema
-- WO-22: CPA data models and core rate lookup system

-- ============================================
-- TABLES
-- ============================================

-- CPA Rates: Commission rates by operator and state
CREATE TABLE IF NOT EXISTS cpa_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    state_code VARCHAR(2) NOT NULL,
    rate_type VARCHAR(50) NOT NULL DEFAULT 'cpa',  -- 'cpa', 'rev_share', 'hybrid'
    cpa_amount DECIMAL(10, 2),  -- Fixed amount per conversion
    rev_share_percentage DECIMAL(5, 2),  -- Percentage of revenue
    min_deposit DECIMAL(10, 2),  -- Minimum deposit for qualification
    effective_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    tier VARCHAR(50),  -- 'standard', 'premium', 'vip'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_rate UNIQUE (operator_id, state_code, effective_date, tier)
);

-- CPA Tiers: Volume-based tier definitions
CREATE TABLE IF NOT EXISTS cpa_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id INTEGER REFERENCES operators(id) ON DELETE CASCADE,
    tier_name VARCHAR(100) NOT NULL,
    min_conversions INTEGER NOT NULL DEFAULT 0,
    max_conversions INTEGER,
    rate_multiplier DECIMAL(5, 2) DEFAULT 1.0,
    bonus_amount DECIMAL(10, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CPA Rate History: Track rate changes
CREATE TABLE IF NOT EXISTS cpa_rate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpa_rate_id UUID NOT NULL REFERENCES cpa_rates(id) ON DELETE CASCADE,
    field_changed VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by UUID,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Signup CPA Attribution: Link signups to CPA rates
CREATE TABLE IF NOT EXISTS signup_cpa_attribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id UUID NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
    cpa_rate_id UUID REFERENCES cpa_rates(id) ON DELETE SET NULL,
    attributed_amount DECIMAL(10, 2),
    attribution_date DATE NOT NULL,
    is_qualified BOOLEAN DEFAULT false,
    qualified_at TIMESTAMPTZ,
    disqualification_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_signup_cpa UNIQUE (signup_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_cpa_rates_operator ON cpa_rates(operator_id);
CREATE INDEX IF NOT EXISTS idx_cpa_rates_state ON cpa_rates(state_code);
CREATE INDEX IF NOT EXISTS idx_cpa_rates_active ON cpa_rates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cpa_rates_effective ON cpa_rates(effective_date, end_date);

CREATE INDEX IF NOT EXISTS idx_cpa_tiers_operator ON cpa_tiers(operator_id);

CREATE INDEX IF NOT EXISTS idx_cpa_attribution_signup ON signup_cpa_attribution(signup_id);
CREATE INDEX IF NOT EXISTS idx_cpa_attribution_date ON signup_cpa_attribution(attribution_date);
CREATE INDEX IF NOT EXISTS idx_cpa_attribution_qualified ON signup_cpa_attribution(is_qualified);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER cpa_rates_updated_at
    BEFORE UPDATE ON cpa_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
