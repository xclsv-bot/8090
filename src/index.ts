import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, closeDatabase } from './config/database.js';
import { logger } from './utils/logger.js';
import { startTokenRefreshService, stopTokenRefreshService } from './services/oauth/token-refresh.service.js';

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    // Build and start server
    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    // Start background services
    startTokenRefreshService();

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
