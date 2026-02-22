-- WO-97: Ambassador Notification on Event Status Change
-- Migration: Add notification_logs table

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  ambassador_id UUID REFERENCES ambassadors(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  recipient_email VARCHAR(255),
  subject VARCHAR(255),
  body TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  idempotency_key VARCHAR(255) UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notification_logs_event ON notification_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_ambassador ON notification_logs(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_retry ON notification_logs(status, next_retry_at) 
  WHERE status = 'pending' OR status = 'retrying';

-- Comments
COMMENT ON TABLE notification_logs IS 'Tracks all notification sends for events (WO-97)';
COMMENT ON COLUMN notification_logs.idempotency_key IS 'Unique key to prevent duplicate notifications (event_id:ambassador_id:type)';
COMMENT ON COLUMN notification_logs.status IS 'pending, sent, failed, retrying';
