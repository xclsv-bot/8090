/**
 * Leaderboard & Ambassador Analytics Type Definitions
 * WO-73: Ambassador Analytics and Leaderboard Systems
 */

import type { TrendDirection } from './analytics.js';
import type { AmbassadorSkillLevel } from './models.js';

// ============================================
// ENUMS & CONSTANTS
// ============================================

export type LeaderboardMetric = 
  | 'signups'           // Total sign-ups
  | 'performance_score' // Calculated performance score
  | 'goal_achievement'  // Goal achievement percentage
  | 'signups_per_hour'; // Sign-ups per hour (hourly ambassadors)

export type PerformanceTrendStatus = 'improving' | 'declining' | 'stable';

export type TimelinePeriod = 'daily' | 'weekly';

// ============================================
// LEADERBOARD TYPES (REQ-AR-005)
// ============================================

export interface LeaderboardFilters {
  fromDate: string;
  toDate: string;
  metric?: LeaderboardMetric;
  skillLevel?: AmbassadorSkillLevel;
  region?: string;
  limit?: number;
  offset?: number;
  includePreviousPeriod?: boolean;  // For rank change highlighting
}

export interface LeaderboardEntry {
  rank: number;
  previousRank?: number;
  rankChange?: number;       // Positive = improved, negative = dropped
  isSignificantChange: boolean;  // AC-AR-005.5: Highlight significant improvements
  
  ambassadorId: string;
  ambassadorName: string;
  skillLevel: AmbassadorSkillLevel;
  region?: string;
  
  // Metric values
  metricValue: number;
  metricLabel: string;       // Human-readable metric name
  
  // Supporting stats (AC-AR-005.3)
  totalSignups: number;
  eventsWorked: number;
  validatedSignups: number;
  validationRate: number;
  
  // Optional detailed metrics
  performanceScore?: number;
  goalAchievementPercent?: number;
  signupsPerHour?: number;
  avgSignupsPerEvent?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  summary: LeaderboardSummary;
  filters: {
    fromDate: string;
    toDate: string;
    metric: LeaderboardMetric;
    skillLevel?: AmbassadorSkillLevel;
    region?: string;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  generatedAt: Date;
}

export interface LeaderboardSummary {
  totalParticipants: number;         // Opted-in ambassadors
  totalExcluded: number;             // Opted-out ambassadors
  avgMetricValue: number;
  medianMetricValue: number;
  topPerformerName: string;
  topPerformerValue: number;
  significantImprovements: number;   // Count of ambassadors with notable rank jumps
}

// ============================================
// AMBASSADOR PERFORMANCE BREAKDOWN (REQ-AR-006)
// ============================================

export interface AmbassadorPerformanceFilters {
  ambassadorId: string;
  fromDate: string;
  toDate: string;
  timelinePeriod?: TimelinePeriod;
}

export interface AmbassadorPerformanceBreakdown {
  ambassador: {
    id: string;
    name: string;
    email: string;
    skillLevel: AmbassadorSkillLevel;
    region?: string;
    compensationType: 'per_signup' | 'hourly' | 'hybrid';
    leaderboardOptIn: boolean;
  };
  
  // AC-AR-006.1: Core metrics
  summary: {
    totalSignups: number;
    validatedSignups: number;
    rejectedSignups: number;
    eventsWorked: number;
    avgSignupsPerEvent: number;
    totalHoursWorked?: number;      // For hourly ambassadors
  };
  
  // AC-AR-006.2: Goal achievement
  goalPerformance: {
    eventsWithGoals: number;
    eventsMeetingGoal: number;      // 80-120%
    eventsExceedingGoal: number;    // >= 120%
    eventsUnderperforming: number;  // < 80%
    overallAchievementPercent: number;
  };
  
  // AC-AR-006.3: Sign-ups per hour (hourly events)
  hourlyPerformance: {
    totalHourlyEvents: number;
    totalSignupsInHourlyEvents: number;
    totalHoursInHourlyEvents: number;
    avgSignupsPerHour: number;
  };
  
  // AC-AR-006.4: Breakdown by operator
  operatorBreakdown: OperatorPerformanceBreakdown[];
  
  // AC-AR-006.5: Timeline/trends
  timeline: PerformanceTimelineEntry[];
  
