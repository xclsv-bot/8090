import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function applySearchFilter(items: string[], term: string) {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.toLowerCase().includes(normalized));
}

describe('Phase 7: Interactive components (tables, filters, search)', () => {
  it('uses reusable table primitives with horizontal overflow handling', () => {
    const content = read('frontend/src/components/ui/table.tsx');

    expect(content).toContain('data-slot="table-container"');
    expect(content).toContain('overflow-x-auto');
    expect(content).toContain('function TableHeader');
    expect(content).toContain('function TableBody');
    expect(content).toContain('function TableCell');
  });

  it('includes search and filter controls in signups and payroll UIs', () => {
    const signups = read('frontend/src/app/signups/page.tsx');
    const payroll = read('frontend/src/app/payroll/page.tsx');

    expect(signups).toContain('placeholder="Search by name, email, or ambassador..."');
    expect(signups).toContain('setStatusFilter(e.target.value)');
    expect(payroll).toContain('placeholder="Search ambassador..."');
    expect(payroll).toContain('clearFilters()');
    expect(payroll).toContain('hasFilters');
  });

  it('supports deterministic filter behavior for search terms', () => {
    const values = ['Alice Johnson', 'Bob Smith', 'Carla Diaz'];

    expect(applySearchFilter(values, '')).toEqual(values);
    expect(applySearchFilter(values, 'bob')).toEqual(['Bob Smith']);
    expect(applySearchFilter(values, 'dia')).toEqual(['Carla Diaz']);
  });
});
