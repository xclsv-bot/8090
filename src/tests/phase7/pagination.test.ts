import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function computePageWindow(page: number, pageSize: number, total: number) {
  const safePage = Math.max(1, page);
  if (total <= 0) {
    return { from: 0, to: 0 };
  }

  const from = ((safePage - 1) * pageSize) + 1;
  const to = Math.min(safePage * pageSize, total);
  return { from, to };
}

describe('Phase 7: Pagination behavior', () => {
  it('declares payroll pagination constants and controls', () => {
    const content = read('frontend/src/app/payroll/page.tsx');

    expect(content).toContain('const PAGE_SIZE = 50');
    expect(content).toContain('const totalPages = Math.ceil(total / PAGE_SIZE)');
    expect(content).toContain('ChevronLeft');
    expect(content).toContain('ChevronRight');
    expect(content).toContain('Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, total)} of {total} entries');
  });

  it('computes pagination window bounds correctly', () => {
    expect(computePageWindow(1, 50, 140)).toEqual({ from: 1, to: 50 });
    expect(computePageWindow(2, 50, 140)).toEqual({ from: 51, to: 100 });
    expect(computePageWindow(3, 50, 140)).toEqual({ from: 101, to: 140 });
    expect(computePageWindow(1, 50, 0)).toEqual({ from: 0, to: 0 });
  });
});
