import { describe, expect, it } from 'vitest';
import type { AmbassadorSkillLevel } from '../../types/models.js';

const SKILL_RANK: Record<AmbassadorSkillLevel, number> = {
  trainee: 1,
  standard: 2,
  senior: 3,
  lead: 4,
};

interface AmbassadorAssignmentContext {
  ambassadorSkill: AmbassadorSkillLevel;
  eventRequiredSkill: AmbassadorSkillLevel;
  ambassadorStatus: 'active' | 'inactive' | 'suspended';
  hasAvailability: boolean;
}

function meetsSkillRequirement(
  ambassadorSkill: AmbassadorSkillLevel,
  requiredSkill: AmbassadorSkillLevel
): boolean {
  return SKILL_RANK[ambassadorSkill] >= SKILL_RANK[requiredSkill];
}

function isAssignmentEligible(context: AmbassadorAssignmentContext): boolean {
  return context.ambassadorStatus === 'active'
    && context.hasAvailability
    && meetsSkillRequirement(context.ambassadorSkill, context.eventRequiredSkill);
}

describe('Phase 4: Ambassador business rules', () => {
  it('enforces minimum skill level requirements', () => {
    expect(meetsSkillRequirement('lead', 'senior')).toBe(true);
    expect(meetsSkillRequirement('senior', 'standard')).toBe(true);
    expect(meetsSkillRequirement('standard', 'lead')).toBe(false);
    expect(meetsSkillRequirement('trainee', 'senior')).toBe(false);
  });

  it('allows assignment only for active, available ambassadors with sufficient skill', () => {
    expect(isAssignmentEligible({
      ambassadorSkill: 'senior',
      eventRequiredSkill: 'standard',
      ambassadorStatus: 'active',
      hasAvailability: true,
    })).toBe(true);

    expect(isAssignmentEligible({
      ambassadorSkill: 'senior',
      eventRequiredSkill: 'standard',
      ambassadorStatus: 'inactive',
      hasAvailability: true,
    })).toBe(false);

    expect(isAssignmentEligible({
      ambassadorSkill: 'standard',
      eventRequiredSkill: 'lead',
      ambassadorStatus: 'active',
      hasAvailability: true,
    })).toBe(false);
  });
});
