import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Phase 7: Core feature UI contracts', () => {
  it('includes events page controls for list/calendar, filters, and live status', () => {
    const content = read('frontend/src/app/events/page.tsx');

    expect(content).toContain("useEvents(");
    expect(content).toContain("useEventFilters(events)");
    expect(content).toContain("viewMode === 'calendar'");
    expect(content).toContain('EventFiltersComponent');
    expect(content).toContain("isConnected ? '● Live' : '○ Offline'");
  });

  it('includes ambassadors page table and status/skill badge mapping', () => {
    const content = read('frontend/src/app/ambassadors/page.tsx');

    expect(content).toContain('ambassadorsApi.list()');
    expect(content).toContain('statusColors');
    expect(content).toContain('skillColors');
    expect(content).toContain('<Table>');
    expect(content).toContain('Manage team members and assignments');
  });

  it('includes signups page validation and search/filter behavior', () => {
    const content = read('frontend/src/app/signups/page.tsx');

    expect(content).toContain('useSignups()');
    expect(content).toContain('useSignupFilters(signups)');
    expect(content).toContain('setSearch(e.target.value)');
    expect(content).toContain('setStatusFilter(e.target.value)');
    expect(content).toContain("handleValidate(signup.id, 'validated')");
  });

  it('includes payroll page filters, table layout, and data loading flow', () => {
    const content = read('frontend/src/app/payroll/page.tsx');

    expect(content).toContain('payrollApi.listEntries(params)');
    expect(content).toContain('payrollApi.getEntriesSummary()');
    expect(content).toContain('statusFilter');
    expect(content).toContain('searchAmbassador');
    expect(content).toContain('<Table>');
  });
});
