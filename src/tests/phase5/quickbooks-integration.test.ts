import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockSyncRecovery = vi.hoisted(() => ({
  createSyncCheckpoint: vi.fn(),
  updateSyncProgress: vi.fn(),
  completeSyncCheckpoint: vi.fn(),
  getResumableCheckpoint: vi.fn(),
  resumeSync: vi.fn(),
}));

vi.mock('../../services/integration/api-client.service.js', () => ({
  createApiClient: vi.fn(() => mockClient),
}));

vi.mock('../../config/database.js', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

vi.mock('../../services/integration/sync-recovery.service.js', () => mockSyncRecovery);
vi.mock('../../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Phase 5: QuickBooks integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exchanges OAuth code for tokens via QuickBooks provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'qb-access',
        refresh_token: 'qb-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = await import('../../services/oauth/providers/quickbooks.provider.js');
    const tokens = await provider.exchangeCodeForTokens('auth-code', 'realm-123');

    expect(tokens.accessToken).toBe('qb-access');
    expect(tokens.refreshToken).toBe('qb-refresh');
    expect(tokens.realmId).toBe('realm-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a QuickBooks invoice and maps response to internal model', async () => {
    mockClient.post.mockResolvedValue({
      success: true,
      data: {
        Invoice: {
          Id: 'inv-001',
          DocNumber: '1001',
          CustomerRef: { value: 'cust-1', name: 'Acme Co' },
          TotalAmt: 1200,
          Balance: 1200,
          DueDate: '2026-03-31',
          TxnDate: '2026-03-15',
          Line: [
            {
              DetailType: 'SalesItemLineDetail',
              Amount: 1200,
              Description: 'Service Fee',
              SalesItemLineDetail: { ItemRef: { value: 'item-1', name: 'Service Fee' }, Qty: 1, UnitPrice: 1200 },
            },
          ],
          MetaData: { CreateTime: '2026-03-15T00:00:00.000Z', LastUpdatedTime: '2026-03-15T00:00:00.000Z' },
        },
      },
    });

    const quickbooksClient = await import('../../services/integration/clients/quickbooks.client.js');
    const result = await quickbooksClient.createInvoice({
      invoiceNumber: '1001',
      customerId: 'cust-1',
      customerName: 'Acme Co',
      totalAmount: 1200,
      balance: 1200,
      dueDate: new Date('2026-03-31'),
      transactionDate: new Date('2026-03-15'),
      lineItems: [{ description: 'Service Fee', quantity: 1, unitPrice: 1200, amount: 1200 }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.externalId).toBe('inv-001');
    expect(result.data?.customerName).toBe('Acme Co');
    expect(mockClient.post).toHaveBeenCalledWith('/invoice', expect.any(Object), 'create_invoice');
  });

  it('runs invoice sync and tracks checkpoint progress', async () => {
    const invoice = {
      externalId: 'inv-001',
      invoiceNumber: '1001',
      customerId: 'cust-1',
      customerName: 'Acme Co',
      totalAmount: 100,
      balance: 0,
      dueDate: new Date('2026-03-15'),
      transactionDate: new Date('2026-03-10'),
      lineItems: [{ description: 'Fee', quantity: 1, unitPrice: 100, amount: 100 }],
      createdAt: new Date('2026-03-10'),
      updatedAt: new Date('2026-03-10'),
      source: 'quickbooks' as const,
    };

    vi.doMock('../../services/integration/clients/quickbooks.client.js', () => ({
      listInvoices: vi
        .fn()
        .mockResolvedValueOnce({ success: true, data: { invoices: [invoice], totalCount: 1 } })
        .mockResolvedValueOnce({ success: true, data: { invoices: [invoice], totalCount: 1 } }),
    }));

    mockSyncRecovery.getResumableCheckpoint.mockResolvedValue(null);
    mockSyncRecovery.createSyncCheckpoint.mockResolvedValue({ id: 'cp-1' });
    mockSyncRecovery.updateSyncProgress.mockResolvedValue(undefined);
    mockSyncRecovery.completeSyncCheckpoint.mockResolvedValue(undefined);
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const orchestrator = await import('../../services/integration/sync-orchestrator.service.js');
    const result = await orchestrator.syncQuickBooksInvoices({ batchSize: 100, resumeFromCheckpoint: false });

    expect(result.success).toBe(true);
    expect(result.recordsProcessed).toBe(1);
    expect(mockSyncRecovery.createSyncCheckpoint).toHaveBeenCalledWith('quickbooks', 'quickbooks_invoices', 1);
    expect(mockSyncRecovery.updateSyncProgress).toHaveBeenCalled();
    expect(mockSyncRecovery.completeSyncCheckpoint).toHaveBeenCalledWith('cp-1', 'completed');
    expect(mockPoolQuery).toHaveBeenCalled();
  });
});
