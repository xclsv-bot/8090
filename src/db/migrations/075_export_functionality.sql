-- Migration: 075_export_functionality
-- WO-75: Analytics Reporting and Export Functionality
-- Creates tables for export jobs, templates, scheduled exports, and audit logging

-- ============================================
-- EXPORT AUDIT LOGS
-- Tracks all export operations for compliance
-- ============================================

CREATE TABLE IF NOT EXISTS export_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_job_id UUID,
    
    -- Actor
    user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    ip_address INET,
    
    -- Action
    action VARCHAR(50) NOT NULL CHECK (action IN ('request', 'download', 'email_sent', 'schedule_created', 'failed')),
    report_type VARCHAR(50) NOT NULL,
    format VARCHAR(20) NOT NULL CHECK (format IN ('csv', 'excel', 'pdf')),
    
    -- Details
    filters JSONB NOT NULL DEFAULT '{}',
    row_count INTEGER,
    file_size_bytes BIGINT,
    duration_ms INTEGER,
    
    -- Result
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_audit_user ON export_audit_logs(user_id);
CREATE INDEX idx_export_audit_created ON export_audit_logs(created_at DESC);
CREATE INDEX idx_export_audit_type ON export_audit_logs(report_type);
CREATE INDEX idx_export_audit_format ON export_audit_logs(format);

-- ============================================
-- REPORT TEMPLATES
-- Customizable templates for different stakeholder needs
-- ============================================

CREATE TABLE IF NOT EXISTS report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) NOT NULL CHECK (template_type IN (
        'executive_summary', 'operational_report', 'financial_report',
        'performance_review', 'custom'
    )),
    
    -- Configuration
    report_types TEXT[] NOT NULL DEFAULT '{}',
    default_filters JSONB,
    sections JSONB NOT NULL DEFAULT '[]',
    
    -- Styling
    header_config JSONB,
    footer_config JSONB,
    chart_configs JSONB,
    
    -- Access control
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    allowed_roles TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_templates_name ON report_templates(name);
CREATE INDEX idx_report_templates_type ON report_templates(template_type);
CREATE INDEX idx_report_templates_public ON report_templates(is_public);

-- ============================================
-- SCHEDULED EXPORTS
-- Recurring export configurations
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic info
    name VARCHAR(100) NOT NULL,
    
    -- Schedule
    cron_expression VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Export configuration
    report_type VARCHAR(50) NOT NULL,
    format VARCHAR(20) NOT NULL CHECK (format IN ('csv', 'excel', 'pdf')),
    template_id UUID REFERENCES report_templates(id),
    filters JSONB NOT NULL DEFAULT '{}',
    
    -- Delivery
    recipients JSONB NOT NULL DEFAULT '[]',
    email_subject VARCHAR(200),
    email_body TEXT,
    
    -- Tracking
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_status VARCHAR(20),
    run_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_exports_active ON scheduled_exports(is_active);
CREATE INDEX idx_scheduled_exports_next_run ON scheduled_exports(next_run_at);
CREATE INDEX idx_scheduled_exports_creator ON scheduled_exports(created_by);

-- ============================================
-- DIGEST SUBSCRIPTIONS
-- Weekly digest email subscriptions
-- ============================================

CREATE TABLE IF NOT EXISTS digest_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    
    -- Preferences
    is_active BOOLEAN NOT NULL DEFAULT true,
    delivery_day INTEGER NOT NULL DEFAULT 1 CHECK (delivery_day >= 0 AND delivery_day <= 6),
    delivery_hour INTEGER NOT NULL DEFAULT 8 CHECK (delivery_hour >= 0 AND delivery_hour <= 23),
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    
    -- Content preferences
    include_sections TEXT[] DEFAULT '{}',
    format VARCHAR(20) NOT NULL DEFAULT 'html' CHECK (format IN ('html', 'pdf', 'both')),
    
    -- Tracking
    last_delivered_at TIMESTAMPTZ,
    last_delivery_error TEXT,
    delivery_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_digest_subscriptions_active ON digest_subscriptions(is_active);
CREATE INDEX idx_digest_subscriptions_delivery ON digest_subscriptions(delivery_day, delivery_hour);
CREATE INDEX idx_digest_subscriptions_user ON digest_subscriptions(user_id);

-- ============================================
-- EMAIL DELIVERY LOG
-- Tracks email delivery attempts
-- ============================================

CREATE TABLE IF NOT EXISTS email_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    email_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_delivery_recipient ON email_delivery_log(recipient);
CREATE INDEX idx_email_delivery_type ON email_delivery_log(email_type);
CREATE INDEX idx_email_delivery_status ON email_delivery_log(status);
CREATE INDEX idx_email_delivery_sent ON email_delivery_log(sent_at DESC);

