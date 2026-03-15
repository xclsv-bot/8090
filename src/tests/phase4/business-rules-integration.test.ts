import { describe, expect, it } from 'vitest';
import { canTransition } from '../../types/event.js';
import type { AmbassadorSkillLevel, EventStatus } from '../../types/models.js';
import type { CpaRate } from '../../types/cpa.js';

const SKILL_RANK: Record<AmbassadorSkillLevel, number> = {
  trainee: 1,
  standard: 2,
  senior: 3,
  lead: 4,
};

interface EventContext {
  status: EventStatus;
  requiredSkillLevel: AmbassadorSkillLevel;
  maxAmbassadors: number;
  assignedAmbassadors: number;
}

interface SignupContext {
  operatorId: number;
  customerState: string;
  submittedAt: Date;
}

function canAssignToEvent(event: EventContext, ambassadorSkill: AmbassadorSkillLevel): boolean {
  const eventAcceptsAssignments = event.status === 'planned' || event.status === 'confirmed';
  const capacityAvailable = event.assignedAmbassadors < event.maxAmbassadors;
  const skillEligible = SKILL_RANK[ambassadorSkill] >= SKILL_RANK[event.requiredSkillLevel];

  return eventAcceptsAssignments && capacityAvailable && skillEligible;
}

function lookupCpaAmount(rates: CpaRate[], signup: SignupContext): number | undefined {
  return rates
    .filter((rate) => rate.isActive)
    .filter((rate) => rate.operatorId === signup.operatorId)
    .filter((rate) => rate.stateCode === signup.customerState.toUpperCase())
    .filter((rate) => rate.effectiveDate.getTime() <= signup.submittedAt.getTime())
    .filter((rate) => !rate.endDate || rate.endDate.getTime() >= signup.submittedAt.getTime())
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0]
    ?.cpaAmount;
}

describe('Phase 4: Cross-entity business rule integration', () => {
  it('supports Event -> Assignment -> Signup -> CPA workflow gating', () => {
    const event: EventContext = {
      status: 'planned',
      requiredSkillLevel: 'standard',
      maxAmbassadors: 2,
      assignedAmbassadors: 1,
    };

    const cpaRates: CpaRate[] = [{
      id: 'r-ny',
      operatorId: 12,
      stateCode: 'NY',
      rateType: 'cpa',
      cpaAmount: 130,
      effectiveDate: new Date('2026-01-01'),
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }];

    expect(canAssignToEvent(event, 'senior')).toBe(true);
    expect(canTransition(event.status, 'confirmed')).toBe(true);

    const cpa = lookupCpaAmount(cpaRates, {
      operatorId: 12,
      customerState: 'ny',
      submittedAt: new Date('2026-03-01T12:00:00Z'),
    });
    expect(cpa).toBe(130);
  });

  it('blocks downstream workflow when upstream business rules fail', () => {
    const fullEvent: EventContext = {
      status: 'confirmed',
      requiredSkillLevel: 'lead',
      maxAmbassadors: 2,
      assignedAmbassadors: 2,
    };

    const cannotAssign = canAssignToEvent(fullEvent, 'senior');
    const cannotReactivate = canTransition('completed', 'active');

    expect(cannotAssign).toBe(false);
    expect(cannotReactivate).toBe(false);
  });
});
