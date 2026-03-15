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

describe('Phase 5: Ramp integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs and maps Ramp expense transactions', async () => {
    mockClient.get.mockResolvedValue({
      success: true,
      data: {
        data: [
          {
            id: 'txn-1',
            amount: 12345,
            card_id: 'card-1',
            card_holder: {
              department_id: 'dep-1',
              department_name: 'Marketing',
              first_name: 'Alex',
              last_name: 'Taylor',
            },
            merchant_id: 'm-1',
            merchant_name: 'Airline',
            merchant_category_code: '4511',
            sk_category_id: 12,
            sk_category_name: 'Travel',
            state: 'CLEARED',
            user_transaction_time: '2026-03-10T00:00:00.000Z',
            receipts: [{ id: 'r-1', url: 'https://example.com/r1' }],
            memo: 'Client travel',
          },
        ],
        page: { next: 'cursor-2' },
      },
    });

    const rampClient = await import('../../services/integration/clients/ramp.client.js');
    const result = await rampClient.listTransactions({ min_amount: 123.45, page_size: 50 });

    expect(result.success).toBe(true);
    expect(result.data?.transactions[0].amount).toBe(123.45);
    expect(result.data?.transactions[0].status).toBe('cleared');
    expect(result.data?.hasMore).toBe(true);
    expect(mockClient.get).toHaveBeenCalledWith(
      expect.stringContaining('min_amount=12345'),
      'list_transactions'
    );
  });

  it('handles Ramp card state operations', async () => {
    mockClient.post.mockResolvedValue({ success: true, data: undefined });

    const rampClient = await import('../../services/integration/clients/ramp.client.js');
    const suspendResult = await rampClient.suspendCard('card-123');
    const unsuspendResult = await rampClient.unsuspendCard('card-123');

    expect(suspendResult.success).toBe(true);
    expect(unsuspendResult.success).toBe(true);
    expect(mockClient.post).toHaveBeenNthCalledWith(1, '/cards/card-123/suspend', {}, 'suspend_card');
    expect(mockClient.post).toHaveBeenNthCalledWith(2, '/cards/card-123/unsuspend', {}, 'unsuspend_card');
  });

  it('runs paginated transaction sync and persists each transaction', async () => {
    const txnPage1 = {
      externalId: 'txn-1',
      amount: 10,
      cardId: 'card-1',
      employeeName: 'Alex Taylor',
      departmentId: 'dep-1',
      departmentName: 'Marketing',
      merchantId: 'm-1',
      merchantName: 'Store',
      categoryCode: '1234',
      categoryName: 'Supplies',
      status: 'cleared' as const,
      transactionDate: new Date('2026-03-12'),
      receiptUrls: ['https://example.com/receipt'],
      memo: 'Office supplies',
      source: 'ramp' as const,
    };

    vi.doMock('../../services/integration/clients/ramp.client.js', () => ({
      listTransactions: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: { transactions: [txnPage1], nextCursor: 'cursor-2', hasMore: true },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { transactions: [], nextCursor: null, hasMore: false },
        }),
    }));

    mockSyncRecovery.createSyncCheckpoint.mockResolvedValue({ id: 'cp-ramp' });
    mockSyncRecovery.updateSyncProgress.mockResolvedValue(undefined);
    mockSyncRecovery.completeSyncCheckpoint.mockResolvedValue(undefined);
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const orchestrator = await import('../../services/integration/sync-orchestrator.service.js');
    const result = await orchestrator.syncRampTransactions({ fromDate: '2026-03-01', toDate: '2026-03-31' });

    expect(result.success).toBe(true);
    expect(result.recordsProcessed).toBe(1);
    expect(mockSyncRecovery.createSyncCheckpoint).toHaveBeenCalledWith('ramp', 'ramp_transactions', 0);
    expect(mockSyncRecovery.completeSyncCheckpoint).toHaveBeenCalledWith('cp-ramp', 'completed');
    expect(mockPoolQuery).toHaveBeenCalled();
  });
});
