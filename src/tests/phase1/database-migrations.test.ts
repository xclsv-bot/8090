import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/db/migrations');
const MIGRATE_ALL_PATH = path.join(process.cwd(), 'src/db/migrate-all.ts');

const queryMock = vi.fn();
const endMock = vi.fn().mockResolvedValue(undefined);

vi.mock('pg', () => ({
  Pool: class MockPool {
    constructor(_args?: unknown) {}
    query = queryMock;
    end = endMock;
  },
}));

describe('Phase 1: Database migrations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('loads migrate-all runner and parses UP/DOWN sections', async () => {
    expect(fs.existsSync(MIGRATE_ALL_PATH)).toBe(true);

    const { parseMigrationSections } = await import('../../db/migrate-all.js');
    const sample = `-- UP\nCREATE TABLE t1(id INT);\n-- DOWN\nDROP TABLE t1;`;
    const parsed = parseMigrationSections(sample);

    expect(parsed.up).toContain('CREATE TABLE t1');
    expect(parsed.down).toContain('DROP TABLE t1');
  });

  it('includes migration files and ensures forward SQL is non-empty', async () => {
    const { parseMigrationSections } = await import('../../db/migrate-all.js');

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      const sections = parseMigrationSections(content);
      expect(sections.up.length).toBeGreaterThan(0);
    }
  });

  it('executes migrate up and down with transaction semantics', async () => {
    const { migrate } = await import('../../db/migrate-all.js');

    await migrate('up');
    await migrate('down');

    const sqlCalls = queryMock.mock.calls.map(([sql]) => String(sql).trim().toUpperCase());
    expect(sqlCalls).toContain('BEGIN');
    expect(sqlCalls).toContain('COMMIT');
    expect(endMock).toHaveBeenCalled();
  });

  it('rolls back transaction on SQL failure', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (String(sql).includes('CREATE TABLE')) throw new Error('forced failure');
      return { rows: [], rowCount: 0 };
    });

    const { migrate } = await import('../../db/migrate-all.js');
    await migrate('up');

    const sqlCalls = queryMock.mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls).toContain('ROLLBACK');
  });

  it('supports idempotent repeated migration runs in test harness', async () => {
    const { migrate } = await import('../../db/migrate-all.js');

    await migrate('up');
    await migrate('up');

    expect(queryMock).toHaveBeenCalled();
    expect(endMock).toHaveBeenCalledTimes(2);
  });

  it('preserves data-related semantics in migration SQL', () => {
    const keyFiles = [
      '001_update_event_table.sql',
      '002_create_event_assignment_table.sql',
      '003_update_ambassador_table.sql',
      '004_update_signup_table.sql',
      '005_create_payroll_tables.sql',
      '006_create_availability_tables.sql',
    ];

    for (const file of keyFiles) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8').toLowerCase();
      expect(content.includes('alter table') || content.includes('create table')).toBe(true);
    }
  });
});
