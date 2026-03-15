import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/phase21/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: 'coverage/phase21',
      include: [
        'src/config/database.ts',
        'src/config/secrets.ts',
        'src/db/connection-pool.ts',
        'src/routes/health.ts',
        'src/services/secretsService.ts',
        'src/services/secretsAuditService.ts',
        'src/utils/secretsRotation.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
