/**
 * Sports Calendar Types
 * WO-84: Sports Calendar Integration
 * 
 * TypeScript interfaces for sports schedule data from ESPN/TheSportsDB APIs
 */

// ============================================
// SPORTS LEAGUES
// ============================================

export type SportsLeague = 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'NCAAB';

export const SUPPORTED_LEAGUES: readonly SportsLeague[] = [
  'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB'
] as const;

// ESPN API league identifiers
export const ESPN_LEAGUE_IDS: Record<SportsLeague, { sport: string; league: string }> = {
  NFL: { sport: 'football', league: 'nfl' },
  NBA: { sport: 'basketball', league: 'nba' },
  MLB: { sport: 'baseball', league: 'mlb' },
  NHL: { sport: 'hockey', league: 'nhl' },
  NCAAF: { sport: 'football', league: 'college-football' },
  NCAAB: { sport: 'basketball', league: 'mens-college-basketball' },
};

// ============================================
// GAME TYPES & STATUS
// ============================================

export type GameType = 
  | 'regular'
  | 'preseason'
  | 'postseason'
  | 'playoff'
  | 'championship'
  | 'all-star'
  | 'exhibition';

export type GameStatus = 
  | 'scheduled'
  | 'in_progress'
  | 'halftime'
  | 'delayed'
  | 'postponed'
  | 'cancelled'
  | 'final'
  | 'suspended';

export type BroadcastType = 'national' | 'regional' | 'local' | 'streaming';

// ============================================
// TEAM & VENUE
// ============================================

export interface SportsTeam {
  id: string;
  externalId: string; // ESPN/TheSportsDB ID
  name: string;
  shortName: string;
  abbreviation: string;
  league: SportsLeague;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  venue?: SportsVenue;
  market?: GeographicMarket;
}

export interface SportsVenue {
  id: string;
  externalId?: string;
  name: string;
  city: string;
  state: string;
  country: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
  timezone: string;
}

export interface GeographicMarket {
  id: string;
  name: string;
  city: string;
  state: string;
  region: string; // e.g., 'northeast', 'southeast', 'midwest', 'west'
  dmaCode?: string; // Nielsen DMA code
  radius?: number; // Market radius in miles
}

// ============================================
// BROADCAST INFO
// ============================================

export interface BroadcastInfo {
  type: BroadcastType;
  network: string;
  networkLogo?: string;
  callLetters?: string; // e.g., 'ESPN', 'FOX', 'ABC'
  marketIds?: string[]; // Which markets this broadcast covers
  streamingUrl?: string;
}

// ============================================
// SPORTS GAME (Core Entity)
// ============================================

export interface SportsGame {
  id: string;
  externalId: string; // ESPN event ID
  externalSource: 'espn' | 'thesportsdb';
  league: SportsLeague;
  season: string; // e.g., '2024', '2024-25'
  seasonType: GameType;
  week?: number; // For NFL/NCAAF
  
  // Teams
  homeTeam: SportsTeam;
  awayTeam: SportsTeam;
  
  // Schedule
  gameDate: string; // ISO date (YYYY-MM-DD)
  startTime: string; // ISO datetime
  endTime?: string; // ISO datetime (if final)
  timezone: string;
  
  // Venue
  venue: SportsVenue;
  isNeutralSite: boolean;
  
  // Status
  status: GameStatus;
  statusDetail?: string; // e.g., "Final", "4th Quarter", "Rain Delay"
  
  // Scores (if in progress or final)
  homeScore?: number;
  awayScore?: number;
  period?: string; // Current period/quarter/inning
  clock?: string; // Game clock
  
  // Broadcasts
  broadcasts: BroadcastInfo[];
  isNationalBroadcast: boolean;
  
  // Relevance flags
  relevanceFlags: GameRelevanceFlags;
  
  // Metadata
  headline?: string;
  notes?: string;
  odds?: GameOdds;
  attendance?: number;
  weather?: GameWeather;
  
  // Sync tracking
  lastSyncedAt: Date;
  syncSource: string;
  syncHash: string; // For deduplication
  createdAt: Date;
  updatedAt: Date;
}

export interface GameRelevanceFlags {
  isPrimetime: boolean; // Evening games (7pm+)
  isWeekend: boolean;
  isHoliday: boolean;
  isPlayoff: boolean;
  isRivalry: boolean;
  isLocalMarket: boolean; // For user's configured market
  marketRelevanceScore: number; // 0-100
}

export interface GameOdds {
  spread?: number;
  spreadFavorite?: 'home' | 'away';
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  source?: string;
  updatedAt?: Date;
}

