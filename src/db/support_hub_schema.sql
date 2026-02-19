-- Support Hub Schema
-- WO-56: Support Hub Data Models and Database Schema
-- Phase 12: Support Hub Foundation

-- ============================================
-- ENUM TYPES
-- ============================================

-- Article status lifecycle
DO $$ BEGIN
    CREATE TYPE article_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Article category
DO $$ BEGIN
    CREATE TYPE article_category AS ENUM (
        'getting_started',
        'signups',
        'events',
        'payroll',
        'troubleshooting',
        'policies',
        'best_practices',
        'faq'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Video category
DO $$ BEGIN
    CREATE TYPE video_category AS ENUM (
        'onboarding',
        'product_training',
        'sales_techniques',
        'compliance',
        'advanced_skills',
        'announcements'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Video status
DO $$ BEGIN
    CREATE TYPE video_status AS ENUM ('draft', 'processing', 'published', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Training progress status
DO $$ BEGIN
    CREATE TYPE training_progress_status AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticket status lifecycle
DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'waiting_on_user', 'waiting_on_admin', 'resolved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticket priority with SLA implications
DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticket category
DO $$ BEGIN
    CREATE TYPE ticket_category AS ENUM (
        'general_inquiry',
        'technical_issue',
        'payroll_question',
        'event_problem',
        'signup_issue',
        'account_access',
        'feedback',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Message sender type
DO $$ BEGIN
    CREATE TYPE message_sender_type AS ENUM ('ambassador', 'admin', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- SEQUENCES
-- ============================================

-- Sequence for ticket numbers (per year)
CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq START 1;

-- ============================================
-- TABLES
-- ============================================

-- Knowledge Base Articles: Markdown content with tagging and engagement
CREATE TABLE IF NOT EXISTS knowledge_base_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,  -- Markdown content
    excerpt TEXT,  -- Short description for listings
    
    -- Organization
    category article_category NOT NULL,
    tags TEXT[] DEFAULT '{}',  -- Array of tags for filtering
    related_article_ids UUID[] DEFAULT '{}',  -- Related articles
    
    -- Publishing
    status article_status NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    
    -- Authorship
    author_id UUID,  -- Admin user who created
    last_edited_by UUID,  -- Admin user who last edited
    
    -- Engagement Metrics
    view_count INTEGER NOT NULL DEFAULT 0,
    helpful_count INTEGER NOT NULL DEFAULT 0,  -- "Was this helpful?" yes
    not_helpful_count INTEGER NOT NULL DEFAULT 0,  -- "Was this helpful?" no
    
    -- SEO & Search
    meta_title VARCHAR(200),
    meta_description VARCHAR(500),
    search_keywords TEXT[],  -- Additional keywords for search
    
    -- Ordering
    sort_order INTEGER DEFAULT 0,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_article_slug UNIQUE (slug)
);

-- Training Videos: Video content with S3 storage and transcripts
CREATE TABLE IF NOT EXISTS training_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Video File
    video_url VARCHAR(2000) NOT NULL,  -- S3 URL
    video_key VARCHAR(500),  -- S3 key for management
    thumbnail_url VARCHAR(2000),  -- Thumbnail image URL
    
    -- Video Metadata
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    file_size_bytes BIGINT,
    video_format VARCHAR(50),  -- mp4, webm, etc.
    resolution VARCHAR(20),  -- 1080p, 720p, etc.
    
    -- Transcript (for search indexing and accessibility)
    transcript TEXT,
    transcript_vtt TEXT,  -- WebVTT format for captions
    
    -- Organization
    category video_category NOT NULL,
    tags TEXT[] DEFAULT '{}',
    
    -- Publishing
    status video_status NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    
    -- Requirements
    is_required BOOLEAN NOT NULL DEFAULT false,  -- Must watch for onboarding
    required_for_skill_levels TEXT[],  -- Which skill levels must complete
    prerequisite_video_ids UUID[] DEFAULT '{}',  -- Must watch these first
    
    -- Authorship
    created_by UUID,
    
    -- Ordering
    sort_order INTEGER DEFAULT 0,
    chapter_number INTEGER,  -- For sequential courses
    
    -- Engagement
    total_views INTEGER NOT NULL DEFAULT 0,
    total_completions INTEGER NOT NULL DEFAULT 0,
    average_watch_percentage DECIMAL(5, 2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ambassador Training Progress: Track video completion
CREATE TABLE IF NOT EXISTS ambassador_training_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
    
    -- Progress Tracking
    status training_progress_status NOT NULL DEFAULT 'not_started',
    watch_duration_seconds INTEGER NOT NULL DEFAULT 0,  -- Total time watched
    last_position_seconds INTEGER NOT NULL DEFAULT 0,  -- Resume position
    watch_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,  -- 0-100
    
    -- Completion
    completed_at TIMESTAMPTZ,
    completion_count INTEGER NOT NULL DEFAULT 1,  -- Number of times completed
    
    -- Engagement
    started_at TIMESTAMPTZ,
    last_watched_at TIMESTAMPTZ,
    
    -- Quiz/Assessment (if applicable)
    quiz_score DECIMAL(5, 2),
    quiz_passed BOOLEAN,
    quiz_attempts INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_ambassador_video UNIQUE (ambassador_id, video_id)
);

-- Support Tickets: Full lifecycle with SLA tracking
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ticket Number (SUP-2024-001 format)
    ticket_number VARCHAR(50) NOT NULL,
    
    -- Subject and Description
    subject VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    
    -- Categorization
    category ticket_category NOT NULL DEFAULT 'general_inquiry',
    tags TEXT[] DEFAULT '{}',
    
    -- Status and Priority
    status ticket_status NOT NULL DEFAULT 'open',
    priority ticket_priority NOT NULL DEFAULT 'normal',
    
    -- Assignment
    ambassador_id UUID REFERENCES ambassadors(id) ON DELETE SET NULL,  -- Ticket creator
    assigned_to UUID,  -- Admin user assigned to handle
    assigned_at TIMESTAMPTZ,
    
    -- SLA Tracking
    sla_due_at TIMESTAMPTZ,  -- When response is due based on priority
    first_response_at TIMESTAMPTZ,  -- When first admin response was sent
    sla_breached BOOLEAN NOT NULL DEFAULT false,
    
    -- Resolution
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Satisfaction
    satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
    satisfaction_feedback TEXT,
    
    -- Related Items
    related_event_id UUID,
    related_signup_id UUID,
    related_article_ids UUID[] DEFAULT '{}',  -- KB articles shared
    
    -- Metadata
    source VARCHAR(50) DEFAULT 'web',  -- web, mobile, email
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_ticket_number UNIQUE (ticket_number)
);

-- Ticket Messages: Threaded communication with internal notes
CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parent Ticket
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    
    -- Message Content
    content TEXT NOT NULL,
    
    -- Sender
    sender_type message_sender_type NOT NULL,
    sender_id UUID,  -- Ambassador or Admin ID
    sender_name VARCHAR(255),  -- Cached for display
    
    -- Message Type
    is_internal_note BOOLEAN NOT NULL DEFAULT false,  -- Admin-only notes
    is_system_message BOOLEAN NOT NULL DEFAULT false,  -- Auto-generated
    
    -- Attachments
    attachments JSONB DEFAULT '[]',  -- Array of {url, filename, size, type}
    
    -- Read Status
    read_at TIMESTAMPTZ,
    read_by UUID,
    
    -- Reply Threading
    reply_to_message_id UUID REFERENCES ticket_messages(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Article Feedback: Track helpful/not helpful responses
CREATE TABLE IF NOT EXISTS article_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES knowledge_base_articles(id) ON DELETE CASCADE,
    ambassador_id UUID REFERENCES ambassadors(id) ON DELETE SET NULL,
    is_helpful BOOLEAN NOT NULL,
    feedback_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_ambassador_article_feedback UNIQUE (article_id, ambassador_id)
);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
    current_year TEXT;
    next_num INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::TEXT;
    
    -- Get next sequence value
    next_num := nextval('support_ticket_number_seq');
    
    -- Format: SUP-2024-001
    NEW.ticket_number := 'SUP-' || current_year || '-' || LPAD(next_num::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate SLA due date based on priority
CREATE OR REPLACE FUNCTION calculate_sla_due_date()
RETURNS TRIGGER AS $$
BEGIN
    -- SLA times: urgent=1h, high=4h, normal=24h, low=72h
    CASE NEW.priority
        WHEN 'urgent' THEN
            NEW.sla_due_at := NOW() + INTERVAL '1 hour';
        WHEN 'high' THEN
            NEW.sla_due_at := NOW() + INTERVAL '4 hours';
        WHEN 'normal' THEN
            NEW.sla_due_at := NOW() + INTERVAL '24 hours';
        WHEN 'low' THEN
            NEW.sla_due_at := NOW() + INTERVAL '72 hours';
    END CASE;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update article engagement metrics
CREATE OR REPLACE FUNCTION update_article_engagement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_helpful THEN
        UPDATE knowledge_base_articles
        SET helpful_count = helpful_count + 1
        WHERE id = NEW.article_id;
    ELSE
        UPDATE knowledge_base_articles
        SET not_helpful_count = not_helpful_count + 1
        WHERE id = NEW.article_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-generate ticket number
DROP TRIGGER IF EXISTS generate_ticket_number_trigger ON support_tickets;
CREATE TRIGGER generate_ticket_number_trigger
    BEFORE INSERT ON support_tickets
    FOR EACH ROW
    WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
    EXECUTE FUNCTION generate_ticket_number();

-- Auto-calculate SLA due date
DROP TRIGGER IF EXISTS calculate_sla_trigger ON support_tickets;
CREATE TRIGGER calculate_sla_trigger
    BEFORE INSERT ON support_tickets
    FOR EACH ROW
    WHEN (NEW.sla_due_at IS NULL)
    EXECUTE FUNCTION calculate_sla_due_date();

-- Auto-update article engagement on feedback
DROP TRIGGER IF EXISTS update_article_engagement_trigger ON article_feedback;
CREATE TRIGGER update_article_engagement_trigger
    AFTER INSERT ON article_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_article_engagement();

-- Auto-update updated_at timestamps
CREATE OR REPLACE TRIGGER kb_articles_updated_at
    BEFORE UPDATE ON knowledge_base_articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER training_videos_updated_at
    BEFORE UPDATE ON training_videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER training_progress_updated_at
    BEFORE UPDATE ON ambassador_training_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER support_tickets_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER ticket_messages_updated_at
    BEFORE UPDATE ON ticket_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- INDEXES
-- ============================================

-- Knowledge Base Articles
CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON knowledge_base_articles(status);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON knowledge_base_articles(category);
CREATE INDEX IF NOT EXISTS idx_kb_articles_published ON knowledge_base_articles(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON knowledge_base_articles(slug);
CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON knowledge_base_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_kb_articles_search ON knowledge_base_articles USING GIN(search_keywords);
CREATE INDEX IF NOT EXISTS idx_kb_articles_featured ON knowledge_base_articles(is_featured) WHERE is_featured = true;

-- Training Videos
CREATE INDEX IF NOT EXISTS idx_training_videos_status ON training_videos(status);
CREATE INDEX IF NOT EXISTS idx_training_videos_category ON training_videos(category);
CREATE INDEX IF NOT EXISTS idx_training_videos_required ON training_videos(is_required) WHERE is_required = true;
CREATE INDEX IF NOT EXISTS idx_training_videos_sort ON training_videos(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_training_videos_tags ON training_videos USING GIN(tags);

-- Ambassador Training Progress
CREATE INDEX IF NOT EXISTS idx_training_progress_ambassador ON ambassador_training_progress(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_video ON ambassador_training_progress(video_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_status ON ambassador_training_progress(status);
CREATE INDEX IF NOT EXISTS idx_training_progress_completed ON ambassador_training_progress(ambassador_id, completed_at) WHERE completed_at IS NOT NULL;

-- Support Tickets
CREATE INDEX IF NOT EXISTS idx_tickets_number ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_ambassador ON support_tickets(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_open ON support_tickets(status, priority, created_at) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_tickets_sla ON support_tickets(sla_due_at) WHERE status IN ('open', 'in_progress') AND sla_breached = false;
CREATE INDEX IF NOT EXISTS idx_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_tags ON support_tickets USING GIN(tags);

-- Ticket Messages
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON ticket_messages(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_internal ON ticket_messages(ticket_id) WHERE is_internal_note = true;
CREATE INDEX IF NOT EXISTS idx_messages_created ON ticket_messages(ticket_id, created_at);

-- Article Feedback
CREATE INDEX IF NOT EXISTS idx_feedback_article ON article_feedback(article_id);
CREATE INDEX IF NOT EXISTS idx_feedback_ambassador ON article_feedback(ambassador_id);

-- ============================================
-- VIEWS
-- ============================================

-- View: Active open tickets with SLA status
CREATE OR REPLACE VIEW active_tickets_view AS
SELECT 
    t.*,
    a.first_name || ' ' || a.last_name AS ambassador_name,
    a.email AS ambassador_email,
    CASE 
        WHEN t.sla_due_at < NOW() AND t.first_response_at IS NULL THEN true
        ELSE false
    END AS is_sla_at_risk,
    EXTRACT(EPOCH FROM (t.sla_due_at - NOW()))/3600 AS hours_until_sla_breach,
    (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id AND is_internal_note = false) AS message_count
FROM support_tickets t
LEFT JOIN ambassadors a ON t.ambassador_id = a.id
WHERE t.status IN ('open', 'in_progress', 'waiting_on_user', 'waiting_on_admin');

-- View: Ambassador training completion status
CREATE OR REPLACE VIEW ambassador_training_status_view AS
SELECT 
    a.id AS ambassador_id,
    a.first_name || ' ' || a.last_name AS ambassador_name,
    COUNT(DISTINCT v.id) FILTER (WHERE v.is_required = true) AS total_required_videos,
    COUNT(DISTINCT p.video_id) FILTER (WHERE p.status = 'completed' AND v.is_required = true) AS completed_required_videos,
    COUNT(DISTINCT p.video_id) FILTER (WHERE p.status = 'in_progress') AS in_progress_videos,
    ROUND(
        CASE 
            WHEN COUNT(DISTINCT v.id) FILTER (WHERE v.is_required = true) > 0 
            THEN (COUNT(DISTINCT p.video_id) FILTER (WHERE p.status = 'completed' AND v.is_required = true)::DECIMAL / 
                  COUNT(DISTINCT v.id) FILTER (WHERE v.is_required = true)) * 100
            ELSE 100
        END, 2
    ) AS completion_percentage
FROM ambassadors a
CROSS JOIN training_videos v
LEFT JOIN ambassador_training_progress p ON p.ambassador_id = a.id AND p.video_id = v.id
WHERE v.status = 'published'
GROUP BY a.id, a.first_name, a.last_name;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE knowledge_base_articles IS 'Knowledge base articles with markdown content, tagging, and engagement tracking';
COMMENT ON TABLE training_videos IS 'Training video content with S3 storage, transcripts, and progress tracking';
COMMENT ON TABLE ambassador_training_progress IS 'Track video completion and watch progress by ambassador';
COMMENT ON TABLE support_tickets IS 'Support tickets with lifecycle management, priority, and SLA tracking';
COMMENT ON TABLE ticket_messages IS 'Threaded messages for tickets, supporting public messages and internal admin notes';
COMMENT ON TABLE article_feedback IS 'Track helpful/not helpful feedback on knowledge base articles';
