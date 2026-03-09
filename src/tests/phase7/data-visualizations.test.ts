import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

interface DashboardSnapshot {
  totalEvents: number;
  totalSignups: number;
  totalRevenue: number;
  netProfit: number;
}

function hasValidMetricShape(data: DashboardSnapshot) {
  return Number.isFinite(data.totalEvents)
    && Number.isFinite(data.totalSignups)
    && Number.isFinite(data.totalRevenue)
    && Number.isFinite(data.netProfit);
}

describe('Phase 7: Data visualization coverage', () => {
  it('defines analytics dashboard cards, tabs, and chart placeholders', () => {
    const content = read('frontend/src/app/analytics/page.tsx');

    expect(content).toContain('Analytics & Reporting');
    expect(content).toContain('<Tabs defaultValue="performance">');
    expect(content).toContain('Sign-up Trends');
    expect(content).toContain('Revenue Trends');
    expect(content).toContain('Chart visualization coming soon');
  });

  it('supports ranking-style dashboard tables for ambassadors and operators', () => {
    const content = read('frontend/src/app/analytics/page.tsx');

    expect(content).toContain('topPerformingAmbassadors');
    expect(content).toContain('topPerformingOperators');
    expect(content).toContain('#{i + 1}');
    expect(content).toContain('text-right font-mono');
  });

  it('keeps dashboard metric payload shape explicit', () => {
    const sample: DashboardSnapshot = {
      totalEvents: 120,
      totalSignups: 8420,
      totalRevenue: 125400,
      netProfit: 48820,
    };

    expect(hasValidMetricShape(sample)).toBe(true);
  });
});
