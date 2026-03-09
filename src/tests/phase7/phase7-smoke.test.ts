import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PHASE7_DIR = path.join(ROOT, 'src/tests/phase7');

describe('Phase 7: Test suite smoke checks', () => {
  it('contains expected phase7 test files', () => {
    const files = fs.readdirSync(PHASE7_DIR).filter((name) => name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  it('includes foundational UI and realtime/performance testing files', () => {
    const files = fs.readdirSync(PHASE7_DIR);

    expect(files).toContain('feature-ui.test.ts');
    expect(files).toContain('data-visualizations.test.ts');
    expect(files).toContain('interactive-components.test.ts');
    expect(files).toContain('realtime-updates.test.ts');
    expect(files).toContain('pagination.test.ts');
    expect(files).toContain('cross-browser-compatibility.test.ts');
    expect(files).toContain('performance-large-datasets.test.ts');
  });
});
