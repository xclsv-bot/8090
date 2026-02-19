-- Support Hub Real-time Schema
-- WO-58: Support Hub Real-time Messaging System
-- Phase 12: Support Hub Foundation
--
-- Adds real-time messaging tables for:
-- - Event logging and replay
-- - Push notifications
-- - Direct messaging conversations
-- - Admin presence tracking
-- - SLA monitoring enhancements

-- ============================================
-- ENUM TYPES
-- ============================================

-- Admin presence status
DO $$ BEGIN
    CREATE TYPE admin_presence_status AS ENUM ('online', 'offline', 'away', 'busy');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Notification priority
DO $$ BEGIN
    CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABLES
-- ============================================

-- Support Hub Events: Event logging for audit and replay
CREATE TABLE IF NOT EXISTS support_hub_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    user_id UUID,  -- User who triggered the event (if applicable)
    target_user_ids UUID[] DEFAULT '{}',  -- Users who should receive the event
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Partition by month for efficient cleanup
    CONSTRAINT support_hub_events_created_at_check CHECK (created_at IS NOT NULL)
);

-- Support Hub Notifications: Persistent notification storage
CREATE TABLE IF NOT EXISTS support_hub_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    title VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    
    -- Targeting
    target_user_ids UUID[] NOT NULL,
    
    -- Priority and Category
    priority notification_priority NOT NULL DEFAULT 'normal',
    category VARCHAR(100) NOT NULL,
    
    -- Action
    action_url VARCHAR(2000),
    image_url VARCHAR(2000),
    data JSONB DEFAULT '{}',
    
    -- Expiration
    expires_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification Read Status: Track which users have read which notifications
CREATE TABLE IF NOT EXISTS notification_read_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES support_hub_notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_notification_user_read UNIQUE (notification_id, user_id)
);

-- Direct Message Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Participants (always 2 for DM)
    participant1_id UUID NOT NULL,
    participant2_id UUID NOT NULL,
    
    -- Convenience references for querying
    ambassador_id UUID,  -- If one participant is ambassador
    admin_id UUID,  -- If one participant is admin
    
    -- Last message info for listing
    last_message_at TIMESTAMPTZ,
    last_message_preview VARCHAR(200),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique conversation between two users
    CONSTRAINT unique_conversation_participants UNIQUE (participant1_id, participant2_id),
    CONSTRAINT different_participants CHECK (participant1_id != participant2_id)
);

-- Direct Messages
CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parent Conversation
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Sender
    sender_id UUID NOT NULL,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('ambassador', 'admin')),
    
    -- Content
    content TEXT NOT NULL,
    
    -- Delivery Status
    delivered_at TIMESTAMPTZ,  -- When delivered to recipient
    read_at TIMESTAMPTZ,  -- When read by recipient
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin Presence: Track admin availability status
CREATE TABLE IF NOT EXISTS admin_presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL UNIQUE,
    status admin_presence_status NOT NULL DEFAULT 'offline',
    status_message VARCHAR(255),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ALTER EXISTING TABLES
-- ============================================

-- Add SLA warning tracking to support_tickets
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS sla_warning_sent_at TIMESTAMPTZ;

-- ============================================
-- INDEXES
-- ============================================

-- Support Hub Events
CREATE INDEX IF NOT EXISTS idx_support_hub_events_type ON support_hub_events(event_type);
CREATE INDEX IF NOT EXISTS idx_support_hub_events_user ON support_hub_events(user_id);
CREATE INDEX IF NOT EXISTS idx_support_hub_events_created ON support_hub_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_hub_events_targets ON support_hub_events USING GIN(target_user_ids);

-- Support Hub Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_targets ON support_hub_notifications USING GIN(target_user_ids);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON support_hub_notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON support_hub_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON support_hub_notifications(expires_at) WHERE expires_at IS NOT NULL;

-- Notification Read Status
CREATE INDEX IF NOT EXISTS idx_notification_read_user ON notification_read_status(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_read_notification ON notification_read_status(notification_id);

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_ambassador ON conversations(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_conversations_admin ON conversations(admin_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- Direct Messages
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created ON direct_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_unread ON direct_messages(conversation_id, sender_id) WHERE read_at IS NULL;

-- Admin Presence
CREATE INDEX IF NOT EXISTS idx_admin_presence_status ON admin_presence(status) WHERE status != 'offline';
CREATE INDEX IF NOT EXISTS idx_admin_presence_last_seen ON admin_presence(last_seen_at DESC);

-- SLA Warning Index
CREATE INDEX IF NOT EXISTS idx_tickets_sla_warning ON support_tickets(sla_due_at) 
WHERE status NOT IN ('resolved', 'closed') AND sla_breached = false;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update conversation last_message_at when new message is added
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 200),
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_last_message_trigger ON direct_messages;
CREATE TRIGGER update_conversation_last_message_trigger
    AFTER INSERT ON direct_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_last_message();

-- Auto-update admin presence updated_at
CREATE OR REPLACE FUNCTION update_admin_presence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.status != 'offline' THEN
        NEW.last_seen_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_presence_updated_at_trigger ON admin_presence;
CREATE TRIGGER admin_presence_updated_at_trigger
    BEFORE UPDATE ON admin_presence
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_presence_updated_at();

-- ============================================
-- VIEWS
-- ============================================

-- View: Unread message counts per conversation for a user
CREATE OR REPLACE VIEW conversation_unread_counts AS
SELECT 
    c.id AS conversation_id,
    c.participant1_id,
    c.participant2_id,
    COUNT(dm.id) FILTER (WHERE dm.sender_id = c.participant2_id AND dm.read_at IS NULL) AS unread_for_participant1,
    COUNT(dm.id) FILTER (WHERE dm.sender_id = c.participant1_id AND dm.read_at IS NULL) AS unread_for_participant2
FROM conversations c
LEFT JOIN direct_messages dm ON dm.conversation_id = c.id
GROUP BY c.id, c.participant1_id, c.participant2_id;

-- View: Online admins
CREATE OR REPLACE VIEW online_admins_view AS
SELECT 
    ap.admin_id,
    ap.status,
    ap.status_message,
    ap.last_seen_at,
    u.first_name || ' ' || u.last_name AS admin_name
FROM admin_presence ap
JOIN users u ON u.id = ap.admin_id
WHERE ap.status != 'offline'
ORDER BY ap.last_seen_at DESC;

-- ============================================
-- CLEANUP FUNCTIONS
-- ============================================

-- Function to clean up old events (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_support_hub_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM support_hub_events
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired notifications
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM support_hub_notifications
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE support_hub_events IS 'Event log for real-time support hub events, supports audit and replay';
COMMENT ON TABLE support_hub_notifications IS 'Persistent storage for push notifications sent to users';
COMMENT ON TABLE notification_read_status IS 'Track which users have read which notifications';
COMMENT ON TABLE conversations IS 'Direct message conversations between two participants';
COMMENT ON TABLE direct_messages IS 'Individual messages within a conversation';
COMMENT ON TABLE admin_presence IS 'Track admin online/offline/away status for presence indicators';

COMMENT ON COLUMN support_tickets.sla_warning_sent_at IS 'Timestamp when SLA warning notification was sent';
