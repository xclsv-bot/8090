import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PHASE3_DIR = path.join(ROOT, 'src/tests/phase3');

describe('Phase 3: Test suite smoke checks', () => {
  it('contains expected phase3 test files', () => {
    const files = fs.readdirSync(PHASE3_DIR).filter((name) => name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it('includes foundational API testing files', () => {
    const files = fs.readdirSync(PHASE3_DIR);
    expect(files).toContain('api-layer.test.ts');
    expect(files).toContain('authentication.test.ts');
    expect(files).toContain('crud-endpoints.test.ts');
  });
});