export interface GameWeather {
  condition?: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: string;
  isOutdoor: boolean;
}

// ============================================
// SYNC & API RESPONSES
// ============================================

export interface SyncResult {
  league: SportsLeague;
  success: boolean;
  gamesFound: number;
  gamesCreated: number;
  gamesUpdated: number;
  gamesSkipped: number;
  errors: SyncError[];
  duration: number;
  syncedAt: Date;
}

export interface SyncError {
  externalId?: string;
  message: string;
  code: string;
  retryable: boolean;
}

export interface SyncJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  leagues: SportsLeague[];
  dateRange: {
    start: string;
    end: string;
  };
  results: SyncResult[];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// ============================================
// QUERY & FILTER
// ============================================

export interface SportsCalendarFilters {
  leagues?: SportsLeague[];
  dateFrom?: string;
  dateTo?: string;
  teamIds?: string[];
  status?: GameStatus[];
  gameType?: GameType[];
  market?: string; // Geographic market ID
  isLocalTeam?: boolean;
  isNationalBroadcast?: boolean;
  isPrimetime?: boolean;
  search?: string;
}

export interface SportsCalendarQuery extends SportsCalendarFilters {
  page?: number;
  limit?: number;
  sortBy?: 'gameDate' | 'relevanceScore' | 'league';
  sortOrder?: 'asc' | 'desc';
  includeCompleted?: boolean;
}

// ============================================
// ESPN API RESPONSE TYPES (Partial)
// ============================================

export interface ESPNScoreboardResponse {
  leagues: ESPNLeague[];
  events: ESPNEvent[];
}

export interface ESPNLeague {
  id: string;
  name: string;
  abbreviation: string;
  slug: string;
  season: {
    year: number;
    type: number;
    name: string;
  };
}

export interface ESPNEvent {
  id: string;
  uid: string;
  date: string;
  name: string;
  shortName: string;
  season: {
    year: number;
    type: number;
  };
  week?: {
    number: number;
  };
  competitions: ESPNCompetition[];
  status: {
    clock: number;
    displayClock: string;
    period: number;
    type: {
      id: string;
      name: string;
      state: string;
      completed: boolean;
      description: string;
      detail: string;
      shortDetail: string;
    };
  };
}

export interface ESPNCompetition {
  id: string;
  uid: string;
  date: string;
  attendance: number;
  type: {
    id: string;
    abbreviation: string;
  };
  timeValid: boolean;
  neutralSite: boolean;
  conferenceCompetition: boolean;
  playByPlayAvailable: boolean;
  recent: boolean;
  venue: {
    id: string;
    fullName: string;
    address: {
      city: string;
      state: string;
    };
    capacity: number;
    indoor: boolean;
  };
  competitors: ESPNCompetitor[];
  broadcasts: ESPNBroadcast[];
  notes: { type: string; headline: string }[];
  odds?: ESPNOdds[];
  geoBroadcasts?: ESPNGeoBroadcast[];
}

export interface ESPNCompetitor {
  id: string;
  uid: string;
  type: string;
  order: number;
  homeAway: 'home' | 'away';
  winner?: boolean;
  team: {
    id: string;
    uid: string;
    location: string;
    name: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
    color?: string;
    alternateColor?: string;
    isActive: boolean;
    logo?: string;
    logos?: { href: string; width: number; height: number }[];
  };
  score: string;
  linescores?: { value: number }[];
  statistics?: { name: string; value: string }[];
  records?: { name: string; summary: string }[];
}

export interface ESPNBroadcast {
  market: string;
  names: string[];
}

export interface ESPNGeoBroadcast {
  type: {
    id: string;
    shortName: string;
  };
  market: {
    id: string;
    type: string;
  };
  media: {
    shortName: string;
  };
  lang: string;
  region: string;
}

export interface ESPNOdds {
  provider: {
    id: string;
    name: string;
  };
  details: string;
  overUnder: number;
  spread: number;
  overOdds: number;
  underOdds: number;
  homeTeamOdds: {
    favorite: boolean;
    moneyLine: number;
  };
  awayTeamOdds: {
    favorite: boolean;
    moneyLine: number;
  };
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface SportsCalendarResponse {
  games: SportsGame[];
  meta: {
    page: number;
    limit: number;
    total: number;
    leagues: SportsLeague[];
    dateRange: {
      start: string;
      end: string;
    };
  };
}

export interface LocalTeamsResponse {
  market: GeographicMarket;
  teams: SportsTeam[];
}

export interface LeagueScheduleResponse {
  league: SportsLeague;
  season: string;
  games: SportsGame[];
  syncedAt: Date;
}
