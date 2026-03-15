import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../services/database.js', () => ({ db: dbMock }));
vi.mock('../../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Phase 5: Analytics queries and aggregations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns event performance metrics with parsed numeric summary', async () => {
    dbMock.queryOne.mockResolvedValueOnce({ events: '3', signups: '120', revenue: '5600', avg_signups: '40' });
    dbMock.queryMany
      .mockResolvedValueOnce([{ region: 'Northeast', events: 2, signups: 90, revenue: 4000 }])
      .mockResolvedValueOnce([{ type: 'sportsbook', events: 3, avg_signups: 40 }])
      .mockResolvedValueOnce([{ id: 'e-1', title: 'March Expo', signups: 42, revenue: 1500, roi: 25 }])
      .mockResolvedValueOnce([{ date: '2026-03-01', events: 1, signups: 30 }]);

    const { analyticsService } = await import('../../services/analyticsService.js');
    const result = await analyticsService.getEventPerformance('2026-03-01', '2026-03-31');

    expect(result.summary.events).toBe(3);
    expect(result.summary.signups).toBe(120);
    expect(result.summary.revenue).toBe(5600);
    expect(result.byRegion[0].region).toBe('Northeast');
    expect(result.topEvents).toHaveLength(1);
  });

  it('computes financial performance margins and grouped breakdowns', async () => {
    dbMock.queryOne.mockResolvedValueOnce({ revenue: '10000', expenses: '2500' });
    dbMock.queryMany
      .mockResolvedValueOnce([{ operator_id: 1, name: 'Operator A', amount: 6000 }])
      .mockResolvedValueOnce([{ category: 'travel', amount: 1500, budgeted: 2000 }])
      .mockResolvedValueOnce([{ month: '2026-03', revenue: 10000, expenses: 2500, profit: 7500 }]);

    const { analyticsService } = await import('../../services/analyticsService.js');
    const result = await analyticsService.getFinancialPerformance('2026-03-01', '2026-03-31');

    expect(result.summary.revenue).toBe(10000);
    expect(result.summary.expenses).toBe(2500);
    expect(result.summary.netIncome).toBe(7500);
    expect(result.summary.margin).toBe(75);
    expect(result.revenueByOperator[0].name).toBe('Operator A');
    expect(result.expensesByCategory[0].category).toBe('travel');
  });

  it('exports analytics payloads as JSON for report APIs', async () => {
    dbMock.queryOne.mockResolvedValueOnce({ revenue: '5000', expenses: '1000' });
    dbMock.queryMany
      .mockResolvedValueOnce([{ operator_id: 1, name: 'Operator A', amount: 3000 }])
      .mockResolvedValueOnce([{ category: 'ops', amount: 1000, budgeted: 1200 }])
      .mockResolvedValueOnce([{ month: '2026-03', revenue: 5000, expenses: 1000, profit: 4000 }]);

    const { analyticsService } = await import('../../services/analyticsService.js');
    const payload = await analyticsService.exportReport('financial', '2026-03-01', '2026-03-31', 'json');

    const parsed = JSON.parse(payload) as { summary: { netIncome: number } };
    expect(parsed.summary.netIncome).toBe(4000);
  });
});
