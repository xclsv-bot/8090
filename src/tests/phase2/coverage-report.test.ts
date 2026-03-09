import { describe, expect, it } from 'vitest';
import config from '../../../vitest.config.js';

describe('Phase 2: Coverage requirements', () => {
  it('enforces minimum 80% thresholds', () => {
    const thresholds = config.test?.coverage?.thresholds as { lines: number; functions: number; branches: number; statements: number } | undefined;
    expect(thresholds).toBeDefined();
    expect(thresholds?.lines).toBeGreaterThanOrEqual(80);
    expect(thresholds?.functions).toBeGreaterThanOrEqual(80);
    expect(thresholds?.branches).toBeGreaterThanOrEqual(80);
    expect(thresholds?.statements).toBeGreaterThanOrEqual(80);
  });

  it('includes html reporting and phase2 test include patterns', () => {
    const reporters = config.test?.coverage?.reporter as string[] | undefined;
    const includes = config.test?.include as string[] | undefined;

    expect(reporters).toContain('html');
    expect(includes).toContain('src/tests/phase2/**/*.test.ts');
  });
});
