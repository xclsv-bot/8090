/**
 * Sports Calendar Service
 * WO-84: Sports Calendar Integration
 *
 * Provides integration with ESPN and TheSportsDB APIs for:
 * - Daily sync of sports schedules (NFL, NBA, MLB, NHL, NCAAF, NCAAB)
 * - Local team identification by geographic market
 * - Game metadata, broadcast info, and relevance scoring
 * - Error handling and data deduplication
 */

import { logger } from '../utils/logger.js';
import { db } from './database.js';
import { createHash } from 'crypto';
import type {
  SportsLeague,
  SportsGame,
  SportsTeam,
  SportsVenue,
  GeographicMarket,
  BroadcastInfo,
  GameRelevanceFlags,
  GameOdds,
  GameStatus,
  GameType,
  SportsCalendarFilters,
  SportsCalendarQuery,
  SyncResult,
  SyncError,
  SyncJobStatus,
  ESPNScoreboardResponse,
  ESPNEvent,
  ESPNCompetition,
  ESPNCompetitor,
  ESPN_LEAGUE_IDS,
  SUPPORTED_LEAGUES,
} from '../types/sportsCalendar.js';

// Import constants from types
const ESPN_LEAGUES: Record<SportsLeague, { sport: string; league: string }> = {
  NFL: { sport: 'football', league: 'nfl' },
  NBA: { sport: 'basketball', league: 'nba' },
  MLB: { sport: 'baseball', league: 'mlb' },
  NHL: { sport: 'hockey', league: 'nhl' },
  NCAAF: { sport: 'football', league: 'college-football' },
  NCAAB: { sport: 'basketball', league: 'mens-college-basketball' },
};

const ALL_LEAGUES: SportsLeague[] = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB'];

// ============================================
// CUSTOM ERRORS
// ============================================

export class SportsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly source: 'espn' | 'thesportsdb',
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'SportsApiError';
  }
}

// ============================================
// GEOGRAPHIC MARKET DATA
// ============================================

const US_MARKETS: GeographicMarket[] = [
  { id: 'nyc', name: 'New York', city: 'New York', state: 'NY', region: 'northeast', dmaCode: '501', radius: 50 },
  { id: 'la', name: 'Los Angeles', city: 'Los Angeles', state: 'CA', region: 'west', dmaCode: '803', radius: 60 },
  { id: 'chicago', name: 'Chicago', city: 'Chicago', state: 'IL', region: 'midwest', dmaCode: '602', radius: 50 },
  { id: 'dallas', name: 'Dallas-Fort Worth', city: 'Dallas', state: 'TX', region: 'south', dmaCode: '623', radius: 50 },
  { id: 'houston', name: 'Houston', city: 'Houston', state: 'TX', region: 'south', dmaCode: '618', radius: 45 },
  { id: 'philly', name: 'Philadelphia', city: 'Philadelphia', state: 'PA', region: 'northeast', dmaCode: '504', radius: 40 },
  { id: 'phoenix', name: 'Phoenix', city: 'Phoenix', state: 'AZ', region: 'west', dmaCode: '753', radius: 45 },
  { id: 'boston', name: 'Boston', city: 'Boston', state: 'MA', region: 'northeast', dmaCode: '506', radius: 40 },
  { id: 'sf', name: 'San Francisco Bay Area', city: 'San Francisco', state: 'CA', region: 'west', dmaCode: '807', radius: 50 },
  { id: 'atlanta', name: 'Atlanta', city: 'Atlanta', state: 'GA', region: 'southeast', dmaCode: '524', radius: 50 },
  { id: 'miami', name: 'Miami-Fort Lauderdale', city: 'Miami', state: 'FL', region: 'southeast', dmaCode: '528', radius: 45 },
  { id: 'detroit', name: 'Detroit', city: 'Detroit', state: 'MI', region: 'midwest', dmaCode: '505', radius: 40 },
  { id: 'seattle', name: 'Seattle', city: 'Seattle', state: 'WA', region: 'west', dmaCode: '819', radius: 50 },
  { id: 'denver', name: 'Denver', city: 'Denver', state: 'CO', region: 'west', dmaCode: '751', radius: 60 },
  { id: 'dc', name: 'Washington D.C.', city: 'Washington', state: 'DC', region: 'northeast', dmaCode: '511', radius: 40 },
  { id: 'tampa', name: 'Tampa Bay', city: 'Tampa', state: 'FL', region: 'southeast', dmaCode: '539', radius: 40 },
  { id: 'minneapolis', name: 'Minneapolis-St. Paul', city: 'Minneapolis', state: 'MN', region: 'midwest', dmaCode: '613', radius: 50 },
  { id: 'cleveland', name: 'Cleveland', city: 'Cleveland', state: 'OH', region: 'midwest', dmaCode: '510', radius: 40 },
  { id: 'pittsburgh', name: 'Pittsburgh', city: 'Pittsburgh', state: 'PA', region: 'northeast', dmaCode: '508', radius: 40 },
  { id: 'charlotte', name: 'Charlotte', city: 'Charlotte', state: 'NC', region: 'southeast', dmaCode: '517', radius: 45 },
];

