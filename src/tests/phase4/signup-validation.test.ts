import { describe, expect, it } from 'vitest';

type SignupStatus = 'pending' | 'validated' | 'rejected' | 'duplicate';

interface SignupInput {
  customerName: string;
  customerEmail: string;
  operatorId: number;
  submittedAt: Date;
  ambassadorId: string;
}

const TRANSITIONS: Record<SignupStatus, SignupStatus[]> = {
  pending: ['validated', 'rejected', 'duplicate'],
  validated: [],
  rejected: [],
  duplicate: [],
};

function hasRequiredFields(input: Partial<SignupInput>): boolean {
  return Boolean(
    input.customerName
    && input.customerEmail
    && input.operatorId
    && input.submittedAt
    && input.ambassadorId
  );
}

function duplicateFingerprint(input: SignupInput): string {
  const day = input.submittedAt.toISOString().slice(0, 10);
  return `${input.customerEmail.trim().toLowerCase()}::${input.operatorId}::${day}`;
}

function canMoveSignupStatus(from: SignupStatus, to: SignupStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

describe('Phase 4: Signup validation rules', () => {
  it('enforces required fields for new signup creation', () => {
    const complete: SignupInput = {
      customerName: 'Jordan Lee',
      customerEmail: 'jordan@example.com',
      operatorId: 55,
      submittedAt: new Date('2026-03-10T14:00:00Z'),
      ambassadorId: 'amb-001',
    };

    expect(hasRequiredFields(complete)).toBe(true);
    expect(hasRequiredFields({ ...complete, customerEmail: '' })).toBe(false);
    expect(hasRequiredFields({ ...complete, operatorId: 0 })).toBe(false);
  });

  it('creates deterministic duplicate fingerprints per UTC day', () => {
    const first: SignupInput = {
      customerName: 'Jordan Lee',
      customerEmail: 'Jordan@Example.com',
      operatorId: 55,
      submittedAt: new Date('2026-03-10T01:00:00Z'),
      ambassadorId: 'amb-001',
    };

    const sameDay = { ...first, submittedAt: new Date('2026-03-10T23:59:59Z') };
    const nextDay = { ...first, submittedAt: new Date('2026-03-11T00:00:00Z') };

    expect(duplicateFingerprint(first)).toBe(duplicateFingerprint(sameDay));
    expect(duplicateFingerprint(first)).not.toBe(duplicateFingerprint(nextDay));
  });

  it('prevents illegal status transitions after terminal outcomes', () => {
    expect(canMoveSignupStatus('pending', 'validated')).toBe(true);
    expect(canMoveSignupStatus('pending', 'duplicate')).toBe(true);
    expect(canMoveSignupStatus('validated', 'pending')).toBe(false);
    expect(canMoveSignupStatus('rejected', 'validated')).toBe(false);
    expect(canMoveSignupStatus('duplicate', 'rejected')).toBe(false);
  });
});
