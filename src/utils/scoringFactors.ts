/**
 * Traffic Prediction Scoring Factors - WO-85
 * Individual factor calculations for traffic prediction algorithm
 */

// ============================================
// TYPES
// ============================================

export interface GameInfo {
  homeTeam?: string;
  awayTeam?: string;
  league?: string;
  isPlayoffs?: boolean;
  isRivalry?: boolean;
  broadcastNetwork?: string;
  startTime?: Date;
}

export interface VenueInfo {
  id: string;
  name: string;
  city?: string;
  state?: string;
  localTeams?: string[]; // Teams considered "local" for this venue
}

export interface HistoricalPerformance {
  totalEvents: number;
  avgSignups: number;
  avgSignupsPerAmbassador: number;
  successRate: number; // Events meeting/exceeding projections
  recentTrend: 'up' | 'down' | 'stable';
}

export interface ManualInsight {
  note?: string;
  confidenceAdjustment?: number; // -20 to +20
  source?: 'manager' | 'ambassador' | 'operator';
  createdAt?: Date;
}

export interface ScoringFactorResult {
  name: string;
  rawValue: number;
  weight: number;
  weightedScore: number;
  maxPossible: number;
  details?: Record<string, unknown>;
}

// ============================================
// CONSTANTS
// ============================================

// Local team bonus (market is in team's home territory)
const LOCAL_TEAM_BONUS = 20;

// Primetime broadcast bonus
const PRIMETIME_BONUS = 10;

// Playoffs/postseason bonus
const PLAYOFFS_BONUS = 15;

// Rivalry game bonus
const RIVALRY_BONUS = 5;

// Major broadcast networks that indicate primetime
const PRIMETIME_NETWORKS = ['ESPN', 'ABC', 'NBC', 'CBS', 'FOX', 'TNT', 'ESPN2', 'FS1'];

// Known rivalries (expandable)
const KNOWN_RIVALRIES = new Map<string, string[]>([
  ['Yankees', ['Red Sox', 'Mets']],
  ['Red Sox', ['Yankees']],
  ['Lakers', ['Celtics', 'Clippers']],
  ['Celtics', ['Lakers']],
  ['Cowboys', ['Eagles', 'Giants', 'Commanders']],
  ['Eagles', ['Cowboys', 'Giants']],
  ['Bears', ['Packers']],
  ['Packers', ['Bears', 'Vikings']],
  ['Heat', ['Knicks', 'Bulls']],
  ['Knicks', ['Heat', 'Nets', 'Celtics']],
  ['Cubs', ['Cardinals', 'White Sox']],
  ['Cardinals', ['Cubs']],
  ['Giants', ['Dodgers', 'Cowboys', 'Eagles']],
  ['Dodgers', ['Giants', 'Padres']],
]);

// Primetime hours (local time)
const PRIMETIME_HOURS = { start: 19, end: 22 }; // 7 PM - 10 PM

// Day of week multipliers (Sunday = 0)
const DAY_MULTIPLIERS: Record<number, number> = {
  0: 1.3,  // Sunday (sports)
  1: 0.85, // Monday (slow)
  2: 0.9,  // Tuesday
  3: 0.95, // Wednesday
  4: 1.1,  // Thursday (TNF, college)
  5: 1.2,  // Friday (date night)
  6: 1.25, // Saturday (events)
};

// Seasonal factors by month
const SEASONAL_FACTORS: Record<number, { name: string; multiplier: number }> = {
  0: { name: 'January', multiplier: 0.9 },    // Post-holiday slowdown
  1: { name: 'February', multiplier: 1.0 },   // Super Bowl, All-Star
  2: { name: 'March', multiplier: 1.2 },      // March Madness
  3: { name: 'April', multiplier: 1.1 },      // MLB opening, NBA playoffs start
  4: { name: 'May', multiplier: 1.0 },        // NBA/NHL playoffs
  5: { name: 'June', multiplier: 0.95 },      // NBA/NHL finals, summer lull
  6: { name: 'July', multiplier: 0.85 },      // Summer slowdown
  7: { name: 'August', multiplier: 0.9 },     // Pre-season
  8: { name: 'September', multiplier: 1.15 }, // NFL starts, CFB
  9: { name: 'October', multiplier: 1.2 },    // MLB playoffs, NFL, CFB
  10: { name: 'November', multiplier: 1.1 },  // NFL, CFB rivalry week
  11: { name: 'December', multiplier: 1.05 }, // Bowl season, holidays
};

