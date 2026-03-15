import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

import { useEvents } from '@/hooks/useEvents';
import { useSignups } from '@/hooks/useSignups';
import { usePayroll } from '@/hooks/usePayroll';

const eventsListMock = vi.fn();
const eventsCreateMock = vi.fn();
const eventsUpdateMock = vi.fn();
const eventsDeleteMock = vi.fn();
const signupsListMock = vi.fn();
const signupsValidateMock = vi.fn();
const ambassadorsListMock = vi.fn();
const operatorsListMock = vi.fn();
const payrollListPeriodsMock = vi.fn();
const payrollCurrentPeriodMock = vi.fn();
const payrollStatementsMock = vi.fn();
const payrollCalculateMock = vi.fn();
const payrollApproveMock = vi.fn();
const payrollPaymentsMock = vi.fn();

const subscribeMock = vi.fn(() => vi.fn());

vi.mock('@/lib/api', () => ({
  eventsApi: {
    list: (...args: unknown[]) => eventsListMock(...args),
    create: (...args: unknown[]) => eventsCreateMock(...args),
    update: (...args: unknown[]) => eventsUpdateMock(...args),
    delete: (...args: unknown[]) => eventsDeleteMock(...args),
  },
  signupsApi: {
    list: (...args: unknown[]) => signupsListMock(...args),
    validate: (...args: unknown[]) => signupsValidateMock(...args),
  },
  ambassadorsApi: {
    list: (...args: unknown[]) => ambassadorsListMock(...args),
  },
  operatorsApi: {
    list: (...args: unknown[]) => operatorsListMock(...args),
  },
  payrollApi: {
    listPeriods: (...args: unknown[]) => payrollListPeriodsMock(...args),
    getCurrentPeriod: (...args: unknown[]) => payrollCurrentPeriodMock(...args),
    getStatements: (...args: unknown[]) => payrollStatementsMock(...args),
    calculatePayroll: (...args: unknown[]) => payrollCalculateMock(...args),
    approvePeriod: (...args: unknown[]) => payrollApproveMock(...args),
    processPayments: (...args: unknown[]) => payrollPaymentsMock(...args),
  },
}));

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    subscribe: subscribeMock,
    isConnected: true,
  }),
}));

describe('Phase 6 - API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    eventsListMock.mockResolvedValue({ data: [] });
    eventsCreateMock.mockResolvedValue({ data: { id: 'new-event' } });
    eventsUpdateMock.mockResolvedValue({ data: { id: 'event-1' } });
    eventsDeleteMock.mockResolvedValue({ success: true });

    signupsListMock.mockResolvedValue({ data: [] });
    signupsValidateMock.mockResolvedValue({ success: true });
    ambassadorsListMock.mockResolvedValue({ data: [] });
    operatorsListMock.mockResolvedValue({ data: [] });

    payrollListPeriodsMock.mockResolvedValue({ data: [] });
    payrollCurrentPeriodMock.mockResolvedValue({ data: null });
    payrollStatementsMock.mockResolvedValue({ data: [] });
    payrollCalculateMock.mockResolvedValue({ success: true });
    payrollApproveMock.mockResolvedValue({ success: true });
    payrollPaymentsMock.mockResolvedValue({ data: { processed: 1, failed: 0 } });
  });

  it('loads events, exposes loading states, and keeps data across rerenders without refetch', async () => {
    eventsListMock.mockResolvedValueOnce({
      data: [
        {
          id: 'event-1',
          title: 'Test Event',
          eventDate: '2026-03-10',
          status: 'planned',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const { result, rerender } = renderHook(() => useEvents({ autoLoad: true, realtime: false }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.events).toHaveLength(1);
    });

    rerender();
    expect(eventsListMock).toHaveBeenCalledTimes(1);
  });

  it('handles events API failure as error state', async () => {
    eventsListMock.mockRejectedValueOnce(new Error('API unavailable'));

    const { result } = renderHook(() => useEvents({ realtime: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error?.message).toBe('API unavailable');
    });
  });

  it('loads signup data and computes stats', async () => {
    signupsListMock.mockResolvedValueOnce({
      data: [
        {
          id: 's1',
          ambassadorId: 'a1',
          customerFirstName: 'A',
          customerLastName: 'One',
          operatorId: 11,
          validationStatus: 'validated',
          cpaAmount: 100,
          submittedAt: '2026-03-10T00:00:00.000Z',
          createdAt: '2026-03-10T00:00:00.000Z',
        },
        {
          id: 's2',
          ambassadorId: 'a2',
          customerFirstName: 'B',
          customerLastName: 'Two',
          operatorId: 11,
          validationStatus: 'pending',
          cpaAmount: 75,
          submittedAt: '2026-03-10T00:00:00.000Z',
          createdAt: '2026-03-10T00:00:00.000Z',
        },
      ],
    });

    const { result } = renderHook(() => useSignups());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.stats.total).toBe(2);
      expect(result.current.stats.validated).toBe(1);
      expect(result.current.stats.pending).toBe(1);
      expect(result.current.stats.revenue).toBe(175);
    });
  });

  it('supports payroll actions and refreshes period data', async () => {
    payrollListPeriodsMock.mockResolvedValue({
      data: [
        {
          id: 'period-1',
          startDate: '2026-03-01',
          endDate: '2026-03-15',
          status: 'open',
          totalSignups: 10,
          totalAmount: 800,
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    });

    const { result } = renderHook(() => usePayroll());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.periods).toHaveLength(1);
    });

    await act(async () => {
      await result.current.calculatePayroll('period-1');
      await result.current.approvePeriod('period-1');
      await result.current.processPayments('period-1');
    });

    expect(payrollCalculateMock).toHaveBeenCalledWith('period-1');
    expect(payrollApproveMock).toHaveBeenCalledWith('period-1');
    expect(payrollPaymentsMock).toHaveBeenCalledWith('period-1');
  });
});
