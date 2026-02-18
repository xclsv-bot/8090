-- Event Logs Table for WebSocket Event Audit & Replay
-- WO-21: Real-time event system

CREATE TABLE IF NOT EXISTS event_logs (
    id UUID PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    user_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_event_logs_user ON event_logs(user_id);

-- Composite index for replay queries
CREATE INDEX IF NOT EXISTS idx_event_logs_replay ON event_logs(created_at, event_type);

-- Partition by month for performance (optional, for high-volume deployments)
-- This can be enabled later when needed
