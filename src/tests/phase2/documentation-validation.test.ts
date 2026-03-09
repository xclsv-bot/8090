import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TYPE_FILES = [
  'src/types/ambassador.ts',
  'src/types/event.ts',
  'src/types/signup.ts',
  'src/types/adminChat.ts',
  'src/types/financial.ts',
  'src/types/payStatement.ts',
  'src/types/cpa.ts',
  'src/types/operator.ts',
];

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Phase 2: Documentation validation', () => {
  it('verifies model files have top-level docs/comments', () => {
    for (const file of TYPE_FILES) {
      const content = read(file);
      expect(content.trimStart().startsWith('/**')).toBe(true);
    }
  });

  it('checks for exported type or interface definitions', () => {
    for (const file of TYPE_FILES) {
      const content = read(file);
      expect(/export\s+(type|interface)\s+/m.test(content)).toBe(true);
    }
  });

  it('verifies database schema documentation files exist', () => {
    const schemaFiles = [
      'src/db/schema.sql',
      'src/db/ambassador_schema.sql',
      'src/db/event_management_schema.sql',
      'src/db/financial_schema.sql',
      'src/db/payroll_schema.sql',
      'src/db/integrations_schema.sql',
    ];

    for (const file of schemaFiles) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });
});