// Team to market mapping (keyed by league-abbreviation to handle overlapping abbreviations)
const TEAM_MARKETS: Record<string, string> = {
  // NFL
  'NFL-NYG': 'nyc', 'NFL-NYJ': 'nyc', 'NFL-DAL': 'dallas', 'NFL-NE': 'boston', 'NFL-PHI': 'philly',
  'NFL-LAR': 'la', 'NFL-LAC': 'la', 'NFL-SF': 'sf', 'NFL-CHI': 'chicago', 'NFL-GB': 'midwest',
  'NFL-MIA': 'miami', 'NFL-ATL': 'atlanta', 'NFL-SEA': 'seattle', 'NFL-DEN': 'denver',
  'NFL-PIT': 'pittsburgh', 'NFL-CLE': 'cleveland', 'NFL-DET': 'detroit', 'NFL-MIN': 'minneapolis',
  'NFL-TB': 'tampa', 'NFL-CAR': 'charlotte', 'NFL-WAS': 'dc', 'NFL-ARI': 'phoenix', 'NFL-HOU': 'houston',
  // NBA
  'NBA-NYK': 'nyc', 'NBA-BKN': 'nyc', 'NBA-LAL': 'la', 'NBA-LAC': 'la', 'NBA-GSW': 'sf',
  'NBA-BOS': 'boston', 'NBA-PHI': 'philly', 'NBA-CHI': 'chicago', 'NBA-MIA': 'miami',
  'NBA-ATL': 'atlanta', 'NBA-DAL': 'dallas', 'NBA-HOU': 'houston', 'NBA-PHX': 'phoenix',
  'NBA-DEN': 'denver', 'NBA-MIN': 'minneapolis', 'NBA-CLE': 'cleveland', 'NBA-DET': 'detroit',
  // MLB
  'MLB-NYY': 'nyc', 'MLB-NYM': 'nyc', 'MLB-LAD': 'la', 'MLB-LAA': 'la', 'MLB-SF': 'sf', 'MLB-OAK': 'sf',
  'MLB-BOS': 'boston', 'MLB-PHI': 'philly', 'MLB-CHC': 'chicago', 'MLB-CWS': 'chicago',
  'MLB-MIA': 'miami', 'MLB-ATL': 'atlanta', 'MLB-TEX': 'dallas', 'MLB-HOU': 'houston',
  'MLB-SEA': 'seattle', 'MLB-COL': 'denver', 'MLB-ARI': 'phoenix', 'MLB-DET': 'detroit',
  'MLB-MIN': 'minneapolis', 'MLB-CLE': 'cleveland', 'MLB-PIT': 'pittsburgh', 'MLB-TB': 'tampa', 'MLB-WAS': 'dc',
  // NHL
  'NHL-NYR': 'nyc', 'NHL-NYI': 'nyc', 'NHL-NJD': 'nyc', 'NHL-LAK': 'la', 'NHL-ANA': 'la', 'NHL-SJS': 'sf',
  'NHL-BOS': 'boston', 'NHL-PHI': 'philly', 'NHL-CHI': 'chicago', 'NHL-FLA': 'miami', 'NHL-TBL': 'tampa',
  'NHL-DAL': 'dallas', 'NHL-COL': 'denver', 'NHL-ARI': 'phoenix', 'NHL-DET': 'detroit',
  'NHL-MIN': 'minneapolis', 'NHL-PIT': 'pittsburgh', 'NHL-WSH': 'dc', 'NHL-CAR': 'charlotte', 'NHL-SEA': 'seattle',
};

