import { describe, expect, it } from 'vitest';

type SignUpStatus = 'pending' | 'validated' | 'rejected' | 'duplicate';

interface SignupRecord {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  operatorId: number;
  ambassadorId: string;
  eventId: string;
  cpaAmount: number;
  submittedAt: Date;
}

const STATUS_TRANSITIONS: Record<SignUpStatus, SignUpStatus[]> = {
  pending: ['validated', 'rejected', 'duplicate'],
  validated: [],
  rejected: [],
  duplicate: [],
};

function canMove(from: SignUpStatus, to: SignUpStatus) {
  return STATUS_TRANSITIONS[from].includes(to);
}

function duplicateKey(input: SignupRecord) {
  const date = input.submittedAt.toISOString().slice(0, 10);
  return `${input.customerEmail.toLowerCase()}::${input.operatorId}::${date}`;
}

describe('Phase 2: SignUp model', () => {
  it('validates required signup fields', () => {
    const signup: SignupRecord = {
      customerName: 'Jordan Lee',
      customerEmail: 'jordan@example.com',
      customerPhone: '+12125550123',
      operatorId: 7,
      ambassadorId: 'amb-1',
      eventId: 'evt-1',
      cpaAmount: 150,
      submittedAt: new Date('2026-02-01T13:00:00Z'),
    };

    expect(signup.customerName).toBeTruthy();
    expect(signup.operatorId).toBeGreaterThan(0);
    expect(signup.cpaAmount).toBeGreaterThanOrEqual(0);
  });

  it('creates deterministic duplicate detection keys', () => {
    const a: SignupRecord = {
      customerName: 'Jordan Lee',
      customerEmail: 'Jordan@Example.com',
      customerPhone: '+12125550123',
      operatorId: 7,
      ambassadorId: 'amb-1',
      eventId: 'evt-1',
      cpaAmount: 150,
      submittedAt: new Date('2026-02-01T08:30:00Z'),
    };

    const b = { ...a, submittedAt: new Date('2026-02-01T23:30:00Z') };
    expect(duplicateKey(a)).toBe(duplicateKey(b));
  });

  it('enforces status lifecycle transitions', () => {
    expect(canMove('pending', 'validated')).toBe(true);
    expect(canMove('pending', 'rejected')).toBe(true);
    expect(canMove('validated', 'pending')).toBe(false);
    expect(canMove('duplicate', 'validated')).toBe(false);
  });
});