  // AC-AR-006.6: Cohort comparison
  cohortComparison: CohortComparison;
  
  // Performance trend
  trend: {
    status: PerformanceTrendStatus;
    percentChange: number;
    comparisonPeriod: string;       // e.g., "vs previous 30 days"
  };
  
  // Calculated scores
  performanceScore: number;
  
  filters: {
    fromDate: string;
    toDate: string;
  };
  generatedAt: Date;
}

export interface OperatorPerformanceBreakdown {
  operatorId: number;
  operatorName: string;
  signups: number;
  validatedSignups: number;
  validationRate: number;
  revenue: number;
  eventsCount: number;
  isTopOperator: boolean;          // Flag for ambassador's best operator
}

export interface PerformanceTimelineEntry {
  period: string;                  // Date or week label
  signups: number;
  validatedSignups: number;
  eventsWorked: number;
  goalAchievement?: number;
  trend: TrendDirection;
}

export interface CohortComparison {
  // Skill level cohort
  skillLevelCohort: {
    cohortName: string;            // e.g., "Pro" ambassadors
    cohortSize: number;
    ambassadorValue: number;
    cohortAverage: number;
    cohortMedian: number;
    percentile: number;            // Ambassador's percentile in cohort
    comparison: 'above' | 'below' | 'average';
  };
  
  // Region cohort
  regionCohort?: {
    cohortName: string;            // e.g., "California" ambassadors
    cohortSize: number;
    ambassadorValue: number;
    cohortAverage: number;
    cohortMedian: number;
    percentile: number;
    comparison: 'above' | 'below' | 'average';
  };
}

// ============================================
// COHORT ANALYSIS TYPES
// ============================================

export interface CohortAnalysisFilters {
  fromDate: string;
  toDate: string;
  groupBy: 'skill_level' | 'region';
  metric?: LeaderboardMetric;
}

export interface CohortAnalysisResponse {
  cohorts: CohortMetrics[];
  summary: {
    totalCohorts: number;
    totalAmbassadors: number;
    avgMetricValue: number;
    topCohortName: string;
    topCohortValue: number;
  };
  filters: CohortAnalysisFilters;
  generatedAt: Date;
}

export interface CohortMetrics {
  cohortName: string;
  cohortSize: number;
  
  // Aggregated metrics
  totalSignups: number;
  avgSignups: number;
  medianSignups: number;
  minSignups: number;
  maxSignups: number;
  
  avgPerformanceScore: number;
  avgGoalAchievement: number;
  avgSignupsPerHour: number;
  
  // Top performers in cohort
  topPerformers: {
    ambassadorId: string;
    ambassadorName: string;
    value: number;
  }[];
}

// ============================================
// TREND ANALYSIS TYPES
// ============================================

export interface TrendAnalysisFilters {
  ambassadorId?: string;           // Optional - for individual
  skillLevel?: AmbassadorSkillLevel;
  region?: string;
  periods: number;                 // Number of periods to analyze
  periodType: 'week' | 'month';
}

export interface TrendAnalysisResponse {
  trends: TrendPeriod[];
  overallTrend: PerformanceTrendStatus;
  percentChangeFirstToLast: number;
  projectedNextPeriod?: number;    // Simple projection
  filters: TrendAnalysisFilters;
  generatedAt: Date;
}

export interface TrendPeriod {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  
  signups: number;
  eventsWorked: number;
  ambassadorsActive: number;
  avgSignupsPerAmbassador: number;
  goalAchievementPercent: number;
  
  changeFromPrevious?: {
    signupsChange: number;
    signupsChangePercent: number;
    trend: TrendDirection;
  };
}

// ============================================
// PRIVACY CONTROLS
// ============================================

export interface LeaderboardOptInUpdate {
  ambassadorId: string;
  optIn: boolean;
}

export interface LeaderboardPrivacySettings {
  ambassadorId: string;
  leaderboardOptIn: boolean;
  showInRegionalLeaderboard: boolean;
  showInSkillLevelLeaderboard: boolean;
  updatedAt: Date;
}

// ============================================
// API RESPONSE WRAPPERS
// ============================================

export interface LeaderboardApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    totalCount?: number;
    limit?: number;
    offset?: number;
    generatedAt?: Date;
  };
}
