import { Pool, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';

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
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      logger.debug(
        { query: text, duration, rows: result.rowCount },
        'Database query executed'
      );
      
      return result;
    } catch (error) {
      logger.error({ error, query: text }, 'Database query failed');
      throw error;
    }
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
    callback: (client: DatabaseTransactionClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const transactionClient: DatabaseTransactionClient = {
        query: async <R extends QueryResultRow>(text: string, params?: unknown[]) => {
          const result = await client.query<R>(text, params);
          return result;
        },
        queryOne: async <R extends QueryResultRow>(text: string, params?: unknown[]) => {
          const result = await client.query<R>(text, params);
          return result.rows[0] || null;
        },
        queryMany: async <R extends QueryResultRow>(text: string, params?: unknown[]) => {
          const result = await client.query<R>(text, params);
          return result.rows;
        },
      };

      const result = await callback(transactionClient);
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
    try {
      const result = await this.queryOne<{ now: Date }>('SELECT NOW()');
      return result !== null;
    } catch {
      return false;
    }
  }
}

export interface DatabaseTransactionClient {
  query: <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
  queryOne: <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<T | null>;
  queryMany: <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;
}

// Export singleton instance
export const db = new DatabaseService();
