-- Analytics & Reporting Schema
-- WO-71: Analytics Data Models and Snapshot Infrastructure
-- Phase 11 Foundation

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE kpi_category AS ENUM (
        'signups', 'events', 'ambassadors', 'financial', 
        'operations', 'quality', 'engagement', 'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE kpi_alert_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE kpi_alert_status AS ENUM ('active', 'acknowledged', 'resolved', 'snoozed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE threshold_condition AS ENUM (
        'greater_than', 'less_than', 'greater_than_or_equal', 
        'less_than_or_equal', 'equals', 'not_equals',
        'percent_change_above', 'percent_change_below'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE metric_aggregation AS ENUM ('sum', 'avg', 'min', 'max', 'count', 'median', 'p95', 'p99');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE snapshot_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'create', 'update', 'delete', 'view', 'export',
        'threshold_breach', 'alert_triggered', 'snapshot_created'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- CORE TABLES
-- ============================================

-- Daily Metrics Snapshot: Pre-computed daily analytics
CREATE TABLE IF NOT EXISTS daily_metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    snapshot_status snapshot_status NOT NULL DEFAULT 'pending',
    
    -- Signup Metrics
    total_signups INTEGER DEFAULT 0,
    validated_signups INTEGER DEFAULT 0,
    rejected_signups INTEGER DEFAULT 0,
    pending_signups INTEGER DEFAULT 0,
    validation_rate DECIMAL(5, 2),
    duplicate_rate DECIMAL(5, 2),
    avg_signup_processing_time_ms INTEGER,
    
    -- Event Metrics
    total_events INTEGER DEFAULT 0,
    active_events INTEGER DEFAULT 0,
    completed_events INTEGER DEFAULT 0,
    cancelled_events INTEGER DEFAULT 0,
    avg_signups_per_event DECIMAL(10, 2),
    top_performing_event_id UUID,
    
    -- Ambassador Metrics
    active_ambassadors INTEGER DEFAULT 0,
    new_ambassadors INTEGER DEFAULT 0,
    checked_in_ambassadors INTEGER DEFAULT 0,
    avg_signups_per_ambassador DECIMAL(10, 2),
    top_performer_id UUID,
    ambassador_utilization_rate DECIMAL(5, 2),
    
    -- Financial Metrics
    total_revenue DECIMAL(14, 2) DEFAULT 0,
    total_expenses DECIMAL(14, 2) DEFAULT 0,
    net_profit DECIMAL(14, 2) DEFAULT 0,
    profit_margin DECIMAL(5, 2),
    avg_revenue_per_signup DECIMAL(10, 2),
    payroll_cost DECIMAL(14, 2) DEFAULT 0,
    
    -- Quality Metrics
    data_quality_score DECIMAL(5, 2),
    extraction_success_rate DECIMAL(5, 2),
    api_error_rate DECIMAL(5, 2),
    
    -- Engagement Metrics
    portal_active_users INTEGER DEFAULT 0,
    api_requests_count INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER,
    
    -- Regional Breakdown (JSONB for flexibility)
    metrics_by_region JSONB,
    metrics_by_operator JSONB,
    metrics_by_skill_level JSONB,
    
    -- Raw data for drill-down
    detailed_metrics JSONB,
    
    -- Processing metadata
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_duration_ms INTEGER,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_snapshot_date UNIQUE (snapshot_date)
);

-- KPI Thresholds: Configurable alert thresholds for KPIs
CREATE TABLE IF NOT EXISTS kpi_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- KPI Identification
    kpi_name VARCHAR(100) NOT NULL,
    kpi_category kpi_category NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Threshold Configuration
    threshold_condition threshold_condition NOT NULL,
    threshold_value DECIMAL(14, 4) NOT NULL,
    warning_threshold DECIMAL(14, 4),
    critical_threshold DECIMAL(14, 4),
    
    -- Target/Baseline
    target_value DECIMAL(14, 4),
    baseline_value DECIMAL(14, 4),
    unit VARCHAR(50),
    
    -- Alert Configuration
    alert_severity kpi_alert_severity NOT NULL DEFAULT 'warning',
    alert_enabled BOOLEAN NOT NULL DEFAULT true,
    alert_cooldown_minutes INTEGER DEFAULT 60,
    last_alert_at TIMESTAMPTZ,
    
    -- Notification Settings (JSONB for flexibility)
    notification_channels JSONB DEFAULT '["email", "slack"]'::jsonb,
    notification_recipients JSONB,
    
    -- Aggregation Configuration
    aggregation_type metric_aggregation DEFAULT 'sum',
    aggregation_period VARCHAR(20) DEFAULT 'daily', -- hourly, daily, weekly, monthly
    
    -- Scope (optional filtering)
    region VARCHAR(100),
    operator_id INTEGER,
    event_id UUID,
    
    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system_kpi BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_kpi_scope UNIQUE (kpi_name, region, operator_id, event_id)
);

