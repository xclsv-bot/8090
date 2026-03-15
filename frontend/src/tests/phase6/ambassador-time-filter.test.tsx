import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import AmbassadorDetailPage from '@/app/ambassadors/[id]/page';
import { getDateRangeForPeriod, TimePeriod } from '@/components/time-filter';

const useParamsMock = vi.fn();
const backMock = vi.fn();
const replaceMock = vi.fn();
const useSearchParamsMock = vi.fn();

const ambassadorsGetMock = vi.fn();
const ambassadorsGetPerformanceMock = vi.fn();
const assignmentsGetByAmbassadorMock = vi.fn();
const payrollGetAmbassadorPaymentsMock = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => useParamsMock(),
  useRouter: () => ({ back: backMock, replace: replaceMock }),
  usePathname: () => '/ambassadors/amb-1',
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/lib/api', () => ({
  ambassadorsApi: {
    get: (...args: unknown[]) => ambassadorsGetMock(...args),
    getPerformance: (...args: unknown[]) => ambassadorsGetPerformanceMock(...args),
  },
  assignmentsApi: {
    getByAmbassador: (...args: unknown[]) => assignmentsGetByAmbassadorMock(...args),
  },
  payrollApi: {
    getAmbassadorPayments: (...args: unknown[]) => payrollGetAmbassadorPaymentsMock(...args),
  },
}));

describe('WO-128 ambassador time filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useParamsMock.mockReturnValue({ id: 'amb-1' });
    useSearchParamsMock.mockReturnValue(new URLSearchParams());

    ambassadorsGetMock.mockResolvedValue({
      data: {
        id: 'amb-1',
        firstName: 'Avery',
        lastName: 'Jones',
        status: 'active',
        skillLevel: 'standard',
        compensationType: 'per_signup',
        perSignupRate: 25,
      },
    });

    ambassadorsGetPerformanceMock.mockResolvedValue({
      data: { signups: 12, events: 4, earnings: 360 },
    });
    assignmentsGetByAmbassadorMock.mockResolvedValue({ data: [] });
    payrollGetAmbassadorPaymentsMock.mockResolvedValue({ data: [] });
  });

  it('renders time period selectors in all sections with Current Pay Period as default', async () => {
    render(<AmbassadorDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Performance History')).toBeInTheDocument();
      expect(screen.getByText('Event History')).toBeInTheDocument();
      expect(screen.getByText('Recent Payroll')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Performance Period')).toHaveDisplayValue('Current Pay Period');
    expect(screen.getByLabelText('Event History Period')).toHaveDisplayValue('Current Pay Period');
    expect(screen.getByLabelText('Payroll Period')).toHaveDisplayValue('Current Pay Period');
  });

  it('passes fromDate, toDate, and periodType to section API calls', async () => {
    render(<AmbassadorDetailPage />);

    const expectedRange = getDateRangeForPeriod(TimePeriod.CURRENT_PAY_PERIOD, new Date());

    await waitFor(() => {
      expect(ambassadorsGetPerformanceMock).toHaveBeenCalledWith('amb-1', {
        fromDate: expectedRange.startDate,
        toDate: expectedRange.endDate,
        periodType: TimePeriod.CURRENT_PAY_PERIOD,
      });

      expect(assignmentsGetByAmbassadorMock).toHaveBeenCalledWith('amb-1', {
        upcoming: false,
        fromDate: expectedRange.startDate,
        toDate: expectedRange.endDate,
        periodType: TimePeriod.CURRENT_PAY_PERIOD,
      });

      expect(payrollGetAmbassadorPaymentsMock).toHaveBeenCalledWith('amb-1', {
        limit: 10,
        fromDate: expectedRange.startDate,
        toDate: expectedRange.endDate,
        periodType: TimePeriod.CURRENT_PAY_PERIOD,
      });
    });
  });

  it('refetches and updates performance data when time period changes', async () => {
    ambassadorsGetPerformanceMock.mockImplementation((_: string, params: { periodType?: string }) => {
      if (params.periodType === TimePeriod.LAST_30_DAYS) {
        return Promise.resolve({ data: { signups: 20, events: 7, earnings: 900 } });
      }
      return Promise.resolve({ data: { signups: 12, events: 4, earnings: 360 } });
    });

    const user = userEvent.setup();
    render(<AmbassadorDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Performance Period'), TimePeriod.LAST_30_DAYS);

    await waitFor(() => {
      expect(ambassadorsGetPerformanceMock).toHaveBeenCalledWith(
        'amb-1',
        expect.objectContaining({ periodType: TimePeriod.LAST_30_DAYS }),
      );
      expect(screen.getByText('20')).toBeInTheDocument();
    });
  });
});
