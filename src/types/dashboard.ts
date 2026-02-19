/**
 * Dashboard Type Definitions
 * WO-72: Real-time Analytics Dashboards and Performance Tracking APIs
 */

import type { TrendDirection } from './analytics.js';

// ============================================
// COMMON TYPES
// ============================================

// Re-export TrendDirection for convenience
export type { TrendDirection };

export type PerformanceIndicator = 
  | 'exceptional'      // >= 120% of goal
  | 'meeting_goal'     // 80-120% of goal
  | 'underperforming'  // < 80% of goal
  | 'no_goal';         // No goal set

export type DashboardSortOrder = 'asc' | 'desc';

// ============================================
// EVENT PERFORMANCE DASHBOARD
// ============================================

export interface EventPerformanceFilters {
  fromDate: string;
  toDate: string;
  region?: string;
  operatorId?: number;
  eventType?: string;
  sortBy?: 'signups' | 'revenue' | 'achievement' | 'date';
  sortOrder?: DashboardSortOrder;
  limit?: number;
  offset?: number;
}

export interface EventPerformanceDashboard {
  summary: {
    totalEvents: number;
    totalSignups: number;
    totalRevenue: number;
    avgSignupsPerEvent: number;
    avgRevenue: number;
    goalAchievementRate: number;
    validationRate: number;
    topPerformingEventId?: string;
  };
  events: EventGoalPerformance[];
  goalAnalysis: GoalVsActualSummary;
  regionBreakdown: {
    region: string;
    events: number;
    signups: number;
    revenue: number;
    goalAchievement: number;
  }[];
  operatorBreakdown: {
    operatorId: number;
    operatorName: string;
    signups: number;
    revenue: number;
    validationRate: number;
  }[];
  trendData: {
    date: string;
    events: number;
    signups: number;
    revenue: number;
    goalAchievement: number;
  }[];
  filters: {
    fromDate: string;
    toDate: string;
    region?: string;
    operatorId?: number;
    eventType?: string;
  };
  generatedAt: Date;
}

export interface EventGoalPerformance {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  location: string;
  region: string;
  signupGoal: number;
  actualSignups: number;
  validatedSignups: number;
  achievementPercent: number | null;
  performanceIndicator: PerformanceIndicator;
  totalRevenue: number;
  ambassadorCount: number;
  avgSignupsPerAmbassador: number;
  status: string;
}

// ============================================
// GOAL VS ACTUAL ANALYSIS
// ============================================

export interface GoalVsActualSummary {
  totalGoal: number;
  totalActual: number;
  overallAchievementPercent: number;
  eventsWithGoals: number;
  eventsMeetingGoal: number;      // 80-120%
  eventsExceedingGoal: number;    // >= 120%
  eventsUnderperforming: number;  // < 80%
  performanceIndicator: PerformanceIndicator;
}

export interface AmbassadorGoalPerformance {
  ambassadorId: string;
  ambassadorName: string;
  eventCount: number;
  totalGoal: number;
  totalSignups: number;
  validatedSignups: number;
  avgAchievementPercent: number | null;
  eventsMeetingGoal: number;
  performanceIndicator: PerformanceIndicator;
}

// ============================================
// REAL-TIME SIGNUP TRACKING
// ============================================

export interface RealtimeSignupTracking {
  signupsToday: number;
  signupsThisHour: number;
  validatedToday: number;
  pendingToday: number;
  rejectedToday: number;
  revenueToday: number;
  validationRate: number;
  signupsByHour: SignupsByHour[];
  activeEvents: number;
  activeAmbassadors: number;
  recentSignups: {
    id: string;
    customerName: string;
    operatorName: string;
    ambassadorName: string;
    eventTitle: string;
    createdAt: Date;
    validationStatus: string;
  }[];
  comparison: {
    yesterdaySignups: number;
    lastWeekSameDaySignups: number;
    signupsTrend: TrendDirection;
    percentChangeFromYesterday: number;
  };
  lastUpdated: Date;
}

export interface SignupsByHour {
  hour: number;
  signups: number;
  validated: number;
  revenue: number;
}

// ============================================
// OPERATOR PERFORMANCE DASHBOARD
// ============================================

export interface OperatorPerformanceFilters {
  fromDate: string;
  toDate: string;
  region?: string;
  operatorIds?: number[];
  groupByLocation?: boolean;
  sortBy?: 'signups' | 'revenue' | 'dropOff' | 'validation';
  sortOrder?: DashboardSortOrder;
  limit?: number;
  offset?: number;
}

export interface OperatorPerformanceDashboard {
  summary: {
    totalOperators: number;
    totalSignups: number;
    totalRevenue: number;
    avgSignupsPerOperator: number;
    avgDropOffRate: number;
    flaggedOperatorCount: number;
  };
  operators: OperatorMetricsDetail[];
  dropOffAnalysis: OperatorDropOffAnalysis;
  locationBreakdown: OperatorLocationBreakdown[];
  trendData: OperatorTrendData[];
  filters: {
    fromDate: string;
    toDate: string;
    region?: string;
    operatorIds?: number[];
    groupByLocation?: boolean;
  };
  generatedAt: Date;
}

