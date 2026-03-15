import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  queryMany: vi.fn(),
  queryOne: vi.fn(),
  query: vi.fn(),
}));

const analyticsServiceMock = vi.hoisted(() => ({ getKPIs: vi.fn() }));
const reportingServiceMock = vi.hoisted(() => ({
  getValidationReport: vi.fn(),
  getOperatorReport: vi.fn(),
}));
const analyticsAuditServiceMock = vi.hoisted(() => ({ logReportExport: vi.fn() }));

vi.mock('../../services/database.js', () => ({ db: dbMock }));
vi.mock('../../services/analyticsService.js', () => ({ analyticsService: analyticsServiceMock }));
vi.mock('../../services/reportingService.js', () => ({ reportingService: reportingServiceMock }));
vi.mock('../../services/analyticsAuditService.js', () => ({ analyticsAuditService: analyticsAuditServiceMock }));
vi.mock('../../services/snapshotService.js', () => ({ snapshotService: { createSnapshot: vi.fn() } }));
vi.mock('../../utils/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const filters = {
  fromDate: '2026-03-01',
  toDate: '2026-03-31',
};

const context = {
  userId: 'user-1',
  userEmail: 'user@xclsv.com',
  userRole: 'admin',
  ipAddress: '127.0.0.1',
};

describe('Phase 5: Export functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dbMock.query.mockResolvedValue({ rows: [], rowCount: 1 });
    dbMock.queryOne.mockResolvedValue(null);
    dbMock.queryMany.mockResolvedValue([]);
    reportingServiceMock.getValidationReport.mockResolvedValue({ validationRate: 80 });
    reportingServiceMock.getOperatorReport.mockResolvedValue([]);
    analyticsServiceMock.getKPIs.mockResolvedValue([]);
  });

  it('generates CSV exports with headers and rows', async () => {
    dbMock.queryMany.mockResolvedValueOnce([
      {
        id: 's-1',
        created_at: '2026-03-05T12:00:00.000Z',
        customer_first_name: 'Jane',
        customer_last_name: 'Doe',
        customer_email: 'jane@example.com',
        customer_state: 'NY',
        validation_status: 'validated',
        ambassador_name: 'Alex Rep',
        operator_name: 'Operator A',
        event_title: 'March Event',
      },
    ]);

    const { exportService } = await import('../../services/exportService.js');
    const result = await exportService.export('signups', 'csv', filters as any, context);

    expect(result.mimeType).toBe('text/csv');
    expect(result.rowCount).toBe(1);
    expect(String(result.content)).toContain('First Name');
    expect(String(result.content)).toContain('Jane');
    expect(dbMock.query).toHaveBeenCalled();
    expect(analyticsAuditServiceMock.logReportExport).toHaveBeenCalled();
  });

  it('generates Excel exports for financial reports', async () => {
    dbMock.queryMany.mockResolvedValueOnce([
      { period: '2026-03', revenue: '1000', expenses: '400', signup_count: '20' },
    ]);

    const { exportService } = await import('../../services/exportService.js');
    const result = await exportService.export('financial', 'excel', filters as any, context);

    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.fileName.endsWith('.xlsx')).toBe(true);
    expect(String(result.content)).toContain('Revenue');
    expect(String(result.content)).toContain('1000.00');
  });

  it('builds PDF report output with summary and chart markup', async () => {
    dbMock.queryMany.mockResolvedValueOnce([
      {
        id: 'e-1',
        title: 'Expo',
        event_date: '2026-03-12',
        venue: 'Arena',
        region: 'Northeast',
        status: 'active',
        signup_count: '42',
        ambassador_count: '6',
        expenses: '500',
        revenue: '1500',
      },
    ]);

    const { exportService } = await import('../../services/exportService.js');
    const result = await exportService.export('event_performance', 'pdf', filters as any, context);

    expect(result.mimeType).toBe('application/pdf');
    expect(String(result.content)).toContain('Event Performance Report');
    expect(String(result.content)).toContain('<svg');
    expect(String(result.content)).toContain('Trend Overview');
  });
});
