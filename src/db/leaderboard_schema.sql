-- Leaderboard Schema Updates
-- WO-73: Ambassador Analytics and Leaderboard Systems

-- ============================================
-- AMBASSADOR TABLE UPDATES
-- ============================================

-- Add leaderboard opt-in field for privacy controls
-- AC-AR-005.6: When an ambassador has leaderboard_opt_in set to false, exclude from leaderboard
ALTER TABLE ambassadors 
ADD COLUMN IF NOT EXISTS leaderboard_opt_in BOOLEAN DEFAULT true;

-- Add home region for regional leaderboard filtering
-- AC-AR-005.4: Filter by home_region to compare within cohorts
ALTER TABLE ambassadors 
ADD COLUMN IF NOT EXISTS home_region VARCHAR(100);

-- ============================================
-- INDEXES FOR LEADERBOARD QUERIES
-- ============================================

-- Index for leaderboard opt-in filtering
CREATE INDEX IF NOT EXISTS idx_ambassadors_leaderboard_opt_in 
ON ambassadors(leaderboard_opt_in) 
WHERE leaderboard_opt_in = true;

-- Index for regional leaderboard queries
CREATE INDEX IF NOT EXISTS idx_ambassadors_home_region 
ON ambassadors(home_region) 
WHERE home_region IS NOT NULL;

-- Composite index for skill level + opt-in filtering
CREATE INDEX IF NOT EXISTS idx_ambassadors_skill_leaderboard 
ON ambassadors(skill_level, leaderboard_opt_in) 
WHERE leaderboard_opt_in = true;

-- Composite index for region + opt-in filtering
CREATE INDEX IF NOT EXISTS idx_ambassadors_region_leaderboard 
ON ambassadors(home_region, leaderboard_opt_in) 
WHERE leaderboard_opt_in = true AND home_region IS NOT NULL;

-- ============================================
-- LEADERBOARD SNAPSHOT TABLE (Optional - for caching)
-- ============================================

-- Store daily leaderboard snapshots for historical analysis
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- 'signups', 'performance_score', 'goal_achievement', 'signups_per_hour'
    
    -- Filters applied
    skill_level VARCHAR(50),
    region VARCHAR(100),
    
    -- Leaderboard data (JSONB for flexibility)
    rankings JSONB NOT NULL,
    -- Example: [{"rank": 1, "ambassadorId": "...", "value": 150}, ...]
    
    -- Summary statistics
    total_participants INTEGER NOT NULL DEFAULT 0,
    avg_value DECIMAL(10, 2),
    median_value DECIMAL(10, 2),
    top_value DECIMAL(10, 2),
    
    -- Metadata
    generated_by VARCHAR(50) DEFAULT 'system',
    processing_time_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT unique_leaderboard_snapshot 
    UNIQUE (snapshot_date, metric_type, skill_level, region)
);