export interface OperatorMetricsDetail {
  operatorId: number;
  operatorName: string;
  signupVolume: number;
  validatedSignups: number;
  rejectedSignups: number;
  pendingSignups: number;
  revenueContribution: number;
  validationRate: number;
  dropOffRate: number;
  eventCount: number;
  regionCount: number;
  isFlagged: boolean;
  flagReason?: string;
  performanceTrend: TrendDirection;
}

export interface OperatorDropOffAnalysis {
  averageDropOffRate: number;
  minDropOffRate: number;
  maxDropOffRate: number;
  standardDeviation: number;
  totalOperatorsAnalyzed: number;
  flaggedOperatorsCount: number;
  flagThreshold: number;
  worstPerformers: {
    operatorId: number;
    operatorName: string;
    dropOffRate: number;
    signupVolume: number;
    deviationFromAverage: number;
  }[];
}

export interface OperatorLocationBreakdown {
  location: string;
  totalSignups: number;
  totalRevenue: number;
  operatorCount: number;
  operators: {
    operatorId: number;
    operatorName: string;
    signups: number;
    revenue: number;
    validationRate: number;
    dropOffRate: number;
  }[];
}

export interface OperatorTrendData {
  operatorId: number;
  operatorName: string;
  dataPoints: {
    date: string;
    signups: number;
    validated: number;
    rejected: number;
    revenue: number;
    dropOffRate: number;
  }[];
  volumeTrend: TrendDirection;
  dropOffTrend: TrendDirection;
}

// ============================================
// VENUE PERFORMANCE DASHBOARD
// ============================================

export interface VenuePerformanceFilters {
  fromDate: string;
  toDate: string;
  region?: string;
  minEvents?: number;
  sortBy?: 'signups' | 'revenue' | 'avgSignups' | 'events' | 'score' | 'consistency' | 'profitMargin';
  sortOrder?: DashboardSortOrder;
  limit?: number;
  offset?: number;
}

export interface VenuePerformanceDashboard {
  summary: {
    totalVenues: number;
    totalEvents: number;
    totalSignups: number;
    totalRevenue: number;
    avgSignupsPerEvent: number;
    avgProfitMargin: number;
    venuesWithReliableData: number;
    avgPerformanceScore: number;
  };
  venues: VenueMetricsDetail[];
  topVenues: VenueMetricsDetail[];
  bottomVenues: VenueMetricsDetail[];
  consistencyAnalysis: VenueConsistencyAnalysis;
  filters: {
    fromDate: string;
    toDate: string;
    region?: string;
    minEvents?: number;
  };
  generatedAt: Date;
}

export interface VenueMetricsDetail {
  venueId: string;
  venueName: string;
  location: string;
  city: string;
  region: string;
  eventCount: number;
  totalSignups: number;
  validatedSignups: number;
  avgSignupsPerEvent: number;
  minSignups: number;
  maxSignups: number;
  signupsStandardDeviation: number;
  totalRevenue: number;
  totalExpenses: number;
  avgProfitMargin: number;
  performanceScore: number;
  consistencyScore: number;
  hasReliableData: boolean;
  insufficientDataMessage?: string;
  firstEventDate: string;
  lastEventDate: string;
}

export interface VenueConsistencyAnalysis {
  avgConsistencyScore: number;
  highlyConsistentVenues: number;
  moderatelyConsistentVenues: number;
  inconsistentVenues: number;
  totalVenuesAnalyzed: number;
  thresholds: {
    highlyConsistent: number;
    moderatelyConsistent: number;
  };
}

export interface VenueEventHistory {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  signups: number;
  validatedSignups: number;
  revenue: number;
  ambassadorCount: number;
  performanceScore: number;
}

// ============================================
// WEBSOCKET EVENT TYPES
// ============================================

export interface DashboardWebSocketEvent {
  type: 'dashboard.signup_update' | 'dashboard.metrics_refresh' | 'dashboard.alert';
  payload: unknown;
  timestamp: Date;
}

export interface SignupUpdatePayload {
  signup: {
    id: string;
    operatorId: number;
    ambassadorId: string;
    eventId?: string;
    validationStatus: string;
    cpaApplied?: number;
  };
  metrics: {
    signupsToday: number;
    signupsThisHour: number;
    revenueToday: number;
    validationRate: number;
  };
}

export interface MetricsRefreshPayload extends RealtimeSignupTracking {}

// ============================================
// API RESPONSE WRAPPERS
// ============================================

export interface DashboardApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    totalCount?: number;
    limit?: number;
    offset?: number;
    generatedAt?: Date;
  };
}

export interface DashboardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