// ============================================
// FACTOR CALCULATIONS
// ============================================

/**
 * Calculate Game Relevance score
 * Max: 50 points (local team + primetime + playoffs + rivalry)
 */
export function calculateGameRelevance(
  game: GameInfo,
  venue: VenueInfo
): ScoringFactorResult {
  let score = 0;
  const details: Record<string, unknown> = {};
  
  // Local team check (+20)
  const localTeams = venue.localTeams || [];
  const isLocalTeam = localTeams.some(team => 
    game.homeTeam?.toLowerCase().includes(team.toLowerCase()) ||
    game.awayTeam?.toLowerCase().includes(team.toLowerCase())
  );
  
  if (isLocalTeam) {
    score += LOCAL_TEAM_BONUS;
    details.localTeamBonus = LOCAL_TEAM_BONUS;
  }
  
  // Primetime check (+10)
  let isPrimetime = false;
  
  // Check broadcast network
  if (game.broadcastNetwork && PRIMETIME_NETWORKS.includes(game.broadcastNetwork.toUpperCase())) {
    isPrimetime = true;
  }
  
  // Check start time
  if (game.startTime) {
    const hour = game.startTime.getHours();
    if (hour >= PRIMETIME_HOURS.start && hour <= PRIMETIME_HOURS.end) {
      isPrimetime = true;
    }
  }
  
  if (isPrimetime) {
    score += PRIMETIME_BONUS;
    details.primetimeBonus = PRIMETIME_BONUS;
  }
  
  // Playoffs check (+15)
  if (game.isPlayoffs) {
    score += PLAYOFFS_BONUS;
    details.playoffsBonus = PLAYOFFS_BONUS;
  }
  
  // Rivalry check (+5)
  let isRivalry = game.isRivalry || false;
  
  if (!isRivalry && game.homeTeam && game.awayTeam) {
    const homeRivals = KNOWN_RIVALRIES.get(game.homeTeam);
    if (homeRivals?.some(rival => game.awayTeam?.includes(rival))) {
      isRivalry = true;
    }
    const awayRivals = KNOWN_RIVALRIES.get(game.awayTeam);
    if (awayRivals?.some(rival => game.homeTeam?.includes(rival))) {
      isRivalry = true;
    }
  }
  
  if (isRivalry) {
    score += RIVALRY_BONUS;
    details.rivalryBonus = RIVALRY_BONUS;
  }
  
  return {
    name: 'gameRelevance',
    rawValue: score,
    weight: 1, // Direct points, no weighting
    weightedScore: score,
    maxPossible: LOCAL_TEAM_BONUS + PRIMETIME_BONUS + PLAYOFFS_BONUS + RIVALRY_BONUS, // 50
    details,
  };
}

/**
 * Calculate Historical Venue Performance score
 * Max: 25 points, normalized by ambassador count
 */
export function calculateHistoricalPerformance(
  history: HistoricalPerformance | null
): ScoringFactorResult {
  if (!history || history.totalEvents === 0) {
    return {
      name: 'historicalPerformance',
      rawValue: 0,
      weight: 0.25,
      weightedScore: 12.5, // Default to middle score when no history
      maxPossible: 25,
      details: { noHistory: true },
    };
  }
  
  const details: Record<string, unknown> = {
    totalEvents: history.totalEvents,
    avgSignupsPerAmbassador: history.avgSignupsPerAmbassador,
    successRate: history.successRate,
    trend: history.recentTrend,
  };
  
  // Base score on signups per ambassador (normalized metric)
  // Scale: 0-5 signups/ambassador = 0-50 raw, then apply 0.5 weight = 0-25
  let rawScore = Math.min(history.avgSignupsPerAmbassador * 10, 50);
  
  // Adjust for success rate (percentage of events meeting projections)
  rawScore *= (0.7 + (history.successRate * 0.3)); // 70-100% of base score
  
  // Trend adjustment
  if (history.recentTrend === 'up') {
    rawScore *= 1.1;
    details.trendBonus = 1.1;
  } else if (history.recentTrend === 'down') {
    rawScore *= 0.9;
    details.trendPenalty = 0.9;
  }
  
  rawScore = Math.min(rawScore, 50);
  
  return {
    name: 'historicalPerformance',
    rawValue: rawScore,
    weight: 0.5,
    weightedScore: rawScore * 0.5,
    maxPossible: 25,
    details,
  };
}

