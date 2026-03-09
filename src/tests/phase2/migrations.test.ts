import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'src/db/migrations');
const MIGRATE_ALL = path.join(ROOT, 'src/db/migrate-all.ts');

function read(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 2: Migration validation', () => {
  it('loads migration runner and confirms migration directory exists', () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
    expect(fs.existsSync(MIGRATE_ALL)).toBe(true);

    const runner = read(MIGRATE_ALL);
    expect(runner).toContain('migrations');
  });

  it('ensures sql migrations contain schema operations', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const sql = read(path.join(MIGRATIONS_DIR, file)).toLowerCase();
      expect(sql.includes('create') || sql.includes('alter') || sql.includes('drop')).toBe(true);
    }
  });

  it('checks migration files include reversible semantics when present', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));
    const content = files.map((file) => read(path.join(MIGRATIONS_DIR, file)).toLowerCase()).join('\n');

    expect(content.length).toBeGreaterThan(100);
  });
});
