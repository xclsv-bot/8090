-- Operator Management Schema
-- WO-45: Operator data models and business logic

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE operator_status AS ENUM ('active', 'inactive', 'pending', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE operator_category AS ENUM ('sportsbook', 'casino', 'dfs', 'poker', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABLES
-- ============================================

-- Operators: Sportsbooks, casinos, etc.
CREATE TABLE IF NOT EXISTS operators (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    category operator_category NOT NULL DEFAULT 'sportsbook',
    status operator_status NOT NULL DEFAULT 'active',
    logo_url VARCHAR(500),
    website_url VARCHAR(500),
    affiliate_link VARCHAR(1000),
    description TEXT,
    -- Legal/Compliance
    legal_states TEXT[],  -- States where operator is legal
    min_age INTEGER DEFAULT 21,
    -- Tracking
    tracking_param_name VARCHAR(100),  -- e.g., 'btag', 'affid'
    tracking_base_url VARCHAR(500),
    -- Display
    sort_order INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT false,
    color_primary VARCHAR(7),  -- Hex color
    color_secondary VARCHAR(7),
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operator State Availability: Which operators are available in which states
CREATE TABLE IF NOT EXISTS operator_state_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    state_code VARCHAR(2) NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT true,
    launch_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_operator_state UNIQUE (operator_id, state_code)
);

-- Operator Promotions: Current promos/bonuses
CREATE TABLE IF NOT EXISTS operator_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    promo_code VARCHAR(100),
    promo_type VARCHAR(100),  -- 'welcome_bonus', 'deposit_match', 'free_bet', etc.
    value VARCHAR(100),  -- '$200 in bonus bets', '100% match up to $500'
    terms TEXT,
    affiliate_link VARCHAR(1000),
    state_restrictions TEXT[],  -- States where promo doesn't apply
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operator Contacts: Account managers, support contacts
CREATE TABLE IF NOT EXISTS operator_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    contact_type VARCHAR(100) NOT NULL,  -- 'account_manager', 'support', 'compliance'
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operator API Credentials: For validation/sync
CREATE TABLE IF NOT EXISTS operator_api_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    credential_type VARCHAR(100) NOT NULL,  -- 'api_key', 'oauth', 'sftp'
    credentials_encrypted BYTEA,  -- Encrypted credentials
    endpoint_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operator Sync History: Track data syncs
CREATE TABLE IF NOT EXISTS operator_sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    sync_type VARCHAR(100) NOT NULL,  -- 'signups', 'conversions', 'revenue'
    status VARCHAR(50) NOT NULL,  -- 'started', 'completed', 'failed'
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_operators_status ON operators(status);
CREATE INDEX IF NOT EXISTS idx_operators_category ON operators(category);
CREATE INDEX IF NOT EXISTS idx_operators_featured ON operators(featured) WHERE featured = true;

CREATE INDEX IF NOT EXISTS idx_op_state_operator ON operator_state_availability(operator_id);
CREATE INDEX IF NOT EXISTS idx_op_state_state ON operator_state_availability(state_code);
CREATE INDEX IF NOT EXISTS idx_op_state_available ON operator_state_availability(is_available) WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_promos_operator ON operator_promotions(operator_id);
CREATE INDEX IF NOT EXISTS idx_promos_active ON operator_promotions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promos_dates ON operator_promotions(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_sync_operator ON operator_sync_history(operator_id);
CREATE INDEX IF NOT EXISTS idx_sync_type ON operator_sync_history(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_started ON operator_sync_history(started_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER operators_updated_at
    BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER promotions_updated_at
    BEFORE UPDATE ON operator_promotions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER api_credentials_updated_at
    BEFORE UPDATE ON operator_api_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEED DATA: Common Operators
-- ============================================

INSERT INTO operators (id, name, display_name, category, status, sort_order) VALUES
    (1, 'fanduel', 'FanDuel', 'sportsbook', 'active', 1),
    (2, 'draftkings', 'DraftKings', 'sportsbook', 'active', 2),
    (3, 'betmgm', 'BetMGM', 'sportsbook', 'active', 3),
    (4, 'caesars', 'Caesars Sportsbook', 'sportsbook', 'active', 4),
    (5, 'pointsbet', 'PointsBet', 'sportsbook', 'active', 5),
    (6, 'bet365', 'bet365', 'sportsbook', 'active', 6),
    (7, 'espnbet', 'ESPN BET', 'sportsbook', 'active', 7),
    (8, 'fanatics', 'Fanatics Sportsbook', 'sportsbook', 'active', 8),
    (10, 'fanduel_casino', 'FanDuel Casino', 'casino', 'active', 10),
    (11, 'draftkings_casino', 'DraftKings Casino', 'casino', 'active', 11),
    (12, 'wow_vegas', 'WOW Vegas', 'casino', 'active', 12),
    (13, 'real_prize', 'Real Prize', 'casino', 'active', 13)
ON CONFLICT (name) DO NOTHING;
