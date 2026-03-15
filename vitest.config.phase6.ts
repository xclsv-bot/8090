import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['frontend/src/tests/phase6/**/*.test.tsx'],
    setupFiles: ['frontend/src/tests/phase6/setup.ts'],
  },
});
