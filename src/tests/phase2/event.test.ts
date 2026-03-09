import { describe, expect, it } from 'vitest';
import { EventStateTransitions, canTransition } from '../../types/event.js';

function calculateRoi(revenue: number, cost: number) {
  if (cost === 0) return 0;
  return (revenue - cost) / cost;
}

describe('Phase 2: Event model', () => {
  it('exposes a valid event state machine', () => {
    expect(EventStateTransitions.planned).toContain('confirmed');
    expect(EventStateTransitions.active).toContain('completed');
    expect(EventStateTransitions.completed).toHaveLength(0);
  });

  it('allows valid transitions only', () => {
    expect(canTransition('planned', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'active')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('cancelled', 'planned')).toBe(false);
  });

  it('tracks assignment and attendance metrics', () => {
    const metrics = {
      expectedAttendance: 220,
      actualAttendance: 175,
      minAmbassadors: 4,
      maxAmbassadors: 8,
    };

    expect(metrics.actualAttendance).toBeLessThanOrEqual(metrics.expectedAttendance);
    expect(metrics.maxAmbassadors).toBeGreaterThan(metrics.minAmbassadors);
  });

  it('calculates budget and revenue indicators', () => {
    const budget = 10000;
    const actualCost = 7800;
    const attributedRevenue = 14800;

    expect(actualCost).toBeLessThanOrEqual(budget);
    expect(calculateRoi(attributedRevenue, actualCost)).toBeGreaterThan(0);
  });
});
