import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('radix-ui', () => {
  const DialogContext = React.createContext<{ onOpenChange?: (open: boolean) => void }>({});

  const Root = ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => React.createElement(DialogContext.Provider, { value: { onOpenChange } }, children);

  const Close = ({
    asChild,
    children,
    onClick,
    ...props
  }: {
    asChild?: boolean;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent<HTMLElement>) => void;
    [key: string]: unknown;
  }) => {
    const { onOpenChange } = React.useContext(DialogContext);
    const handleClick = (e: React.MouseEvent<HTMLElement>) => {
      onClick?.(e);
      onOpenChange?.(false);
    };

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, { ...props, onClick: handleClick });
    }

    return React.createElement(
      'button',
      { type: 'button', ...props, onClick: handleClick },
      children
    );
  };

  const SlotRoot = ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    if (React.isValidElement(children)) {
      return React.cloneElement(children, props);
    }
    return React.createElement('span', props, children);
  };

  const passthrough = (tag: keyof JSX.IntrinsicElements) =>
    ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
      React.createElement(tag, props, children);

  return {
    Slot: { Root: SlotRoot },
    Dialog: {
      Root,
      Trigger: passthrough('button'),
      Portal: passthrough('div'),
      Close,
      Overlay: passthrough('div'),
      Content: passthrough('div'),
      Title: passthrough('h2'),
      Description: passthrough('p'),
    },
  };
});

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

describe('Phase 6 - component library', () => {
  it('renders Button with variants and asChild support', () => {
    const { rerender } = render(<Button>Save</Button>);

    const defaultButton = screen.getByRole('button', { name: 'Save' });
    expect(defaultButton).toHaveAttribute('data-variant', 'default');
    expect(defaultButton).toHaveAttribute('data-size', 'default');

    rerender(
      <Button asChild variant="outline" size="sm">
        <a href="/events">View events</a>
      </Button>
    );

    const anchor = screen.getByRole('link', { name: 'View events' });
    expect(anchor).toHaveAttribute('href', '/events');
    expect(anchor).toHaveAttribute('data-variant', 'outline');
    expect(anchor).toHaveAttribute('data-size', 'sm');
  });

  it('renders Input with proper slot and native attrs', () => {
    render(<Input type="email" placeholder="Email" aria-label="Email" />);

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('data-slot', 'input');
  });

  it('renders Card sections consistently', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Current quarter</CardDescription>
          <CardAction>
            <Button size="xs">Refresh</Button>
          </CardAction>
        </CardHeader>
        <CardContent>Value: $12,000</CardContent>
        <CardFooter>Updated 1m ago</CardFooter>
      </Card>
    );

    expect(screen.getByText('Revenue')).toHaveAttribute('data-slot', 'card-title');
    expect(screen.getByText('Current quarter')).toHaveAttribute('data-slot', 'card-description');
    expect(screen.getByText('Value: $12,000')).toHaveAttribute('data-slot', 'card-content');
    expect(screen.getByText('Updated 1m ago')).toHaveAttribute('data-slot', 'card-footer');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('renders Badge variants and asChild support', () => {
    const { rerender } = render(<Badge>Default</Badge>);

    const badge = screen.getByText('Default');
    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge).toHaveAttribute('data-variant', 'default');

    rerender(
      <Badge asChild variant="outline">
        <a href="/status">Outline status</a>
      </Badge>
    );

    const badgeLink = screen.getByRole('link', { name: 'Outline status' });
    expect(badgeLink).toHaveAttribute('href', '/status');
    expect(badgeLink).toHaveAttribute('data-variant', 'outline');
  });

  it('renders and closes Dialog modal', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event details</DialogTitle>
            <DialogDescription>Review event metadata</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('Event details')).toBeInTheDocument();
    expect(screen.getByText('Review event metadata')).toBeInTheDocument();

    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    expect(closeButtons.length).toBeGreaterThan(0);

    await user.click(closeButtons[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
