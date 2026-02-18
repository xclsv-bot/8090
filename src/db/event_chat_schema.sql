-- Event Chat Schema
-- WO-25: Event Chat data models and WebSocket infrastructure

-- ============================================
-- TABLES
-- ============================================

-- Chat Rooms: One per event (or general channels)
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    room_type VARCHAR(50) NOT NULL DEFAULT 'event',  -- 'event', 'team', 'direct', 'announcement'
    name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat Room Members: Who can access the room
CREATE TABLE IF NOT EXISTS chat_room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(50) DEFAULT 'member',  -- 'admin', 'moderator', 'member'
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    is_muted BOOLEAN DEFAULT false,
    last_read_at TIMESTAMPTZ,
    CONSTRAINT unique_room_member UNIQUE (room_id, user_id)
);

-- Chat Messages: All messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',  -- 'text', 'image', 'file', 'system'
    content TEXT NOT NULL,
    -- Attachments
    attachment_key VARCHAR(500),
    attachment_name VARCHAR(255),
    attachment_type VARCHAR(100),
    attachment_size INTEGER,
    -- Reply/thread
    reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    -- Status
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Message Reactions
CREATE TABLE IF NOT EXISTS chat_message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    reaction VARCHAR(50) NOT NULL,  -- emoji code
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_reaction UNIQUE (message_id, user_id, reaction)
);

-- Message Read Receipts
CREATE TABLE IF NOT EXISTS chat_read_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_read_receipt UNIQUE (message_id, user_id)
);

-- Pinned Messages
CREATE TABLE IF NOT EXISTS chat_pinned_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    pinned_by UUID NOT NULL,
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_pinned_message UNIQUE (room_id, message_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_rooms_event ON chat_rooms(event_id);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON chat_rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_active ON chat_rooms(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_members_room ON chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_room_members(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_room ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_type ON chat_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON chat_messages(reply_to_id);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON chat_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_message ON chat_read_receipts(message_id);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE TRIGGER chat_rooms_updated_at
    BEFORE UPDATE ON chat_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
