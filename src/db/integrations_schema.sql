-- Integrations Schema
-- WO-41: Integrations data models and credential management system

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE integration_status AS ENUM ('active', 'inactive', 'error', 'pending_auth');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABLES
-- ============================================

-- External Integrations: Connected services
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL,  -- 'quickbooks', 'ramp', 'slack', 'twilio', etc.
    status integration_status NOT NULL DEFAULT 'inactive',
    -- Config
    config JSONB,  -- Non-sensitive configuration
    -- OAuth
    access_token_encrypted BYTEA,
    refresh_token_encrypted BYTEA,
    token_expires_at TIMESTAMPTZ,
    -- API Keys
    api_key_encrypted BYTEA,
    api_secret_encrypted BYTEA,
    -- Webhooks
    webhook_url VARCHAR(500),
    webhook_secret_encrypted BYTEA,
    -- Status
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    -- Metadata
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Integration Logs: Activity tracking
CREATE TABLE IF NOT EXISTS integration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,  -- 'sync', 'webhook_received', 'api_call', 'auth_refresh'
    status VARCHAR(50) NOT NULL,  -- 'success', 'error', 'partial'
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook Events: Incoming webhooks
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
    provider VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    headers JSONB,
    -- Processing
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, processed, failed, ignored
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data Mappings: Map external IDs to internal
CREATE TABLE IF NOT EXISTS integration_data_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,  -- 'ambassador', 'event', 'signup', 'expense'
    internal_id UUID NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    external_data JSONB,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_mapping UNIQUE (integration_id, entity_type, external_id)
);

-- Scheduled Syncs: Cron-like sync jobs
CREATE TABLE IF NOT EXISTS integration_sync_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    sync_type VARCHAR(100) NOT NULL,  -- 'full', 'incremental', 'specific'
    schedule_cron VARCHAR(100),  -- '0 * * * *' for hourly
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);

CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_action ON integration_logs(action);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhooks_provider ON webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhooks_pending ON webhook_events(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_mappings_integration ON integration_data_mappings(integration_id);
CREATE INDEX IF NOT EXISTS idx_mappings_entity ON integration_data_mappings(entity_type, internal_id);
CREATE INDEX IF NOT EXISTS idx_mappings_external ON integration_data_mappings(integration_id, external_id);

CREATE INDEX IF NOT EXISTS idx_sync_schedules_enabled ON integration_sync_schedules(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_sync_schedules_next ON integration_sync_schedules(next_run_at);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
