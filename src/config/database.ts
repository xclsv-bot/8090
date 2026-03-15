import { connectionPool, shutdownPool, verifyDatabaseConnection } from '../db/connection-pool.js';
import { logger } from '../utils/logger.js';

export const pool = connectionPool;

export async function connectDatabase(): Promise<void> {
  await verifyDatabaseConnection();
  logger.info('Database connection verified');
}

export async function closeDatabase(): Promise<void> {
  await shutdownPool();
  logger.info('Database pool closed');
}
