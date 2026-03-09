import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Phase 7: Cross-browser compatibility structure', () => {
  it('uses responsive and resilient layout primitives across core pages', () => {
    const events = read('frontend/src/app/events/page.tsx');
    const signups = read('frontend/src/app/signups/page.tsx');
    const payroll = read('frontend/src/app/payroll/page.tsx');

    expect(events).toContain('flex items-center');
    expect(signups).toContain('overflow-x-auto');
    expect(payroll).toContain('flex flex-wrap items-center gap-4');
    expect(payroll).toContain('min-w-[200px]');
  });

  it('keeps table content scrollable on narrow viewports', () => {
    const uiTable = read('frontend/src/components/ui/table.tsx');
    const payroll = read('frontend/src/app/payroll/page.tsx');

    expect(uiTable).toContain('overflow-x-auto');
    expect(payroll).toContain('<div className="overflow-x-auto">');
    expect(payroll).toContain('className="whitespace-nowrap"');
  });

  it('keeps compatibility-oriented structure explicit in app shell', () => {
    const layout = read('frontend/src/app/layout.tsx');

    expect(layout).toContain('<ClerkProvider>');
    expect(layout).toContain('<html');
    expect(layout).toContain('lang="en"');
    expect(layout).toContain('<body');
    expect(layout).toContain('antialiased');
    expect(layout).toContain('min-h-screen');
  });
});
