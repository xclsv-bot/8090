-- Alerting Schema Extensions
-- WO-74: KPI Management and Alerting System
-- Threshold versioning and enhanced alerting infrastructure

-- ============================================
-- THRESHOLD VERSIONING
-- ============================================

-- Threshold Version History: Track all changes to thresholds
CREATE TABLE IF NOT EXISTS kpi_threshold_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to original threshold
    threshold_id UUID NOT NULL REFERENCES kpi_thresholds(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    
    -- Snapshot of threshold state at this version
    kpi_name VARCHAR(100) NOT NULL,
    kpi_category kpi_category NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Threshold values
    threshold_condition threshold_condition NOT NULL,
    threshold_value DECIMAL(14, 4) NOT NULL,
    warning_threshold DECIMAL(14, 4),
    critical_threshold DECIMAL(14, 4),
    target_value DECIMAL(14, 4),
    
    -- Alert configuration
    alert_severity kpi_alert_severity NOT NULL,
    alert_enabled BOOLEAN NOT NULL,
    alert_cooldown_minutes INTEGER,
    
    -- Notification settings
    notification_channels JSONB,
    notification_recipients JSONB,
    
    -- Effective dating for this version
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT true,
    
    -- Change tracking
    change_reason TEXT,
    changed_by UUID,
    changed_by_email VARCHAR(255),
    change_type VARCHAR(50) NOT NULL, -- 'create', 'update', 'activate', 'deactivate'
    
    -- Full state for rollback capability
    full_state JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_threshold_version UNIQUE (threshold_id, version_number)
);

-- Add version tracking to main threshold table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'kpi_thresholds' AND column_name = 'current_version') THEN
        ALTER TABLE kpi_thresholds ADD COLUMN current_version INTEGER DEFAULT 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'kpi_thresholds' AND column_name = 'version_count') THEN
        ALTER TABLE kpi_thresholds ADD COLUMN version_count INTEGER DEFAULT 1;
    END IF;
END $$;

-- ============================================
-- AMBASSADOR BONUS THRESHOLDS
-- (Supporting table for weekly digest feature)
-- ============================================

CREATE TABLE IF NOT EXISTS ambassador_bonus_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL,
    
    -- Threshold configuration
    threshold_value INTEGER NOT NULL,
    bonus_amount DECIMAL(10, 2),
    threshold_period VARCHAR(20) DEFAULT 'monthly', -- weekly, monthly, quarterly
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_ambassador_bonus UNIQUE (ambassador_id, threshold_period)
);

-- ============================================
-- ALERT NOTIFICATION QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS alert_notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Alert reference
    alert_id UUID NOT NULL REFERENCES kpi_alerts(id) ON DELETE CASCADE,
    
    -- Notification details
    channel VARCHAR(50) NOT NULL, -- 'email', 'slack', 'webhook', 'sms'
    recipient VARCHAR(255) NOT NULL,
    recipient_type VARCHAR(50), -- 'user', 'channel', 'email', 'phone'
    
    -- Message content
    subject TEXT,
    message TEXT NOT NULL,
    template_id VARCHAR(100),
    template_data JSONB,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Timing
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- DIGEST GENERATION HISTORY
-- ============================================