-- Index for leaderboard snapshot queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_date 
ON leaderboard_snapshots(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_metric 
ON leaderboard_snapshots(metric_type);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_date_metric 
ON leaderboard_snapshots(snapshot_date DESC, metric_type);

-- ============================================
-- PERFORMANCE HISTORY UPDATES
-- ============================================

-- Add columns to ambassador_performance_history for cohort tracking
ALTER TABLE ambassador_performance_history 
ADD COLUMN IF NOT EXISTS skill_level_at_time VARCHAR(50);

ALTER TABLE ambassador_performance_history 
ADD COLUMN IF NOT EXISTS region_at_time VARCHAR(100);

ALTER TABLE ambassador_performance_history 
ADD COLUMN IF NOT EXISTS signups_per_hour DECIMAL(10, 2);

ALTER TABLE ambassador_performance_history 
ADD COLUMN IF NOT EXISTS goal_achievement_percent DECIMAL(5, 2);

-- Index for cohort analysis on historical data
CREATE INDEX IF NOT EXISTS idx_perf_history_skill_level 
ON ambassador_performance_history(skill_level_at_time);

CREATE INDEX IF NOT EXISTS idx_perf_history_region 
ON ambassador_performance_history(region_at_time);

-- ============================================
-- DATA MIGRATION
-- ============================================

-- Set default leaderboard_opt_in to true for existing ambassadors
UPDATE ambassadors 
SET leaderboard_opt_in = true 
WHERE leaderboard_opt_in IS NULL;

-- Backfill home_region from the most common state in their signups if not set
-- (This is a best-effort migration - can be manually corrected later)
WITH ambassador_regions AS (
    SELECT 
        s.ambassador_id,
        e.state,
        COUNT(*) as event_count,
        ROW_NUMBER() OVER (PARTITION BY s.ambassador_id ORDER BY COUNT(*) DESC) as rn
    FROM signups s
    JOIN events e ON e.id = s.event_id
    WHERE e.state IS NOT NULL
    GROUP BY s.ambassador_id, e.state
)
UPDATE ambassadors a
SET home_region = ar.state
FROM ambassador_regions ar
WHERE a.id = ar.ambassador_id 
    AND ar.rn = 1
    AND a.home_region IS NULL;

-- ============================================
-- FUNCTIONS FOR LEADERBOARD CALCULATIONS
-- ============================================

-- Function to calculate performance score
CREATE OR REPLACE FUNCTION calculate_ambassador_performance_score(
    p_total_signups INTEGER,
    p_validated_signups INTEGER,
    p_events_worked INTEGER,
    p_goal_achievement DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    v_validation_rate DECIMAL;
    v_signups_per_event DECIMAL;
    v_volume_bonus DECIMAL;
    v_score DECIMAL;
BEGIN
    -- Validation rate (40% weight)
    IF p_total_signups > 0 THEN
        v_validation_rate := (p_validated_signups::DECIMAL / p_total_signups) * 100;
    ELSE
        v_validation_rate := 0;
    END IF;
    
    -- Signups per event, capped (30% weight)
    IF p_events_worked > 0 THEN
        v_signups_per_event := LEAST(p_total_signups::DECIMAL / p_events_worked, 20);
    ELSE
        v_signups_per_event := 0;
    END IF;
    
    -- Volume bonus (10% weight)
    v_volume_bonus := LEAST(p_total_signups::DECIMAL / 10, 10);
    
    -- Calculate weighted score
    v_score := (v_validation_rate * 0.4) +
               (v_signups_per_event * 5 * 0.3) +
               (LEAST(COALESCE(p_goal_achievement, 0), 150) / 1.5 * 0.2) +
               (v_volume_bonus * 0.1);
    
    RETURN ROUND(v_score, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to determine performance trend
CREATE OR REPLACE FUNCTION determine_performance_trend(
    p_current_value DECIMAL,
    p_previous_value DECIMAL
) RETURNS VARCHAR AS $$
BEGIN
    IF p_previous_value IS NULL OR p_previous_value = 0 THEN
        RETURN 'stable';
    END IF;
    
    DECLARE
        v_percent_change DECIMAL;
    BEGIN
        v_percent_change := ((p_current_value - p_previous_value) / p_previous_value) * 100;
        
        IF v_percent_change > 10 THEN
            RETURN 'improving';
        ELSIF v_percent_change < -10 THEN
            RETURN 'declining';
        ELSE
            RETURN 'stable';
        END IF;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN ambassadors.leaderboard_opt_in IS 
'Privacy control: when false, ambassador is excluded from public leaderboards (AC-AR-005.6)';

COMMENT ON COLUMN ambassadors.home_region IS 
'Ambassador home region for regional cohort filtering (AC-AR-005.4)';

COMMENT ON TABLE leaderboard_snapshots IS 
'Daily snapshots of leaderboard rankings for historical analysis and performance tracking';

COMMENT ON FUNCTION calculate_ambassador_performance_score IS 
'Calculate weighted performance score: 40% validation rate, 30% signups/event, 20% goal achievement, 10% volume';
