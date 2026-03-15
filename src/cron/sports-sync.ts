/**
 * Sports Calendar Auto-Sync Cron
 * Runs daily at 6 AM EST to sync upcoming games
 */

import { sportsCalendarService } from '../services/sportsCalendarService.js';
import { logger } from '../utils/logger.js';
import type { SportsLeague } from '../types/sportsCalendar.js';

export const SPORTS_SYNC_CRON_EXPRESSION = '0 6 * * *';
export const SPORTS_SYNC_TIMEZONE = 'America/New_York';
const SYNC_WINDOW_DAYS = 14;

function getDateInTimeZone(timeZone: string): Date {
  const now = new Date();
  const localized = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${localized}T00:00:00.000Z`);
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getActiveLeagues(referenceDate: Date): SportsLeague[] {
  const month = referenceDate.getUTCMonth() + 1; // 1-12

  const active = new Set<SportsLeague>();

  // NBA: Oct-Jun
  if (month >= 10 || month <= 6) active.add('NBA');
  // NHL: Oct-Jun
  if (month >= 10 || month <= 6) active.add('NHL');
  // MLB: Mar-Nov
  if (month >= 3 && month <= 11) active.add('MLB');
  // NFL: Aug-Feb
  if (month >= 8 || month <= 2) active.add('NFL');
  // NCAAF: Aug-Jan
  if (month >= 8 || month === 1) active.add('NCAAF');
  // NCAAB: Nov-Apr
  if (month >= 11 || month <= 4) active.add('NCAAB');

  return Array.from(active);
}

export async function runSportsSync() {
  const nowEt = getDateInTimeZone(SPORTS_SYNC_TIMEZONE);
  const startDate = toISODate(nowEt);
  const endDate = toISODate(new Date(nowEt.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const leagues = getActiveLeagues(nowEt);

  logger.info(
    { startDate, endDate, leagues, cron: SPORTS_SYNC_CRON_EXPRESSION, timezone: SPORTS_SYNC_TIMEZONE },
    'Starting scheduled sports calendar sync'
  );

  try {
    const result = await Promise.all(leagues.map(league => sportsCalendarService.syncLeague(league, startDate, endDate)));

    const summary = {
      leaguesAttempted: leagues.length,
      successful: result.filter(r => r.success).length,
      totalGamesFound: result.reduce((sum, r) => sum + r.gamesFound, 0),
      totalGamesCreated: result.reduce((sum, r) => sum + r.gamesCreated, 0),
      totalGamesUpdated: result.reduce((sum, r) => sum + r.gamesUpdated, 0),
      totalErrors: result.reduce((sum, r) => sum + r.errors.length, 0),
    };

    logger.info({ summary, result }, 'Sports calendar sync completed');
    return result;
  } catch (error) {
    logger.error({ error }, 'Sports calendar sync failed');
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runSportsSync()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