-- ============================================
-- JOB RUN LOGS
-- Tracks job execution history
-- ============================================

CREATE TABLE IF NOT EXISTS job_run_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_run_logs_type ON job_run_logs(job_type);
CREATE INDEX idx_job_run_logs_run_at ON job_run_logs(run_at DESC);

-- ============================================
-- EXPORT JOBS (Optional: for async exports)
-- Tracks long-running export jobs
-- ============================================

CREATE TABLE IF NOT EXISTS export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request details
    report_type VARCHAR(50) NOT NULL,
    format VARCHAR(20) NOT NULL CHECK (format IN ('csv', 'excel', 'pdf')),
    filters JSONB NOT NULL DEFAULT '{}',
    template_id UUID REFERENCES report_templates(id),
    
    -- Processing
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    
    -- Result
    file_url TEXT,
    file_name VARCHAR(255),
    file_size_bytes BIGINT,
    
    -- Delivery
    delivery_method VARCHAR(20) NOT NULL DEFAULT 'download' CHECK (delivery_method IN ('download', 'email', 'scheduled')),
    delivery_email VARCHAR(255),
    delivered_at TIMESTAMPTZ,
    
    -- User context
    requested_by VARCHAR(255) NOT NULL,
    requested_by_email VARCHAR(255),
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_requester ON export_jobs(requested_by);
CREATE INDEX idx_export_jobs_created ON export_jobs(created_at DESC);

-- ============================================
-- INSERT DEFAULT TEMPLATES
-- ============================================

INSERT INTO report_templates (name, description, template_type, report_types, is_public, sections)
VALUES 
    (
        'Executive Summary',
        'High-level overview for leadership with key metrics and trends',
        'executive_summary',
        ARRAY['signups', 'financial', 'event_performance'],
        true,
        '[
            {"id": "metrics", "title": "Key Metrics", "type": "metrics", "dataSource": "kpi_summary", "order": 1, "visible": true},
            {"id": "signups", "title": "Signup Summary", "type": "chart", "dataSource": "signups", "order": 2, "visible": true},
            {"id": "financial", "title": "Financial Overview", "type": "table", "dataSource": "financial", "order": 3, "visible": true}
        ]'::jsonb
    ),
    (
        'Operations Report',
        'Detailed operational metrics for day-to-day management',
        'operational_report',
        ARRAY['signups', 'event_performance', 'ambassador_productivity'],
        true,
        '[
            {"id": "events", "title": "Event Performance", "type": "table", "dataSource": "event_performance", "order": 1, "visible": true},
            {"id": "ambassadors", "title": "Ambassador Productivity", "type": "table", "dataSource": "ambassador_productivity", "order": 2, "visible": true},
            {"id": "signups", "title": "Signup Details", "type": "table", "dataSource": "signups", "order": 3, "visible": true}
        ]'::jsonb
    ),
    (
        'Financial Report',
        'Revenue, expenses, and profitability analysis',
        'financial_report',
        ARRAY['financial', 'operator_performance'],
        true,
        '[
            {"id": "summary", "title": "Financial Summary", "type": "metrics", "dataSource": "financial", "order": 1, "visible": true},
            {"id": "trend", "title": "Revenue Trend", "type": "chart", "dataSource": "financial", "order": 2, "visible": true},
            {"id": "operators", "title": "Operator Performance", "type": "table", "dataSource": "operator_performance", "order": 3, "visible": true}
        ]'::jsonb
    ),
    (
        'Performance Review',
        'Ambassador and event performance analysis',
        'performance_review',
        ARRAY['ambassador_productivity', 'event_performance'],
        true,
        '[
            {"id": "top-performers", "title": "Top Performers", "type": "table", "dataSource": "ambassador_productivity", "order": 1, "visible": true},
            {"id": "events", "title": "Event Results", "type": "table", "dataSource": "event_performance", "order": 2, "visible": true}
        ]'::jsonb
    )
ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE export_audit_logs IS 'WO-75: Audit trail for all export operations';
COMMENT ON TABLE report_templates IS 'WO-75: Customizable report templates for stakeholders';
COMMENT ON TABLE scheduled_exports IS 'WO-75: Recurring export configurations';
COMMENT ON TABLE digest_subscriptions IS 'WO-75: Weekly digest email subscriptions';
COMMENT ON TABLE email_delivery_log IS 'WO-75: Email delivery tracking';
COMMENT ON TABLE job_run_logs IS 'WO-75: Background job execution history';
COMMENT ON TABLE export_jobs IS 'WO-75: Async export job tracking';