-- KPI Alerts: Generated alerts when thresholds are breached
CREATE TABLE IF NOT EXISTS kpi_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to threshold
    threshold_id UUID NOT NULL REFERENCES kpi_thresholds(id) ON DELETE CASCADE,
    
    -- Alert Details
    kpi_name VARCHAR(100) NOT NULL,
    kpi_category kpi_category NOT NULL,
    alert_severity kpi_alert_severity NOT NULL,
    alert_status kpi_alert_status NOT NULL DEFAULT 'active',
    
    -- Values at time of alert
    current_value DECIMAL(14, 4) NOT NULL,
    threshold_value DECIMAL(14, 4) NOT NULL,
    threshold_condition threshold_condition NOT NULL,
    deviation_percent DECIMAL(10, 2),
    
    -- Context
    alert_message TEXT NOT NULL,
    alert_context JSONB,  -- Additional context about the breach
    snapshot_date DATE,
    snapshot_id UUID REFERENCES daily_metrics_snapshots(id) ON DELETE SET NULL,
    
    -- Resolution
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Snooze
    snoozed_until TIMESTAMPTZ,
    snoozed_by UUID,
    
    -- Notification tracking
    notifications_sent JSONB DEFAULT '[]'::jsonb,
    last_notification_at TIMESTAMPTZ,
    notification_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Analytics Audit Log: Track all analytics operations
CREATE TABLE IF NOT EXISTS analytics_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Actor
    user_id UUID,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    
    -- Action
    action audit_action NOT NULL,
    resource_type VARCHAR(100) NOT NULL, -- 'snapshot', 'kpi', 'alert', 'report', 'dashboard'
    resource_id UUID,
    resource_name VARCHAR(255),
    
    -- Details
    action_details JSONB,
    previous_state JSONB,
    new_state JSONB,
    
    -- Request context
    request_id UUID,
    api_endpoint VARCHAR(255),
    http_method VARCHAR(10),
    
    -- Outcome
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    duration_ms INTEGER,
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- SUPPORTING TABLES
-- ============================================

-- Analytics Snapshots (legacy compatibility + enhanced)
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_type VARCHAR(50) NOT NULL,
    snapshot_date DATE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_snapshot_type_date UNIQUE (snapshot_type, snapshot_date)
);

-- KPIs Master Table (enhanced from existing)
CREATE TABLE IF NOT EXISTS kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    category kpi_category NOT NULL,
    
    -- Configuration
    calculation_query TEXT,
    calculation_function VARCHAR(100),
    unit VARCHAR(50),
    format_pattern VARCHAR(50),
    
    -- Display
    dashboard_position INTEGER,
    widget_type VARCHAR(50) DEFAULT 'number', -- number, chart, gauge, trend
    chart_config JSONB,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KPI Historical Values: Time-series storage
CREATE TABLE IF NOT EXISTS kpi_historical_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kpi_name VARCHAR(100) NOT NULL,
    value_date DATE NOT NULL,
    value DECIMAL(14, 4) NOT NULL,
    value_context JSONB,
    snapshot_id UUID REFERENCES daily_metrics_snapshots(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_kpi_value_date UNIQUE (kpi_name, value_date)
);

