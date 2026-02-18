import { Pool, PoolConfig } from 'pg';
import { env } from './env.js';

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not established
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
};

export const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function connectDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log(`✅ Database connected at ${result.rows[0].now}`);
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}
