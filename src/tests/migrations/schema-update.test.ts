import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseMigrationSections } from '../../db/migrate-all.js';

const MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations');
const WO133_FILES = [
  '001_update_event_table.sql',
  '002_create_event_assignment_table.sql',
  '003_update_ambassador_table.sql',
  '004_update_signup_table.sql',
  '005_create_payroll_tables.sql',
  '006_create_availability_tables.sql',
];

describe('WO-133 schema migrations', () => {
  it('includes all migration files with UP and DOWN sections', () => {
    for (const file of WO133_FILES) {
      const fullPath = join(MIGRATIONS_DIR, file);
      expect(existsSync(fullPath), `${file} should exist`).toBe(true);

      const sql = readFileSync(fullPath, 'utf-8');
      expect(sql).toMatch(/--\s*UP/i);
      expect(sql).toMatch(/--\s*DOWN/i);

      const sections = parseMigrationSections(sql);
      expect(sections.up.length).toBeGreaterThan(0);
      expect(sections.down.length).toBeGreaterThan(0);
    }
  });

  it('contains expected core table operations', () => {
    const eventSql = readFileSync(join(MIGRATIONS_DIR, WO133_FILES[0]), 'utf-8');
    const signupSql = readFileSync(join(MIGRATIONS_DIR, WO133_FILES[3]), 'utf-8');
    const payrollSql = readFileSync(join(MIGRATIONS_DIR, WO133_FILES[4]), 'utf-8');

    expect(eventSql).toContain('ALTER TABLE events');
    expect(signupSql).toContain('ALTER TABLE signups');
    expect(payrollSql).toContain('CREATE TABLE IF NOT EXISTS ambassador_pay_statements');
  });
});