/**
 * Calculate Day/Time score
 * Max: 15 points based on optimal scheduling windows
 */
export function calculateDayTimeScore(
  eventDate: Date
): ScoringFactorResult {
  const day = eventDate.getDay();
  const hour = eventDate.getHours();
  
  const dayMultiplier = DAY_MULTIPLIERS[day] || 1;
  
  // Hour scoring: peak at evening (18-21), lower early/late
  let hourScore: number;
  if (hour >= 18 && hour <= 21) {
    hourScore = 1.0;
  } else if (hour >= 16 && hour < 18) {
    hourScore = 0.85;
  } else if (hour > 21 && hour <= 23) {
    hourScore = 0.8;
  } else if (hour >= 12 && hour < 16) {
    hourScore = 0.7;
  } else {
    hourScore = 0.5;
  }
  
  // Base 15 points, modified by multipliers
  const rawScore = 15 * dayMultiplier * hourScore;
  
  return {
    name: 'dayTimeScore',
    rawValue: Math.min(rawScore, 15),
    weight: 1,
    weightedScore: Math.min(rawScore, 15),
    maxPossible: 15,
    details: {
      dayOfWeek: day,
      dayMultiplier,
      hour,
      hourScore,
    },
  };
}

/**
 * Calculate Seasonal factor score
 * Max: 10 points based on historical seasonal patterns
 */
export function calculateSeasonalScore(
  eventDate: Date
): ScoringFactorResult {
  const month = eventDate.getMonth();
  const seasonal = SEASONAL_FACTORS[month];
  
  // Base 10 points, modified by seasonal multiplier
  const rawScore = 10 * (seasonal?.multiplier || 1);
  
  return {
    name: 'seasonalScore',
    rawValue: Math.min(rawScore, 12), // Allow slight over for peak seasons
    weight: 1,
    weightedScore: Math.min(rawScore, 12),
    maxPossible: 10,
    details: {
      month: seasonal?.name || 'Unknown',
      multiplier: seasonal?.multiplier || 1,
    },
  };
}

/**
 * Calculate Manual Insight adjustment
 * Range: -20 to +20 points based on human input
 */
export function calculateManualInsightScore(
  insight: ManualInsight | null
): ScoringFactorResult {
  if (!insight || insight.confidenceAdjustment === undefined) {
    return {
      name: 'manualInsight',
      rawValue: 0,
      weight: 1,
      weightedScore: 0,
      maxPossible: 20,
      details: { noInsight: true },
    };
  }
  
  // Clamp adjustment to -20 to +20
  const adjustment = Math.max(-20, Math.min(20, insight.confidenceAdjustment));
  
  return {
    name: 'manualInsight',
    rawValue: adjustment,
    weight: 1,
    weightedScore: adjustment,
    maxPossible: 20,
    details: {
      note: insight.note,
      source: insight.source,
      adjustment,
    },
  };
}

/**
 * Get scoring configuration for transparency
 */
export function getScoringFactorsConfig() {
  return {
    gameRelevance: {
      maxPoints: 50,
      components: {
        localTeam: LOCAL_TEAM_BONUS,
        primetime: PRIMETIME_BONUS,
        playoffs: PLAYOFFS_BONUS,
        rivalry: RIVALRY_BONUS,
      },
      primetimeNetworks: PRIMETIME_NETWORKS,
      primetimeHours: PRIMETIME_HOURS,
    },
    historicalPerformance: {
      maxPoints: 25,
      normalization: 'ambassadorCount',
      signupsPerAmbassadorScale: '0-5 = 0-50 raw, 0.5 weight',
    },
    dayTime: {
      maxPoints: 15,
      dayMultipliers: DAY_MULTIPLIERS,
      peakHours: '18:00-21:00',
    },
    seasonal: {
      maxPoints: 10,
      factors: SEASONAL_FACTORS,
    },
    manualInsight: {
      range: { min: -20, max: 20 },
    },
    totalMaxScore: 100 + 20, // 100 base + 20 manual bonus
  };
}
