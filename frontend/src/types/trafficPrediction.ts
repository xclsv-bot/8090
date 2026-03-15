export interface TrafficScoreBreakdown {
  gameRelevance: number;
  historicalPerformance: number;
  dayTimeFactor: number;
  seasonalFactor: number;
  manualInsight: number;
}

export interface TrafficScoreAppliedWeights {
  gameRelevance: number;
  historicalPerformance: number;
  dayTimeFactor: number;
  seasonalFactor: number;
  manualInsight: number;
}

export interface TrafficScoreResponse {
  eventScore: number;
  breakdown: TrafficScoreBreakdown;
  explanation: string;
  appliedWeights: TrafficScoreAppliedWeights;
}

export interface VenueHistoryEvent {
  eventId: string;
  date: string;
  time?: string;
  signups: number;
  ambassadorCount: number;
  ambassador?: string;
}

export interface VenueHistoryData {
  venueId: string;
  venueName: string;
  summaryStats: {
    avgSignups: number;
    totalEvents: number;
    successRate: number;
    confidenceLevel: 'low' | 'medium' | 'high';
  };
  recentEvents: VenueHistoryEvent[];
}

export interface GameSchedule {
  date: string;
  time: string;
  teams: string;
  league: string;
  broadcastStatus: string;
  isLocalTeam: boolean;
  relevanceScore: number;
  isPlayoffs?: boolean;
  isChampionship?: boolean;
}

export interface AlertData {
  type: 'low_traffic' | 'conflict' | 'seasonal_trend' | 'low_confidence';
  severity: 'low' | 'medium' | 'high';
  message: string;
  dismissible: boolean;
}

export interface Recommendation {
  venueId: string;
  venueName: string;
  predictedScore: number;
  contributingFactors: string[];
  alerts: AlertData[];
}

export interface ManualInsight {
  trafficExpectation: 'high' | 'moderate' | 'low';
  insightType: 'recurring' | 'specific';
  notes: string;
  applicableDate: string;
}
