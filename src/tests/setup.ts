/**
 * Test Setup File
 * Configures mocks before any tests run
 */

import { vi } from 'vitest';

// Prevent process.exit from being called
vi.stubGlobal('process', {
  ...process,
  exit: vi.fn(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://test@localhost/test',
    ENCRYPTION_SECRET: 'test-encryption-secret-32-chars-long!!',
    APP_URL: 'http://localhost:3001',
    QUICKBOOKS_CLIENT_ID: 'test-qb-client-id',
    QUICKBOOKS_CLIENT_SECRET: 'test-qb-client-secret',
    QUICKBOOKS_ENVIRONMENT: 'sandbox',
    RAMP_CLIENT_ID: 'test-ramp-client-id',
    RAMP_CLIENT_SECRET: 'test-ramp-client-secret',
    PORT: '3001',
    HOST: '0.0.0.0',
    CLERK_SECRET_KEY: '',
    CLERK_PUBLISHABLE_KEY: '',
    LOG_LEVEL: 'info',
  },
});
