import { describe, expect, it } from 'vitest';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateCreatePayload(payload: Record<string, unknown>, required: string[]): ValidationResult {
  const errors = required.filter((field) => payload[field] === undefined || payload[field] === null).map((field) => `Missing field: ${field}`);
  return { valid: errors.length === 0, errors };
}

describe('Phase 3: Request/response validation', () => {
  it('rejects incomplete create payloads', () => {
    const result = validateCreatePayload({ name: 'Event A' }, ['name', 'startDate', 'location']);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing field: startDate');
    expect(result.errors).toContain('Missing field: location');
  });

  it('accepts complete payloads for core entity creation', () => {
    const eventPayload = {
      name: 'Event A',
      startDate: '2026-04-01',
      location: 'NYC',
    };

    const result = validateCreatePayload(eventPayload, ['name', 'startDate', 'location']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
