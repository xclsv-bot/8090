import { buildApp } from './app.js';
import { env, validateCriticalSecrets } from './config/env.js';
import { connectDatabase, closeDatabase } from './config/database.js';
import { logger } from './utils/logger.js';
import { startTokenRefreshService, stopTokenRefreshService } from './services/oauth/token-refresh.service.js';
import { db } from './services/database.js';
import { sportsCalendarService } from './services/sportsCalendarService.js';

const STARTUP_SYNC_WINDOW_DAYS = 14;
const STALE_SYNC_HOURS = 24;

function getDateISO(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

async function shouldRunStartupSportsSync(): Promise<{ shouldSync: boolean; reason: string }> {
  const stats = await db.queryOne<{ count: string; last_synced_at: Date | null }>(
    `SELECT COUNT(*)::text AS count, MAX(last_synced_at) AS last_synced_at
     FROM sports_games`
  );

  const gameCount = stats ? Number(stats.count) : 0;
  const lastSyncedAt = stats?.last_synced_at ? new Date(stats.last_synced_at) : null;

  if (gameCount === 0) {
    return { shouldSync: true, reason: 'sports_games table is empty' };
  }

  if (!lastSyncedAt) {
    return { shouldSync: true, reason: 'no last_synced_at timestamp found' };
  }

  const staleCutoff = Date.now() - STALE_SYNC_HOURS * 60 * 60 * 1000;
  if (lastSyncedAt.getTime() < staleCutoff) {
    return {
      shouldSync: true,
      reason: `last sync at ${lastSyncedAt.toISOString()} is older than ${STALE_SYNC_HOURS}h`,
    };
  }

  return {
    shouldSync: false,
    reason: `data fresh (last sync ${lastSyncedAt.toISOString()})`,
  };
}

async function runStartupSportsSync(): Promise<void> {
  try {
    const { shouldSync, reason } = await shouldRunStartupSportsSync();

    if (!shouldSync) {
      logger.info({ reason }, 'Skipping startup sports calendar sync');
      return;
    }

    const start = getDateISO(0);
    const end = getDateISO(STARTUP_SYNC_WINDOW_DAYS);
    logger.info({ start, end, reason, leagues: ['NBA', 'NCAAB'] }, 'Running startup sports calendar sync');

    const results = await Promise.all([
      sportsCalendarService.syncLeague('NBA', start, end),
      sportsCalendarService.syncLeague('NCAAB', start, end),
    ]);

    logger.info(
      {
        leagues: results.length,
        successful: results.filter(r => r.success).length,
        totalFound: results.reduce((sum, r) => sum + r.gamesFound, 0),
        totalCreated: results.reduce((sum, r) => sum + r.gamesCreated, 0),
        totalUpdated: results.reduce((sum, r) => sum + r.gamesUpdated, 0),
        totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
      },
      'Startup sports calendar sync completed'
    );
  } catch (error) {
    logger.error({ error }, 'Startup sports calendar sync failed');
  }
}

async function main() {
  try {
    // Validate critical secrets before establishing external connections.
    validateCriticalSecrets();
    await connectDatabase();

    // Build and start server
    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    // Start background services
    startTokenRefreshService();
    void runStartupSportsSync();

    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        docs: `http://localhost:${env.PORT}/documentation`,
      },
      '🚀 XCLSV Core Platform started'
    );

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down...');
      
      stopTokenRefreshService();
      await app.close();
      await closeDatabase();
      
      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