-- Metric Calculation Jobs: Track scheduled metric calculations
CREATE TABLE IF NOT EXISTS metric_calculation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL, -- 'daily_snapshot', 'hourly_metrics', 'realtime_kpi'
    job_name VARCHAR(255) NOT NULL,
    
    -- Schedule
    cron_expression VARCHAR(100),
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    
    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_running BOOLEAN NOT NULL DEFAULT false,
    last_status VARCHAR(50),
    last_error TEXT,
    
    -- Configuration
    config JSONB,
    
    -- Stats
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    avg_duration_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Real-time Metrics Cache
CREATE TABLE IF NOT EXISTS realtime_metrics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key VARCHAR(255) NOT NULL UNIQUE,
    metric_value DECIMAL(14, 4) NOT NULL,
    metric_context JSONB,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    ttl_seconds INTEGER NOT NULL DEFAULT 300
);

-- Data Retention Policies
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL,
    archive_enabled BOOLEAN DEFAULT false,
    archive_table_name VARCHAR(100),
    last_cleanup_at TIMESTAMPTZ,
    rows_deleted INTEGER DEFAULT 0,
    rows_archived INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Daily Metrics Snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_metrics_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_status ON daily_metrics_snapshots(snapshot_status);
CREATE INDEX IF NOT EXISTS idx_snapshots_date_status ON daily_metrics_snapshots(snapshot_date DESC, snapshot_status);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON daily_metrics_snapshots(created_at DESC);

