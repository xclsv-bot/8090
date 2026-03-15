import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function read(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8');
}

describe('WO-133 updated schema integration references', () => {
  it('updates events route and service for new location/staffing fields', () => {
    const route = read('src/routes/events.ts');
    const service = read('src/services/eventService.ts');

    expect(route).toContain('locationName');
    expect(route).toContain('requiredSkillLevel');
    expect(service).toContain('location_name');
    expect(service).toContain('required_skill_level');
  });

  it('updates ambassador and signup routes/services for new columns', () => {
    const ambassadorRoute = read('src/routes/ambassadors.ts');
    const signupRoute = read('src/routes/signups.ts');
    const signupService = read('src/services/signupService.ts');

    expect(ambassadorRoute).toContain('clerkUserId');
    expect(signupRoute).toContain("z.enum(['event', 'import'])");
    expect(signupService).toContain('import_batch_id');
    expect(signupService).toContain('validation_status');
  });

  it('uses pay statement schema tables for line items, rates, and payments', () => {
    const payService = read('src/services/payStatementService.ts');

    expect(payService).toContain('pay_statement_line_items');
    expect(payService).toContain('pay_rate_history');
    expect(payService).toContain('statement_payment_history');
  });
});
