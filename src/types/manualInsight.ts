/**
 * Manual Insight Types
 * WO-86: Manual Insight Management
 * 
 * Data model for recurring patterns and specific date insights
 * used to adjust traffic/scoring expectations.
 */

/**
 * Traffic expectation levels with corresponding multipliers
 */
export type TrafficExpectation = 'high' | 'moderate' | 'low';

/**
 * Multipliers for each traffic expectation level
 */
export const TRAFFIC_MULTIPLIERS: Record<TrafficExpectation, number> = {
  high: 1.3,
  moderate: 1.0,
  low: 0.7,
};

/**
 * Days of the week (0 = Sunday, 6 = Saturday)
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Insight type - recurring patterns vs specific dates
 */
export type InsightType = 'recurring' | 'specific';

/**
 * Base insight fields shared by all insight types
 */
export interface ManualInsightBase {
  id: string;
  operatorId?: string; // null = global insight
  insightType: InsightType;
  trafficExpectation: TrafficExpectation;
  label: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

/**
 * Recurring pattern insight (e.g., "Fridays are always busy")
 */
export interface RecurringInsight extends ManualInsightBase {
  insightType: 'recurring';
  dayOfWeek: DayOfWeek;
  startDate?: string; // YYYY-MM-DD, when this pattern starts applying
  endDate?: string;   // YYYY-MM-DD, when this pattern stops applying
}

/**
 * Specific date insight (e.g., "Super Bowl Sunday")
 */
export interface SpecificDateInsight extends ManualInsightBase {
  insightType: 'specific';
  date: string; // YYYY-MM-DD
  autoExpire: boolean; // defaults to true
}

/**
 * Union type for all insight types
 */
export type ManualInsight = RecurringInsight | SpecificDateInsight;

/**
 * Input for creating a recurring insight
 */
export interface CreateRecurringInsightInput {
  operatorId?: string;
  dayOfWeek: DayOfWeek;
  trafficExpectation: TrafficExpectation;
  label: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Input for creating a specific date insight
 */
export interface CreateSpecificDateInsightInput {
  operatorId?: string;
  date: string;
  trafficExpectation: TrafficExpectation;
  label: string;
  notes?: string;
  autoExpire?: boolean;
}

/**
 * Input for updating an insight
 */
export interface UpdateInsightInput {
  trafficExpectation?: TrafficExpectation;
  label?: string;
  notes?: string;
  isActive?: boolean;
  // Recurring-specific
  dayOfWeek?: DayOfWeek;
  startDate?: string | null;
  endDate?: string | null;
  // Specific-date only
  date?: string;
  autoExpire?: boolean;
}

/**
 * Query parameters for listing insights
 */
export interface ListInsightsQuery {
  operatorId?: string;
  insightType?: InsightType;
  trafficExpectation?: TrafficExpectation;
  isActive?: boolean;
  includeExpired?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Result from getting the effective insight for a date
 * Used by the scoring algorithm integration
 */
export interface EffectiveInsight {
  insight: ManualInsight | null;
  multiplier: number;
  source: 'specific' | 'recurring' | 'default';
}

/**
 * Database row representation
 */
export interface ManualInsightRow {
  id: string;
  operator_id: string | null;
  insight_type: InsightType;
  day_of_week: number | null;
  date: Date | null;
  traffic_expectation: TrafficExpectation;
  label: string;
  notes: string | null;
  auto_expire: boolean;
  start_date: Date | null;
  end_date: Date | null;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}