-- KPI Thresholds
CREATE INDEX IF NOT EXISTS idx_thresholds_kpi_name ON kpi_thresholds(kpi_name);
CREATE INDEX IF NOT EXISTS idx_thresholds_category ON kpi_thresholds(kpi_category);
CREATE INDEX IF NOT EXISTS idx_thresholds_active ON kpi_thresholds(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_thresholds_alert_enabled ON kpi_thresholds(alert_enabled) WHERE alert_enabled = true;

-- KPI Alerts
CREATE INDEX IF NOT EXISTS idx_alerts_status ON kpi_alerts(alert_status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON kpi_alerts(alert_severity);
CREATE INDEX IF NOT EXISTS idx_alerts_threshold ON kpi_alerts(threshold_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON kpi_alerts(alert_status) WHERE alert_status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_created ON kpi_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_snapshot ON kpi_alerts(snapshot_id);

-- Analytics Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_user ON analytics_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON analytics_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON analytics_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON analytics_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource_type ON analytics_audit_logs(resource_type);

-- KPI Historical Values
CREATE INDEX IF NOT EXISTS idx_kpi_history_name ON kpi_historical_values(kpi_name);
CREATE INDEX IF NOT EXISTS idx_kpi_history_date ON kpi_historical_values(value_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_history_name_date ON kpi_historical_values(kpi_name, value_date DESC);

-- Analytics Snapshots (legacy)
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_type ON analytics_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date ON analytics_snapshots(snapshot_date DESC);

-- Realtime Metrics Cache
CREATE INDEX IF NOT EXISTS idx_realtime_cache_key ON realtime_metrics_cache(metric_key);
CREATE INDEX IF NOT EXISTS idx_realtime_cache_expires ON realtime_metrics_cache(expires_at);

-- Metric Calculation Jobs
CREATE INDEX IF NOT EXISTS idx_calc_jobs_type ON metric_calculation_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_calc_jobs_next_run ON metric_calculation_jobs(next_run_at);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER daily_metrics_snapshots_updated_at
    BEFORE UPDATE ON daily_metrics_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER kpi_thresholds_updated_at
    BEFORE UPDATE ON kpi_thresholds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER kpi_alerts_updated_at
    BEFORE UPDATE ON kpi_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER analytics_snapshots_updated_at
    BEFORE UPDATE ON analytics_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER kpis_updated_at
    BEFORE UPDATE ON kpis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER metric_calculation_jobs_updated_at
    BEFORE UPDATE ON metric_calculation_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER data_retention_policies_updated_at
    BEFORE UPDATE ON data_retention_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DATA RETENTION FUNCTIONS
-- ============================================

-- Function to clean up old data based on retention policies
CREATE OR REPLACE FUNCTION execute_data_retention()
RETURNS TABLE(table_name VARCHAR, rows_deleted BIGINT) AS $$
DECLARE
    policy RECORD;
    deleted_count BIGINT;
BEGIN
    FOR policy IN 
        SELECT p.table_name, p.retention_days, p.archive_enabled, p.archive_table_name
        FROM data_retention_policies p
        WHERE p.is_active = true
    LOOP
        -- Execute deletion based on table
        EXECUTE format(
            'DELETE FROM %I WHERE created_at < NOW() - INTERVAL ''%s days''',
            policy.table_name,
            policy.retention_days
        );
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        -- Update policy stats
        UPDATE data_retention_policies 
        SET last_cleanup_at = NOW(), 
            rows_deleted = COALESCE(data_retention_policies.rows_deleted, 0) + deleted_count
        WHERE data_retention_policies.table_name = policy.table_name;
        
        table_name := policy.table_name;
        rows_deleted := deleted_count;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired realtime cache
CREATE OR REPLACE FUNCTION cleanup_expired_realtime_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM realtime_metrics_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default retention policies
INSERT INTO data_retention_policies (table_name, retention_days, archive_enabled) VALUES
    ('analytics_audit_logs', 90, false),
    ('kpi_alerts', 365, true),
    ('kpi_historical_values', 730, true),
    ('realtime_metrics_cache', 1, false),
    ('analytics_snapshots', 365, true),
    ('daily_metrics_snapshots', 730, true)
ON CONFLICT (table_name) DO NOTHING;

-- Insert default metric calculation jobs
INSERT INTO metric_calculation_jobs (job_type, job_name, cron_expression, config) VALUES
    ('daily_snapshot', 'Daily Metrics Snapshot', '0 1 * * *', '{"timezone": "America/New_York"}'),
    ('hourly_metrics', 'Hourly KPI Refresh', '0 * * * *', '{"kpis": ["signups_today", "active_events"]}'),
    ('realtime_kpi', 'Real-time Dashboard Metrics', '*/5 * * * *', '{"ttl_seconds": 300}')
ON CONFLICT DO NOTHING;

-- Insert default KPIs
INSERT INTO kpis (name, display_name, description, category, unit, widget_type) VALUES
    ('daily_signups', 'Daily Signups', 'Total signups created today', 'signups', 'count', 'number'),
    ('validation_rate', 'Validation Rate', 'Percentage of validated signups', 'quality', '%', 'gauge'),
    ('monthly_revenue', 'Monthly Revenue', 'Total revenue this month', 'financial', 'USD', 'number'),
    ('active_ambassadors', 'Active Ambassadors', 'Ambassadors with activity today', 'ambassadors', 'count', 'number'),
    ('active_events', 'Active Events', 'Events currently running', 'events', 'count', 'number'),
    ('avg_signups_per_ambassador', 'Avg Signups/Ambassador', 'Average signups per ambassador today', 'ambassadors', 'count', 'trend'),
    ('net_profit_margin', 'Net Profit Margin', 'Net profit as percentage of revenue', 'financial', '%', 'gauge'),
    ('data_quality_score', 'Data Quality Score', 'Overall data quality metric', 'quality', '%', 'gauge')
ON CONFLICT (name) DO NOTHING;

-- Insert default KPI thresholds
INSERT INTO kpi_thresholds (kpi_name, kpi_category, display_name, description, threshold_condition, threshold_value, warning_threshold, critical_threshold, target_value, unit, is_system_kpi) VALUES
    ('validation_rate', 'quality', 'Validation Rate Alert', 'Alert when validation rate drops below threshold', 'less_than', 80, 85, 75, 90, '%', true),
    ('daily_signups', 'signups', 'Daily Signup Goal', 'Track daily signup targets', 'less_than', 50, 75, 25, 100, 'count', true),
    ('data_quality_score', 'quality', 'Data Quality Alert', 'Alert on low data quality', 'less_than', 70, 80, 60, 95, '%', true)
ON CONFLICT DO NOTHING;
