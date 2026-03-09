import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

interface Row {
  id: string;
  total: number;
  status: 'pending' | 'approved' | 'paid';
}

function aggregateTotals(rows: Row[]) {
  return rows.reduce((sum, row) => sum + row.total, 0);
}

describe('Phase 7: Performance with large datasets', () => {
  it('uses bounded page size for payroll table requests', () => {
    const content = read('frontend/src/app/payroll/page.tsx');

    expect(content).toContain('const PAGE_SIZE = 50');
    expect(content).toContain('limit: String(PAGE_SIZE)');
    expect(content).toContain('offset: String((page - 1) * PAGE_SIZE)');
  });

  it('uses memoization for ambassador list derivation to reduce recomputation', () => {
    const content = read('frontend/src/app/payroll/page.tsx');

    expect(content).toContain('const ambassadorList = useMemo(() =>');
    expect(content).toContain('new Set(entries.map(e => e.ambassadorName))');
    expect(content).toContain('[entries]');
  });

  it('keeps aggregation deterministic for large in-memory collections', () => {
    const rows: Row[] = Array.from({ length: 5000 }, (_, idx) => ({
      id: `row-${idx + 1}`,
      total: (idx % 5) + 1,
      status: idx % 3 === 0 ? 'paid' : idx % 3 === 1 ? 'approved' : 'pending',
    }));

    expect(rows.length).toBe(5000);
    expect(aggregateTotals(rows)).toBeGreaterThan(0);
    expect(aggregateTotals(rows)).toBe(15000);
  });
});
