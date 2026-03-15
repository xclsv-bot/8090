import { describe, expect, it } from 'vitest';
import { EventStateTransitions, canTransition } from '../../types/event.js';
import type { EventStatus } from '../../types/models.js';

interface EventCapacity {
  minAmbassadors: number;
  maxAmbassadors: number;
  assignedAmbassadors: number;
}

function validateCapacity(input: EventCapacity) {
  const minValid = input.minAmbassadors >= 1;
  const maxValid = input.maxAmbassadors >= input.minAmbassadors;
  const withinRange = input.assignedAmbassadors >= input.minAmbassadors
    && input.assignedAmbassadors <= input.maxAmbassadors;

  return { minValid, maxValid, withinRange, isValid: minValid && maxValid && withinRange };
}

function nextStatusCandidates(status: EventStatus): EventStatus[] {
  return EventStateTransitions[status];
}

describe('Phase 4: Event business logic', () => {
  it('enforces lifecycle transitions based on event state machine', () => {
    expect(canTransition('planned', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'active')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('cancelled', 'planned')).toBe(false);
  });

  it('only allows cancellation from non-terminal states', () => {
    const cancellable = ['planned', 'confirmed', 'active'] as const;

    cancellable.forEach((status) => {
      expect(nextStatusCandidates(status)).toContain('cancelled');
    });

    expect(nextStatusCandidates('completed')).not.toContain('cancelled');
    expect(nextStatusCandidates('cancelled')).toHaveLength(0);
  });

  it('validates ambassador capacity boundaries', () => {
    const valid = validateCapacity({ minAmbassadors: 2, maxAmbassadors: 5, assignedAmbassadors: 3 });
    expect(valid.isValid).toBe(true);

    const underAssigned = validateCapacity({ minAmbassadors: 2, maxAmbassadors: 5, assignedAmbassadors: 1 });
    expect(underAssigned.withinRange).toBe(false);

    const overAssigned = validateCapacity({ minAmbassadors: 2, maxAmbassadors: 5, assignedAmbassadors: 6 });
    expect(overAssigned.withinRange).toBe(false);
  });

  it('rejects invalid capacity configurations where max is below min', () => {
    const invalid = validateCapacity({ minAmbassadors: 4, maxAmbassadors: 3, assignedAmbassadors: 3 });
    expect(invalid.maxValid).toBe(false);
    expect(invalid.isValid).toBe(false);
  });
});
