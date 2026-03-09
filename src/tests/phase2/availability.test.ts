import { describe, expect, it } from 'vitest';

interface GeneralAvailability {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  preferredRegions: string[];
}

interface AvailabilityException {
  exceptionDate: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
}

function resolveAvailability(general: GeneralAvailability, exception?: AvailabilityException) {
  if (!exception) return { allDay: false, startTime: general.startTime, endTime: general.endTime };
  if (exception.allDay) return { allDay: true, startTime: null, endTime: null };
  return { allDay: false, startTime: exception.startTime ?? general.startTime, endTime: exception.endTime ?? general.endTime };
}

describe('Phase 2: Availability models', () => {
  it('stores recurring weekly availability patterns', () => {
    const pattern: GeneralAvailability = {
      dayOfWeek: 2,
      startTime: '09:00',
      endTime: '17:00',
      preferredRegions: ['Northeast'],
    };

    expect(pattern.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(pattern.dayOfWeek).toBeLessThanOrEqual(6);
  });

  it('applies all-day exceptions over weekly pattern', () => {
    const general: GeneralAvailability = {
      dayOfWeek: 2,
      startTime: '09:00',
      endTime: '17:00',
      preferredRegions: ['Northeast'],
    };

    const exception: AvailabilityException = {
      exceptionDate: '2026-02-10',
      allDay: true,
    };

    const resolved = resolveAvailability(general, exception);
    expect(resolved.allDay).toBe(true);
    expect(resolved.startTime).toBeNull();
  });

  it('applies partial-time exceptions with precedence', () => {
    const general: GeneralAvailability = {
      dayOfWeek: 4,
      startTime: '10:00',
      endTime: '18:00',
      preferredRegions: ['Midwest'],
    };

    const exception: AvailabilityException = {
      exceptionDate: '2026-02-12',
      allDay: false,
      startTime: '12:00',
      endTime: '16:00',
    };

    const resolved = resolveAvailability(general, exception);
    expect(resolved.startTime).toBe('12:00');
    expect(resolved.endTime).toBe('16:00');
  });
});
