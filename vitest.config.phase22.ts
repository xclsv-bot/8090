import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/phase22/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: 'coverage/phase22',
    },
  },
});
