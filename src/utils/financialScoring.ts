/**
 * Financial Scoring Utility - WO-82
 * Calculates event performance scores based on financial and operational metrics
 * 
 * Score Weights (per REQ-FM-008):
 * - Profit Margin: 50%
 * - Signups per Hour: 30%
 * - Goal Achievement: 20%
 */

export interface EventFinancialData {
  // Budget/Projected values
  projectedSignups?: number;
  projectedRevenue?: number;
  projectedProfit?: number;
  projectedMarginPercent?: number;
  
  // Actual values
  actualSignups?: number;
  actualRevenue?: number;
  actualProfit?: number;
  actualMarginPercent?: number;
  actualCost?: number;
  
  // Event metadata
  eventDurationHours?: number; // Duration for signups/hour calculation
}

export interface PerformanceScoreResult {
  performanceScore: number; // 0-100
  breakdown: {
    profitMarginScore: number;      // 0-50 (50% weight)
    signupsPerHourScore: number;    // 0-30 (30% weight)
    goalAchievementScore: number;   // 0-20 (20% weight)
  };
  metrics: {
    actualMarginPercent: number | null;
    signupsPerHour: number | null;
    goalAchievementPercent: number | null;
  };
  tier: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
}

// Configuration thresholds for scoring
const SCORING_CONFIG = {
  // Profit margin thresholds (percentage)
  profitMargin: {
    excellent: 40, // 40%+ margin = full points
    good: 25,      // 25%+ = 80% of points
    average: 15,   // 15%+ = 60% of points
    poor: 5,       // 5%+ = 40% of points
    weight: 50,    // Max 50 points
  },
  
  // Signups per hour thresholds
  signupsPerHour: {
    excellent: 10, // 10+ signups/hr = full points
    good: 6,       // 6+ = 80% of points
    average: 3,    // 3+ = 60% of points
    poor: 1,       // 1+ = 40% of points
    weight: 30,    // Max 30 points
  },
  
  // Goal achievement thresholds (percentage of projected signups achieved)
  goalAchievement: {
    excellent: 100, // 100%+ of goal = full points
    good: 80,       // 80%+ = 80% of points
    average: 60,    // 60%+ = 60% of points
    poor: 40,       // 40%+ = 40% of points
    weight: 20,     // Max 20 points
  },
};

// Tier thresholds based on total score
const TIER_THRESHOLDS = {
  excellent: 85,
  good: 70,
  average: 50,
  below_average: 30,
};

/**
 * Calculate tier-based score for a given metric
 */
function calculateTierScore(
  value: number,
  thresholds: { excellent: number; good: number; average: number; poor: number; weight: number }
): number {
  const { excellent, good, average, poor, weight } = thresholds;
  
  if (value >= excellent) return weight; // 100% of max weight
  if (value >= good) return weight * 0.8; // 80% of max weight
  if (value >= average) return weight * 0.6; // 60% of max weight
  if (value >= poor) return weight * 0.4; // 40% of max weight
  return weight * 0.2; // Below poor threshold = 20% of max weight
}

/**
 * Interpolate score within a tier for more granular scoring
 */
function interpolateScore(
  value: number,
  thresholds: { excellent: number; good: number; average: number; poor: number; weight: number }
): number {
  const { excellent, good, average, poor, weight } = thresholds;
  
  if (value >= excellent) {
    // Cap at 100% but allow slight bonus for exceptional performance
    const bonus = Math.min((value - excellent) / excellent * 0.05, 0.05);
    return Math.min(weight * (1 + bonus), weight);
  }
  
  if (value >= good) {
    const range = excellent - good;
    const progress = (value - good) / range;
    return weight * (0.8 + progress * 0.2);
  }
  
  if (value >= average) {
    const range = good - average;
    const progress = (value - average) / range;
    return weight * (0.6 + progress * 0.2);
  }
  
  if (value >= poor) {
    const range = average - poor;
    const progress = (value - poor) / range;
    return weight * (0.4 + progress * 0.2);
  }
  
  if (value > 0) {
    const progress = value / poor;
    return weight * (0.2 + progress * 0.2);
  }
  
  return 0;
}

/**
 * Determine performance tier based on total score
 */
