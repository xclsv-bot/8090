import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../config/database.js';
import { checkDatabaseHealth, queryWithRetry } from '../db/connection-pool.js';
import { logger } from '../utils/logger.js';
import { metricsService } from './metricsService.js';
import { withSpan } from '../middleware/tracing.js';

/**
 * Database service providing query methods with logging and error handling
 */
export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  /**
   * Execute a query with parameters
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await withSpan(
        'db.query',
        () => queryWithRetry<T>(text, params),
        { operation: this.extractOperation(text) }
      );
      const duration = Date.now() - start;

      metricsService.recordDatabaseQuery({
        operation: this.extractOperation(text),
        durationMs: duration,
        success: true,
      });
      
      logger.debug(
        { query: text, duration, rows: result.rowCount },
        'Database query executed'
      );
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      metricsService.recordDatabaseQuery({
        operation: this.extractOperation(text),
        durationMs: duration,
        success: false,
      });
      logger.error({ error, query: text }, 'Database query failed');
      throw error;
    }
  }

  private extractOperation(queryText: string): string {
    const operation = queryText.trim().split(/\s+/)[0];
    return operation ? operation.toUpperCase() : 'UNKNOWN';
  }

  /**
   * Execute a query and return first row or null
   */
  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] || null;
  }

  /**
   * Execute a query and return all rows
   */
  async queryMany<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  /**
   * Execute a transaction with multiple queries
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Transaction rolled back');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    return checkDatabaseHealth();
  }
}

// Export singleton instance
export const db = new DatabaseService();
