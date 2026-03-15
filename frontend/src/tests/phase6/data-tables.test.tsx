import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEvent, ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EventListView } from '@/components/events/EventListView';
import { EventFiltersComponent, defaultFilters } from '@/components/events/EventFilters';
import type { Event } from '@/types';

const listAmbassadorsMock = vi.fn();

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

function makeEvent(id: number, title: string, eventDate: string): Event {
  return {
    id: `event-${id}`,
    title,
    eventDate,
    status: 'planned',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    city: 'New York',
    state: 'NY',
    signupGoal: id,
  };
}

describe('Phase 6 - data tables', () => {
  beforeEach(() => {
    listAmbassadorsMock.mockReset();
    listAmbassadorsMock.mockResolvedValue({ data: [] });
  });

  it('renders table primitives with semantic structure', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Row 1</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Name')).toHaveAttribute('data-slot', 'table-head');
    expect(screen.getByText('Row 1')).toHaveAttribute('data-slot', 'table-cell');
  });

  it('sorts events by selected column', async () => {
    const user = userEvent.setup();
    const onEventClick = vi.fn();

    render(
      <EventListView
        events={[
          makeEvent(1, 'Zulu Event', '2026-05-10'),
          makeEvent(2, 'Alpha Event', '2026-05-11'),
          makeEvent(3, 'Bravo Event', '2026-05-12'),
        ]}
        onEventClick={onEventClick}
      />
    );

    await user.click(screen.getByRole('button', { name: /event name/i }));

    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Alpha Event')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Bravo Event')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Zulu Event')).toBeInTheDocument();
  });

  it('supports pagination controls and page size changes', async () => {
    const user = userEvent.setup();
    const onEventClick = vi.fn();
    const events = Array.from({ length: 30 }, (_, idx) =>
      makeEvent(idx + 1, `Event ${String(idx + 1).padStart(2, '0')}`, `2026-06-${String((idx % 28) + 1).padStart(2, '0')}`)
    );

    render(<EventListView events={events} onEventClick={onEventClick} />);

    expect(screen.getByText(/showing 1 to 25 of 30/i)).toBeInTheDocument();

    const paginationGroup = screen.getByText(/page 1 of 2/i).parentElement;
    const nextPageButton = paginationGroup?.querySelectorAll('button')[1];
    expect(nextPageButton).toBeTruthy();
    if (!nextPageButton) throw new Error('Pagination next button not found');
    await user.click(nextPageButton);

    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/showing 26 to 30 of 30/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), '10');
    expect(screen.getByText(/showing 1 to 10 of 30/i)).toBeInTheDocument();
  });

  it('applies filters and allows clearing filter state', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();

    listAmbassadorsMock.mockResolvedValue({
      data: [
        {
          id: 'amb-1',
          firstName: 'Taylor',
          lastName: 'Smith',
        },
      ],
    });

    render(
      <EventFiltersComponent
        filters={{ ...defaultFilters, status: 'planned', search: 'summer' }}
        onFiltersChange={onFiltersChange}
        locations={['New York, NY', 'Miami, FL']}
      />
    );

    await waitFor(() => {
      expect(listAmbassadorsMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.selectOptions(screen.getByDisplayValue('Planned'), 'confirmed');

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        search: '',
        status: '',
        location: '',
      })
    );
  });
});
