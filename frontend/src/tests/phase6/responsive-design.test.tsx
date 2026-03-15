import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEvent, ReactNode } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { EventFiltersComponent, defaultFilters } from '@/components/events/EventFilters';
import { EventListView } from '@/components/events/EventListView';

const usePathnameMock = vi.fn();
const listAmbassadorsMock = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button">User</div>,
}));

vi.mock('@/lib/api', () => ({
  ambassadorsApi: {
    list: (...args: unknown[]) => listAmbassadorsMock(...args),
  },
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: (e: MouseEvent) => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

describe('Phase 6 - responsive design', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue('/events');
    listAmbassadorsMock.mockResolvedValue({ data: [] });
  });

  it('keeps sidebar foundation classes for desktop layout', () => {
    setViewport(1280);
    render(<Sidebar />);

    const sidebarRoot = screen.getByText('XCLSV Core').closest('div');
    expect(sidebarRoot?.className).toContain('h-16');

    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('p-4');
    expect(screen.getByRole('link', { name: /events/i }).className).toContain('bg-blue-100');
  });

  it('uses responsive breakpoint classes in filter grid', async () => {
    const user = userEvent.setup();
    setViewport(375);

    const { container } = render(
      <EventFiltersComponent
        filters={defaultFilters}
        onFiltersChange={vi.fn()}
        locations={['New York, NY', 'Miami, FL']}
      />
    );

    await user.click(screen.getByRole('button', { name: /filters/i }));

    const expandedGrid = container.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3.xl\\:grid-cols-6');
    expect(expandedGrid).toBeInTheDocument();
  });

  it('keeps table horizontally scrollable for narrow screens', () => {
    setViewport(390);

    const event = {
      id: 'event-1',
      title: 'Mobile Event',
      eventDate: '2026-07-10',
      status: 'planned' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    render(<EventListView events={[event]} onEventClick={vi.fn()} />);

    const tableContainer = screen.getByRole('table').closest('[data-slot="table-container"]');
    expect(tableContainer).toHaveClass('overflow-x-auto');
  });
});
