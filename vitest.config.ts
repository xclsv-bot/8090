import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/tests/phase2/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    setupFiles: ['src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/types/ambassador.ts',
        'src/types/event.ts',
        'src/types/models.ts',
        'src/types/signup.ts',
        'src/types/adminChat.ts',
        'src/types/financial.ts',
        'src/types/payStatement.ts',
        'src/types/cpa.ts',
        'src/types/operator.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