// ============================================
// SPORTS CALENDAR SERVICE
// ============================================

class SportsCalendarService {
  private readonly espnBaseUrl = 'https://site.api.espn.com/apis/site/v2/sports';
  private readonly sportsDbBaseUrl = 'https://www.thesportsdb.com/api/v1/json';
  private activeSyncJobs = new Map<string, SyncJobStatus>();

  /**
   * Sync games for all supported leagues
   */
  async syncAllLeagues(dateRange?: { start: string; end: string }): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    const startDate = dateRange?.start || this.getTodayDate();
    const endDate = dateRange?.end || this.getDatePlusDays(7);

    logger.info({ startDate, endDate, leagues: ALL_LEAGUES.length }, 'Starting full sports calendar sync');

    for (const league of ALL_LEAGUES) {
      try {
        const result = await this.syncLeague(league, startDate, endDate);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ league, error: errorMessage }, 'League sync failed');
        results.push({
          league,
          success: false,
          gamesFound: 0,
          gamesCreated: 0,
          gamesUpdated: 0,
          gamesSkipped: 0,
          errors: [{
            message: errorMessage,
            code: 'SYNC_FAILED',
            retryable: this.isRetryableError(error),
          }],
          duration: 0,
          syncedAt: new Date(),
        });
      }
    }

    const totalGames = results.reduce((sum, r) => sum + r.gamesFound, 0);
    const totalCreated = results.reduce((sum, r) => sum + r.gamesCreated, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.gamesUpdated, 0);
    const successCount = results.filter(r => r.success).length;

    logger.info(
      { totalGames, totalCreated, totalUpdated, successCount, totalLeagues: ALL_LEAGUES.length },
      'Full sports calendar sync completed'
    );

    return results;
  }

  /**
   * Sync games for a specific league
   */
  async syncLeague(league: SportsLeague, startDate: string, endDate: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let gamesFound = 0;
    let gamesCreated = 0;
    let gamesUpdated = 0;
    let gamesSkipped = 0;

    logger.info({ league, startDate, endDate }, 'Syncing league schedule');

    try {
      // Fetch from ESPN API
      const events = await this.fetchESPNSchedule(league, startDate, endDate);
      gamesFound = events.length;

      for (const event of events) {
        try {
          const game = this.mapESPNEventToGame(event, league);
          
          // Check for duplicates by sync hash
          const existingGame = await this.findGameBySyncHash(game.syncHash);
          
          if (existingGame) {
            // Check if update needed
            if (this.gameNeedsUpdate(existingGame, game)) {
              await this.updateGame(existingGame.id, game);
              gamesUpdated++;
            } else {
              gamesSkipped++;
            }
          } else {
            // Check by external ID as fallback
            const existingByExternal = await this.findGameByExternalId(game.externalId, game.externalSource);
            if (existingByExternal) {
              await this.updateGame(existingByExternal.id, game);
              gamesUpdated++;
            } else {
              await this.createGame(game);
              gamesCreated++;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({
            externalId: event.id,
            message: errorMessage,
            code: 'GAME_PROCESS_ERROR',
            retryable: false,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({
        message: errorMessage,
        code: 'API_FETCH_ERROR',
        retryable: this.isRetryableError(error),
      });
    }

    const duration = Date.now() - startTime;
    const result: SyncResult = {
      league,
      success: errors.length === 0 || gamesCreated + gamesUpdated > 0,
      gamesFound,
      gamesCreated,
      gamesUpdated,
      gamesSkipped,
      errors,
      duration,
      syncedAt: new Date(),
    };

    logger.info(result, 'League sync completed');
    return result;
  }

  /**
   * Fetch schedule from ESPN API
   */
  private async fetchESPNSchedule(league: SportsLeague, startDate: string, endDate: string): Promise<ESPNEvent[]> {
    const leagueConfig = ESPN_LEAGUES[league];
    const url = `${this.espnBaseUrl}/${leagueConfig.sport}/${leagueConfig.league}/scoreboard`;
    
    // ESPN uses dates param for filtering
    const params = new URLSearchParams({
      dates: startDate.replace(/-/g, ''),
    });

    // For date ranges, we need to fetch multiple days
    const events: ESPNEvent[] = [];
    const dates = this.getDateRange(startDate, endDate);

    for (const date of dates) {
      try {
        const dateParam = date.replace(/-/g, '');
        const response = await fetch(`${url}?dates=${dateParam}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'XCLSV-Core-Platform/1.0',
          },
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited - wait and retry
            await this.sleep(2000);
            continue;
          }
          throw new SportsApiError(
            `ESPN API error: ${response.status} ${response.statusText}`,
            response.status,
            'espn',
            response.status >= 500 || response.status === 429
          );
        }

        const data = await response.json() as ESPNScoreboardResponse;
        if (data.events) {
          events.push(...data.events);
        }

        // Rate limit protection
        await this.sleep(100);
      } catch (error) {
        if (error instanceof SportsApiError) throw error;
        logger.warn({ date, league, error }, 'Failed to fetch date from ESPN');
      }
    }

    return events;
  }

  /**
   * Map ESPN event to our SportsGame type
   */
  private mapESPNEventToGame(event: ESPNEvent, league: SportsLeague): Omit<SportsGame, 'id' | 'createdAt' | 'updatedAt'> {
    const competition = event.competitions[0];
    const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home')!;
    const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away')!;

    const homeTeam = this.mapESPNTeam(homeCompetitor, league);
    const awayTeam = this.mapESPNTeam(awayCompetitor, league);
    const venue = this.mapESPNVenue(competition);
    const broadcasts = this.mapESPNBroadcasts(competition);
    const status = this.mapESPNStatus(event.status.type.state, event.status.type.completed);
    const gameType = this.mapESPNSeasonType(event.season.type);
    const relevanceFlags = this.calculateRelevanceFlags(event, venue, broadcasts);

    // Create sync hash for deduplication
    const syncHash = this.createSyncHash(event.id, league, event.date);

    return {
      externalId: event.id,
      externalSource: 'espn',
      league,
      season: String(event.season.year),
      seasonType: gameType,
      week: event.week?.number,
      homeTeam,
      awayTeam,
      gameDate: event.date.split('T')[0],
      startTime: event.date,
      timezone: venue.timezone,
      venue,
      isNeutralSite: competition.neutralSite,
      status,
      statusDetail: event.status.type.shortDetail,
      homeScore: homeCompetitor.score ? parseInt(homeCompetitor.score) : undefined,
      awayScore: awayCompetitor.score ? parseInt(awayCompetitor.score) : undefined,
      period: event.status.period > 0 ? String(event.status.period) : undefined,
      clock: event.status.displayClock,
      broadcasts,
      isNationalBroadcast: this.hasNationalBroadcast(broadcasts),
      relevanceFlags,
      headline: competition.notes?.[0]?.headline,
      odds: this.mapESPNOdds(competition.odds?.[0]),
      attendance: competition.attendance,
      lastSyncedAt: new Date(),
      syncSource: 'espn',
      syncHash,
    };
  }

  /**
   * Map ESPN competitor to SportsTeam
   */
  private mapESPNTeam(competitor: ESPNCompetitor, league: SportsLeague): SportsTeam {
    const team = competitor.team;
    const marketId = TEAM_MARKETS[`${league}-${team.abbreviation}`];

    return {
      id: `${league}-${team.id}`,
      externalId: team.id,
      name: team.displayName,
      shortName: team.shortDisplayName,
      abbreviation: team.abbreviation,
      league,
      logoUrl: team.logo || team.logos?.[0]?.href,
      primaryColor: team.color ? `#${team.color}` : undefined,
      secondaryColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
      market: marketId ? US_MARKETS.find(m => m.id === marketId) : undefined,
    };
  }

  /**
   * Map ESPN venue
   */
  private mapESPNVenue(competition: ESPNCompetition): SportsVenue {
    const v = competition.venue;
    return {
      id: `espn-${v.id}`,
      externalId: v.id,
      name: v.fullName,
      city: v.address?.city || 'Unknown',
      state: v.address?.state || 'Unknown',
      country: 'USA',
      capacity: v.capacity,
      timezone: 'America/New_York', // Default, would need separate lookup for accurate TZ
    };
  }

  /**
   * Map ESPN broadcasts
   */
  private mapESPNBroadcasts(competition: ESPNCompetition): BroadcastInfo[] {
    const broadcasts: BroadcastInfo[] = [];

    for (const b of competition.broadcasts || []) {
      const isNational = b.market === 'national';
      broadcasts.push({
        type: isNational ? 'national' : 'regional',
        network: b.names.join(', '),
        callLetters: b.names[0],
      });
    }

    // Also check geoBroadcasts
    for (const gb of competition.geoBroadcasts || []) {
      broadcasts.push({
        type: gb.type.shortName === 'TV' ? 'national' : 'streaming',
        network: gb.media.shortName,
        callLetters: gb.media.shortName,
      });
    }

    return broadcasts;
  }

  /**
   * Map ESPN status to our GameStatus
   */
  private mapESPNStatus(state: string, completed: boolean): GameStatus {
    if (completed) return 'final';
    
    switch (state.toLowerCase()) {
      case 'pre': return 'scheduled';
      case 'in': return 'in_progress';
      case 'post': return 'final';
      default: return 'scheduled';
    }
  }

  /**
   * Map ESPN season type to our GameType
   */
  private mapESPNSeasonType(type: number): GameType {
    switch (type) {
      case 1: return 'preseason';
      case 2: return 'regular';
      case 3: return 'postseason';
      case 4: return 'playoff';
      case 5: return 'all-star';
      default: return 'regular';
    }
  }

  /**
   * Map ESPN odds
   */
  private mapESPNOdds(odds?: any): GameOdds | undefined {
    if (!odds) return undefined;

    return {
      spread: odds.spread,
      spreadFavorite: odds.homeTeamOdds?.favorite ? 'home' : 'away',
      overUnder: odds.overUnder,
      moneylineHome: odds.homeTeamOdds?.moneyLine,
      moneylineAway: odds.awayTeamOdds?.moneyLine,
      source: odds.provider?.name,
      updatedAt: new Date(),
    };
  }

  /**
   * Calculate game relevance flags
   */
  private calculateRelevanceFlags(
    event: ESPNEvent,
    venue: SportsVenue,
    broadcasts: BroadcastInfo[]
  ): GameRelevanceFlags {
    const gameDate = new Date(event.date);
    const hour = gameDate.getUTCHours();
    const dayOfWeek = gameDate.getUTCDay();

    return {
      isPrimetime: hour >= 19 || hour <= 2, // 7pm+ or late night
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isHoliday: this.isHoliday(gameDate),
      isPlayoff: event.season.type >= 3,
      isRivalry: this.isRivalryGame(event),
      isLocalMarket: false, // Set based on user's market
      marketRelevanceScore: this.calculateMarketScore(broadcasts, event.season.type),
    };
  }

  /**
   * Check if game is a rivalry
   */
  private isRivalryGame(event: ESPNEvent): boolean {
    const headline = event.competitions[0]?.notes?.[0]?.headline?.toLowerCase() || '';
    const rivalryKeywords = ['rivalry', 'battle', 'showdown', 'classic'];
    return rivalryKeywords.some(kw => headline.includes(kw));
  }

  /**
   * Check if date is a holiday
   */
  private isHoliday(date: Date): boolean {
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    // Thanksgiving (4th Thursday of November)
    if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;
    // Christmas Eve/Day
    if (month === 11 && (day === 24 || day === 25)) return true;
    // New Year's Day
    if (month === 0 && day === 1) return true;
    // July 4th
    if (month === 6 && day === 4) return true;
    // Memorial Day, Labor Day (Monday holidays)
    if (dayOfWeek === 1) {
      if (month === 4 && day >= 25) return true; // Last Monday of May
      if (month === 8 && day <= 7) return true; // First Monday of September
    }

    return false;
  }

  /**
   * Calculate market relevance score
   */
  private calculateMarketScore(broadcasts: BroadcastInfo[], seasonType: number): number {
    let score = 50; // Base score

    // National broadcast boost
    if (broadcasts.some(b => b.type === 'national')) score += 20;
    
    // Playoff boost
    if (seasonType >= 3) score += 25;

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Check for national broadcast
   */
  private hasNationalBroadcast(broadcasts: BroadcastInfo[]): boolean {
    return broadcasts.some(b => b.type === 'national');
  }

  /**
   * Create sync hash for deduplication
   */
  private createSyncHash(externalId: string, league: SportsLeague, date: string): string {
    const data = `${externalId}-${league}-${date}`;
    return createHash('md5').update(data).digest('hex');
  }

  // ============================================
  // DATABASE OPERATIONS
  // ============================================

  /**
   * Find game by sync hash
   */
  private async findGameBySyncHash(syncHash: string): Promise<SportsGame | null> {
    const result = await db.queryOne<any>(
      'SELECT * FROM sports_games WHERE sync_hash = $1',
      [syncHash]
    );
    return result ? this.mapDbRowToGame(result) : null;
  }

  /**
   * Find game by external ID
   */
  private async findGameByExternalId(externalId: string, source: string): Promise<SportsGame | null> {
    const result = await db.queryOne<any>(
      'SELECT * FROM sports_games WHERE external_id = $1 AND external_source = $2',
      [externalId, source]
    );
    return result ? this.mapDbRowToGame(result) : null;
  }

  /**
   * Check if game needs update
   */
  private gameNeedsUpdate(existing: SportsGame, incoming: Omit<SportsGame, 'id' | 'createdAt' | 'updatedAt'>): boolean {
    // Compare key fields
    return (
      existing.status !== incoming.status ||
      existing.homeScore !== incoming.homeScore ||
      existing.awayScore !== incoming.awayScore ||
      existing.startTime !== incoming.startTime
    );
  }

  /**
   * Create new game
   */
  private async createGame(game: Omit<SportsGame, 'id' | 'createdAt' | 'updatedAt'>): Promise<SportsGame> {
    const result = await db.queryOne<any>(
      `INSERT INTO sports_games (
        external_id, external_source, league, season, season_type, week,
        home_team, away_team, game_date, start_time, timezone,
        venue, is_neutral_site, status, status_detail,
        home_score, away_score, period, clock,
        broadcasts, is_national_broadcast, relevance_flags,
        headline, odds, attendance,
        last_synced_at, sync_source, sync_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      RETURNING *`,
      [
        game.externalId,
        game.externalSource,
        game.league,
        game.season,
        game.seasonType,
        game.week,
        JSON.stringify(game.homeTeam),
        JSON.stringify(game.awayTeam),
        game.gameDate,
        game.startTime,
        game.timezone,
        JSON.stringify(game.venue),
        game.isNeutralSite,
        game.status,
        game.statusDetail,
        game.homeScore,
        game.awayScore,
        game.period,
        game.clock,
        JSON.stringify(game.broadcasts),
        game.isNationalBroadcast,
        JSON.stringify(game.relevanceFlags),
        game.headline,
        game.odds ? JSON.stringify(game.odds) : null,
        game.attendance,
        game.lastSyncedAt,
        game.syncSource,
        game.syncHash,
      ]
    );

    return this.mapDbRowToGame(result!);
  }

  /**
   * Update existing game
   */
  private async updateGame(id: string, game: Omit<SportsGame, 'id' | 'createdAt' | 'updatedAt'>): Promise<SportsGame> {
    const result = await db.queryOne<any>(
      `UPDATE sports_games SET
        status = $1, status_detail = $2,
        home_score = $3, away_score = $4,
        period = $5, clock = $6,
        start_time = $7, broadcasts = $8,
        is_national_broadcast = $9, relevance_flags = $10,
        odds = $11, attendance = $12,
        last_synced_at = $13, sync_hash = $14,
        updated_at = NOW()
      WHERE id = $15
      RETURNING *`,
      [
        game.status,
        game.statusDetail,
        game.homeScore,
        game.awayScore,
        game.period,
        game.clock,
        game.startTime,
        JSON.stringify(game.broadcasts),
        game.isNationalBroadcast,
        JSON.stringify(game.relevanceFlags),
        game.odds ? JSON.stringify(game.odds) : null,
        game.attendance,
        new Date(),
        game.syncHash,
        id,
      ]
    );

    return this.mapDbRowToGame(result!);
  }

  /**
   * Map database row to SportsGame
   */
  private mapDbRowToGame(row: any): SportsGame {
    return {
      id: row.id,
      externalId: row.external_id,
      externalSource: row.external_source,
      league: row.league,
      season: row.season,
      seasonType: row.season_type,
      week: row.week,
      homeTeam: typeof row.home_team === 'string' ? JSON.parse(row.home_team) : row.home_team,
      awayTeam: typeof row.away_team === 'string' ? JSON.parse(row.away_team) : row.away_team,
      gameDate: row.game_date,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone,
      venue: typeof row.venue === 'string' ? JSON.parse(row.venue) : row.venue,
      isNeutralSite: row.is_neutral_site,
      status: row.status,
      statusDetail: row.status_detail,
      homeScore: row.home_score,
      awayScore: row.away_score,
      period: row.period,
      clock: row.clock,
      broadcasts: typeof row.broadcasts === 'string' ? JSON.parse(row.broadcasts) : row.broadcasts || [],
      isNationalBroadcast: row.is_national_broadcast,
      relevanceFlags: typeof row.relevance_flags === 'string' ? JSON.parse(row.relevance_flags) : row.relevance_flags,
      headline: row.headline,
      odds: row.odds ? (typeof row.odds === 'string' ? JSON.parse(row.odds) : row.odds) : undefined,
      attendance: row.attendance,
      weather: row.weather ? (typeof row.weather === 'string' ? JSON.parse(row.weather) : row.weather) : undefined,
      lastSyncedAt: new Date(row.last_synced_at),
      syncSource: row.sync_source,
      syncHash: row.sync_hash,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ============================================
  // QUERY OPERATIONS
  // ============================================

  /**
   * Get games with filters and pagination
   */
  async getGames(query: SportsCalendarQuery): Promise<{
    games: SportsGame[];
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // League filter
    if (query.leagues?.length) {
      conditions.push(`league = ANY($${paramIndex++})`);
      values.push(query.leagues);
    }

    // Date range
    if (query.dateFrom) {
      conditions.push(`game_date >= $${paramIndex++}`);
      values.push(query.dateFrom);
    }
    if (query.dateTo) {
      conditions.push(`game_date <= $${paramIndex++}`);
      values.push(query.dateTo);
    }

    // Status filter
    if (query.status?.length) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(query.status);
    }

    // Game type filter
    if (query.gameType?.length) {
      conditions.push(`season_type = ANY($${paramIndex++})`);
      values.push(query.gameType);
    }

    // National broadcast filter
    if (query.isNationalBroadcast !== undefined) {
      conditions.push(`is_national_broadcast = $${paramIndex++}`);
      values.push(query.isNationalBroadcast);
    }

    // Primetime filter
    if (query.isPrimetime !== undefined) {
      conditions.push(`(relevance_flags->>'isPrimetime')::boolean = $${paramIndex++}`);
      values.push(query.isPrimetime);
    }

    // Exclude completed games by default
    if (!query.includeCompleted) {
      conditions.push(`status != 'final'`);
    }

    // Search
    if (query.search) {
      conditions.push(`(
        home_team->>'name' ILIKE $${paramIndex} OR
        away_team->>'name' ILIKE $${paramIndex} OR
        venue->>'name' ILIKE $${paramIndex}
      )`);
      values.push(`%${query.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const sortBy = query.sortBy || 'gameDate';
    const sortOrder = query.sortOrder || 'asc';
    const sortColumn = sortBy === 'relevanceScore' 
      ? "(relevance_flags->>'marketRelevanceScore')::int" 
      : sortBy === 'gameDate' 
        ? 'game_date, start_time' 
        : 'league';

    const [rows, countResult] = await Promise.all([
      db.queryMany<any>(
        `SELECT * FROM sports_games ${whereClause}
         ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM sports_games ${whereClause}`,
        values
      ),
    ]);

    return {
      games: rows.map(row => this.mapDbRowToGame(row)),
      total: parseInt(countResult?.count || '0'),
      page,
      limit,
    };
  }

  /**
   * Get game by ID
   */
  async getGameById(id: string): Promise<SportsGame | null> {
    const row = await db.queryOne<any>(
      'SELECT * FROM sports_games WHERE id = $1',
      [id]
    );
    return row ? this.mapDbRowToGame(row) : null;
  }

  /**
   * Get today's games
   */
  async getTodaysGames(leagues?: SportsLeague[]): Promise<SportsGame[]> {
    const today = this.getTodayDate();
    const conditions = ['game_date = $1'];
    const values: unknown[] = [today];

    if (leagues?.length) {
      conditions.push('league = ANY($2)');
      values.push(leagues);
    }

    const rows = await db.queryMany<any>(
      `SELECT * FROM sports_games 
       WHERE ${conditions.join(' AND ')}
       ORDER BY start_time ASC`,
      values
    );

    return rows.map(row => this.mapDbRowToGame(row));
  }

  /**
   * Get upcoming games
   */
  async getUpcomingGames(limit = 10, leagues?: SportsLeague[]): Promise<SportsGame[]> {
    const conditions = ["game_date >= CURRENT_DATE", "status = 'scheduled'"];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (leagues?.length) {
      conditions.push(`league = ANY($${paramIndex++})`);
      values.push(leagues);
    }

    values.push(limit);

    const rows = await db.queryMany<any>(
      `SELECT * FROM sports_games 
       WHERE ${conditions.join(' AND ')}
       ORDER BY game_date ASC, start_time ASC
       LIMIT $${paramIndex}`,
      values
    );

    return rows.map(row => this.mapDbRowToGame(row));
  }

  /**
   * Get local teams for a market
   */
  async getLocalTeams(marketId: string): Promise<SportsTeam[]> {
    const market = US_MARKETS.find(m => m.id === marketId);
    if (!market) return [];

    // Get teams that belong to this market (extract abbreviation from league-abbr keys)
    const teamKeys = Object.entries(TEAM_MARKETS)
      .filter(([_, m]) => m === marketId)
      .map(([key]) => {
        const parts = key.split('-');
        return { league: parts[0] as SportsLeague, abbr: parts.slice(1).join('-') };
      });

    if (teamKeys.length === 0) return [];

    // Build condition for each league-abbreviation pair
    const conditions = teamKeys.map((_, i) => 
      `(league = $${i * 2 + 1} AND home_team->>'abbreviation' = $${i * 2 + 2})`
    ).join(' OR ');
    const values = teamKeys.flatMap(t => [t.league, t.abbr]);

    // Query recent games to get team info
    const rows = await db.queryMany<any>(
      `SELECT DISTINCT ON (home_team->>'id') home_team, league FROM sports_games 
       WHERE ${conditions}
       LIMIT 20`,
      values
    );

    const teams: SportsTeam[] = [];
    for (const row of rows) {
      const team = typeof row.home_team === 'string' ? JSON.parse(row.home_team) : row.home_team;
      if (!teams.some(t => t.id === team.id)) {
        teams.push({ ...team, market });
      }
    }

    return teams;
  }

  /**
   * Get games for local teams
   */
  async getLocalTeamGames(marketId: string, options?: {
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<SportsGame[]> {
    // Get teams that belong to this market (extract abbreviation from league-abbr keys)
    const teamKeys = Object.entries(TEAM_MARKETS)
      .filter(([_, m]) => m === marketId)
      .map(([key]) => {
        const parts = key.split('-');
        return { league: parts[0] as SportsLeague, abbr: parts.slice(1).join('-') };
      });

    if (teamKeys.length === 0) return [];

    // Build condition for each league-abbreviation pair (for both home and away teams)
    const teamConditions = teamKeys.map((_, i) => 
      `(league = $${i * 2 + 1} AND (home_team->>'abbreviation' = $${i * 2 + 2} OR away_team->>'abbreviation' = $${i * 2 + 2}))`
    ).join(' OR ');
    const values: unknown[] = teamKeys.flatMap(t => [t.league, t.abbr]);
    let paramIndex = values.length + 1;

    const conditions = [`(${teamConditions})`];

    if (options?.dateFrom) {
      conditions.push(`game_date >= $${paramIndex++}`);
      values.push(options.dateFrom);
    }
    if (options?.dateTo) {
      conditions.push(`game_date <= $${paramIndex++}`);
      values.push(options.dateTo);
    }

    values.push(options?.limit || 20);

    const rows = await db.queryMany<any>(
      `SELECT * FROM sports_games 
       WHERE ${conditions.join(' AND ')}
       ORDER BY game_date ASC, start_time ASC
       LIMIT $${paramIndex}`,
      values
    );

    return rows.map(row => this.mapDbRowToGame(row));
  }

  /**
   * Get all markets
   */
  getMarkets(): GeographicMarket[] {
    return US_MARKETS;
  }

  /**
   * Get market by ID
   */
  getMarket(id: string): GeographicMarket | undefined {
    return US_MARKETS.find(m => m.id === id);
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getDatePlusDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  private getDateRange(start: string, end: string): string[] {
    const dates: string[] = [];
    const current = new Date(start);
    const endDate = new Date(end);

    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof SportsApiError) {
      return error.retryable;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('fetch failed')
      );
    }

    return false;
  }
}

// Export singleton instance
export const sportsCalendarService = new SportsCalendarService();
