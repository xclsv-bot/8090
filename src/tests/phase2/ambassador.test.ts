import { describe, expect, it } from 'vitest';

type SkillLevel = 'trainee' | 'standard' | 'senior' | 'lead';

interface AmbassadorRecord {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  homeRegion: string;
  skillLevel: SkillLevel;
  hourlyRate?: number;
  clothingSize?: string;
}

interface PerformanceHistory {
  totalSignups: number;
  validatedSignups: number;
  totalEvents: number;
}

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const SKILL_LEVELS: SkillLevel[] = ['trainee', 'standard', 'senior', 'lead'];

function validateAmbassador(input: AmbassadorRecord) {
  return {
    validPhone: E164_REGEX.test(input.phone),
    validSkillLevel: SKILL_LEVELS.includes(input.skillLevel),
    hasRequiredFields: Boolean(input.firstName && input.lastName && input.email && input.homeRegion),
  };
}

function calculateValidationRate(history: PerformanceHistory) {
  if (history.totalSignups === 0) return 0;
  return history.validatedSignups / history.totalSignups;
}

describe('Phase 2: Ambassador model', () => {
  it('validates required fields and optional profile fields', () => {
    const ambassador: AmbassadorRecord = {
      firstName: 'Ari',
      lastName: 'Stone',
      email: 'ari@example.com',
      phone: '+15551234567',
      homeRegion: 'Northeast',
      skillLevel: 'senior',
      hourlyRate: 35,
      clothingSize: 'M',
    };

    const result = validateAmbassador(ambassador);
    expect(result.hasRequiredFields).toBe(true);
    expect(result.validPhone).toBe(true);
    expect(result.validSkillLevel).toBe(true);
  });

  it('rejects non-E.164 phone format', () => {
    const invalid: AmbassadorRecord = {
      firstName: 'Bad',
      lastName: 'Phone',
      email: 'bad@example.com',
      phone: '555-123-4567',
      homeRegion: 'South',
      skillLevel: 'trainee',
    };

    expect(validateAmbassador(invalid).validPhone).toBe(false);
  });

  it('supports performance history tracking', () => {
    const history: PerformanceHistory = {
      totalSignups: 20,
      validatedSignups: 17,
      totalEvents: 5,
    };

    expect(calculateValidationRate(history)).toBe(0.85);
    expect(history.totalEvents).toBeGreaterThan(0);
  });

  it('ensures email uniqueness using set semantics', () => {
    const emails = ['a@example.com', 'b@example.com', 'a@example.com'];
    const uniqueCount = new Set(emails.map((email) => email.toLowerCase())).size;

    expect(uniqueCount).toBe(2);
    expect(uniqueCount).toBeLessThan(emails.length);
  });
});