CREATE TABLE IF NOT EXISTS digest_generation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Digest details
    digest_type VARCHAR(50) NOT NULL, -- 'weekly', 'monthly', 'custom'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Content
    digest_content JSONB NOT NULL,
    text_content TEXT,
    html_content TEXT,
    
    -- Distribution
    recipients JSONB, -- List of email addresses
    sent_at TIMESTAMPTZ,
    send_status VARCHAR(50), -- 'pending', 'sent', 'partial', 'failed'
    
    -- Metrics captured
    total_signups INTEGER,
    top_performers JSONB,
    alert_count INTEGER,
    
    -- Timestamps
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Threshold versions
CREATE INDEX IF NOT EXISTS idx_threshold_versions_threshold ON kpi_threshold_versions(threshold_id);
CREATE INDEX IF NOT EXISTS idx_threshold_versions_current ON kpi_threshold_versions(threshold_id, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_threshold_versions_effective ON kpi_threshold_versions(effective_from, effective_to);

-- Ambassador bonus thresholds
CREATE INDEX IF NOT EXISTS idx_ambassador_bonus_active ON ambassador_bonus_thresholds(ambassador_id, is_active) WHERE is_active = true;

-- Alert notification queue
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON alert_notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON alert_notification_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_alert ON alert_notification_queue(alert_id);

-- Digest history
CREATE INDEX IF NOT EXISTS idx_digest_history_type ON digest_generation_history(digest_type);
CREATE INDEX IF NOT EXISTS idx_digest_history_period ON digest_generation_history(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_digest_history_generated ON digest_generation_history(generated_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at for new tables
CREATE OR REPLACE TRIGGER ambassador_bonus_thresholds_updated_at
    BEFORE UPDATE ON ambassador_bonus_thresholds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER alert_notification_queue_updated_at
    BEFORE UPDATE ON alert_notification_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to create a new threshold version
CREATE OR REPLACE FUNCTION create_threshold_version()
RETURNS TRIGGER AS $$
DECLARE
    new_version_number INTEGER;
BEGIN
    -- Get the next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO new_version_number
    FROM kpi_threshold_versions
    WHERE threshold_id = NEW.id;
    
    -- Mark previous versions as not current
    UPDATE kpi_threshold_versions
    SET is_current = false, effective_to = NOW()
    WHERE threshold_id = NEW.id AND is_current = true;
    
    -- Insert new version
    INSERT INTO kpi_threshold_versions (
        threshold_id, version_number,
        kpi_name, kpi_category, display_name, description,
        threshold_condition, threshold_value, warning_threshold, critical_threshold, target_value,
        alert_severity, alert_enabled, alert_cooldown_minutes,
        notification_channels, notification_recipients,
        is_current, change_type,
        full_state
    ) VALUES (
        NEW.id, new_version_number,
        NEW.kpi_name, NEW.kpi_category, NEW.display_name, NEW.description,
        NEW.threshold_condition, NEW.threshold_value, NEW.warning_threshold, NEW.critical_threshold, NEW.target_value,
        NEW.alert_severity, NEW.alert_enabled, NEW.alert_cooldown_minutes,
        NEW.notification_channels, NEW.notification_recipients,
        true, TG_OP,
        row_to_json(NEW)
    );
    
    -- Update version count on main table
    NEW.current_version := new_version_number;
    NEW.version_count := new_version_number;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-version threshold changes
DROP TRIGGER IF EXISTS threshold_versioning ON kpi_thresholds;
CREATE TRIGGER threshold_versioning
    BEFORE INSERT OR UPDATE ON kpi_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION create_threshold_version();

-- Function to get threshold at a specific point in time
CREATE OR REPLACE FUNCTION get_threshold_at_time(
    p_threshold_id UUID,
    p_at_time TIMESTAMPTZ
) RETURNS TABLE (
    threshold_id UUID,
    version_number INTEGER,
    kpi_name VARCHAR,
    threshold_value DECIMAL,
    warning_threshold DECIMAL,
    critical_threshold DECIMAL,
    alert_enabled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tv.threshold_id,
        tv.version_number,
        tv.kpi_name,
        tv.threshold_value,
        tv.warning_threshold,
        tv.critical_threshold,
        tv.alert_enabled
    FROM kpi_threshold_versions tv
    WHERE tv.threshold_id = p_threshold_id
      AND tv.effective_from <= p_at_time
      AND (tv.effective_to IS NULL OR tv.effective_to > p_at_time)
    ORDER BY tv.version_number DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to rollback threshold to a previous version
CREATE OR REPLACE FUNCTION rollback_threshold_version(
    p_threshold_id UUID,
    p_version_number INTEGER,
    p_changed_by UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Rollback'
) RETURNS UUID AS $$
DECLARE
    v_version_state JSONB;
    v_new_version INTEGER;
BEGIN
    -- Get the state from the target version
    SELECT full_state INTO v_version_state
    FROM kpi_threshold_versions
    WHERE threshold_id = p_threshold_id AND version_number = p_version_number;
    
    IF v_version_state IS NULL THEN
        RAISE EXCEPTION 'Version % not found for threshold %', p_version_number, p_threshold_id;
    END IF;
    
    -- Update the main threshold with the versioned state
    UPDATE kpi_thresholds SET
        threshold_condition = (v_version_state->>'threshold_condition')::threshold_condition,
        threshold_value = (v_version_state->>'threshold_value')::DECIMAL,
        warning_threshold = (v_version_state->>'warning_threshold')::DECIMAL,
        critical_threshold = (v_version_state->>'critical_threshold')::DECIMAL,
        target_value = (v_version_state->>'target_value')::DECIMAL,
        alert_severity = (v_version_state->>'alert_severity')::kpi_alert_severity,
        alert_enabled = (v_version_state->>'alert_enabled')::BOOLEAN,
        alert_cooldown_minutes = (v_version_state->>'alert_cooldown_minutes')::INTEGER,
        updated_at = NOW()
    WHERE id = p_threshold_id;
    
    -- Update the change reason in the latest version
    UPDATE kpi_threshold_versions
    SET change_reason = p_reason, changed_by = p_changed_by
    WHERE threshold_id = p_threshold_id AND is_current = true;
    
    RETURN p_threshold_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default system KPI thresholds if they don't exist
INSERT INTO kpi_thresholds (
    kpi_name, kpi_category, display_name, description,
    threshold_condition, threshold_value, warning_threshold, critical_threshold,
    target_value, unit, alert_severity, is_system_kpi
) VALUES
    ('daily_signup_count', 'signups', 'Daily Signup Target', 'Alert when daily signups fall below target', 
     'less_than', 50, 75, 25, 100, 'count', 'warning', true),
    ('signup_validation_rate', 'quality', 'Signup Validation Rate', 'Alert when validation rate drops', 
     'less_than', 80, 85, 70, 95, '%', 'warning', true),
    ('ambassador_utilization', 'operations', 'Ambassador Utilization', 'Alert when utilization is low', 
     'less_than', 60, 70, 50, 80, '%', 'info', true),
    ('event_budget_variance', 'financial', 'Event Budget Variance', 'Alert on significant budget overruns', 
     'greater_than', 20, 15, 30, 0, '%', 'warning', true),
    ('pending_event_count', 'operations', 'Pending Events', 'Alert when too many events pending', 
     'greater_than', 5, 3, 10, 0, 'count', 'info', true)
ON CONFLICT DO NOTHING;

-- Insert sample ambassador bonus thresholds
INSERT INTO ambassador_bonus_thresholds (ambassador_id, threshold_value, bonus_amount, threshold_period) 
SELECT 
    id,
    100, -- 100 signups threshold
    500.00, -- $500 bonus
    'monthly'
FROM ambassadors
WHERE status = 'active'
LIMIT 10
ON CONFLICT (ambassador_id, threshold_period) DO NOTHING;