function determineTier(score: number): PerformanceScoreResult['tier'] {
  if (score >= TIER_THRESHOLDS.excellent) return 'excellent';
  if (score >= TIER_THRESHOLDS.good) return 'good';
  if (score >= TIER_THRESHOLDS.average) return 'average';
  if (score >= TIER_THRESHOLDS.below_average) return 'below_average';
  return 'poor';
}

/**
 * Calculate performance score for an event
 * 
 * @param data - Financial and operational data for the event
 * @returns Performance score result with breakdown
 */
export function calculateEventPerformanceScore(data: EventFinancialData): PerformanceScoreResult {
  const result: PerformanceScoreResult = {
    performanceScore: 0,
    breakdown: {
      profitMarginScore: 0,
      signupsPerHourScore: 0,
      goalAchievementScore: 0,
    },
    metrics: {
      actualMarginPercent: null,
      signupsPerHour: null,
      goalAchievementPercent: null,
    },
    tier: 'poor',
  };
  
  // 1. Calculate Profit Margin Score (50% weight)
  let marginPercent = data.actualMarginPercent;
  
  // Calculate margin if not provided but we have revenue and profit
  if (marginPercent === undefined && data.actualRevenue && data.actualRevenue > 0) {
    marginPercent = ((data.actualProfit || 0) / data.actualRevenue) * 100;
  }
  
  if (marginPercent !== undefined && marginPercent !== null) {
    result.metrics.actualMarginPercent = marginPercent;
    result.breakdown.profitMarginScore = interpolateScore(
      marginPercent,
      SCORING_CONFIG.profitMargin
    );
  }
  
  // 2. Calculate Signups per Hour Score (30% weight)
  const eventDuration = data.eventDurationHours || 4; // Default 4 hours if not specified
  
  if (data.actualSignups !== undefined && eventDuration > 0) {
    const signupsPerHour = data.actualSignups / eventDuration;
    result.metrics.signupsPerHour = Math.round(signupsPerHour * 100) / 100;
    result.breakdown.signupsPerHourScore = interpolateScore(
      signupsPerHour,
      SCORING_CONFIG.signupsPerHour
    );
  }
  
  // 3. Calculate Goal Achievement Score (20% weight)
  if (data.projectedSignups && data.projectedSignups > 0 && data.actualSignups !== undefined) {
    const achievementPercent = (data.actualSignups / data.projectedSignups) * 100;
    result.metrics.goalAchievementPercent = Math.round(achievementPercent * 100) / 100;
    result.breakdown.goalAchievementScore = interpolateScore(
      achievementPercent,
      SCORING_CONFIG.goalAchievement
    );
  }
  
  // Calculate total performance score
  result.performanceScore = Math.round(
    result.breakdown.profitMarginScore +
    result.breakdown.signupsPerHourScore +
    result.breakdown.goalAchievementScore
  );
  
  // Determine tier
  result.tier = determineTier(result.performanceScore);
  
  return result;
}

/**
 * Calculate aggregate performance score for a venue (multiple events)
 */
export function calculateVenuePerformanceScore(
  eventScores: PerformanceScoreResult[]
): { averageScore: number; tier: PerformanceScoreResult['tier']; eventCount: number } {
  if (eventScores.length === 0) {
    return { averageScore: 0, tier: 'poor', eventCount: 0 };
  }
  
  const totalScore = eventScores.reduce((sum, e) => sum + e.performanceScore, 0);
  const averageScore = Math.round(totalScore / eventScores.length);
  
  return {
    averageScore,
    tier: determineTier(averageScore),
    eventCount: eventScores.length,
  };
}

/**
 * Get scoring configuration (for API documentation/transparency)
 */
export function getScoringConfiguration() {
  return {
    weights: {
      profitMargin: { percent: 50, maxPoints: SCORING_CONFIG.profitMargin.weight },
      signupsPerHour: { percent: 30, maxPoints: SCORING_CONFIG.signupsPerHour.weight },
      goalAchievement: { percent: 20, maxPoints: SCORING_CONFIG.goalAchievement.weight },
    },
    thresholds: {
      profitMargin: { ...SCORING_CONFIG.profitMargin },
      signupsPerHour: { ...SCORING_CONFIG.signupsPerHour },
      goalAchievement: { ...SCORING_CONFIG.goalAchievement },
    },
    tiers: TIER_THRESHOLDS,
  };
}
