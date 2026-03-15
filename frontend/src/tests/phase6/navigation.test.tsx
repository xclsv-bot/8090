import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import EventDetailPage from '@/app/events/[id]/page';

const usePathnameMock = vi.fn();
const pushMock = vi.fn();
const useParamsMock = vi.fn();
const eventsGetMock = vi.fn();
const signupsListMock = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button">User</div>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: pushMock }),
  useParams: () => useParamsMock(),
}));

vi.mock('@/lib/api', () => ({
  eventsApi: {
    get: (...args: unknown[]) => eventsGetMock(...args),
    delete: vi.fn(),
  },
  signupsApi: {
    list: (...args: unknown[]) => signupsListMock(...args),
  },
}));

vi.mock('@/components/events', () => ({
  EventDuplicateModal: () => null,
  BulkDuplicateModal: () => null,
  EventBudgetSection: () => <div>Budget Section</div>,
  AmbassadorAssignmentSection: () => <div>Assignment Section</div>,
}));

describe('Phase 6 - navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue('/events/123');
    useParamsMock.mockReturnValue({ id: 'event-1' });
    eventsGetMock.mockResolvedValue({
      data: {
        id: 'event-1',
        title: 'Spring Launch',
        eventDate: '2026-03-20',
        status: 'planned',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    signupsListMock.mockResolvedValue({ data: [] });
  });

  it('marks matching sidebar route as active', () => {
    render(<Sidebar />);

    const eventsLink = screen.getByRole('link', { name: /events/i });
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });

    expect(eventsLink.className).toContain('bg-blue-100');
    expect(dashboardLink.className).toContain('text-gray-700');
  });

  it('renders core navigation links and home route', () => {
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /xclsv core/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /analytics/i })).toHaveAttribute('href', '/analytics');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('supports breadcrumb-style back navigation from event detail page', async () => {
    const user = userEvent.setup();
    render(<EventDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to events/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /back to events/i }));
    expect(pushMock).toHaveBeenCalledWith('/events');
  });
});
