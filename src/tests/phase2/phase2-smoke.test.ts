import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PHASE2_DIR = path.join(ROOT, 'src/tests/phase2');

describe('Phase 2: Test suite smoke checks', () => {
  it('contains expected phase2 test files', () => {
    const files = fs.readdirSync(PHASE2_DIR).filter((name) => name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThanOrEqual(17);
  });

  it('includes foundational model test files', () => {
    const files = fs.readdirSync(PHASE2_DIR);
    expect(files).toContain('ambassador.test.ts');
    expect(files).toContain('event.test.ts');
    expect(files).toContain('signup.test.ts');
  });
});
