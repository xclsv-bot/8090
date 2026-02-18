/**
 * CPA Management Types - WO-22
 */

export interface CpaRate {
  id: string;
  operatorId: number;
  stateCode: string;
  rateType: 'cpa' | 'rev_share' | 'hybrid';
  cpaAmount?: number;
  revSharePercentage?: number;
  minDeposit?: number;
  effectiveDate: Date;
  endDate?: Date;
  isActive: boolean;
  tier?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CpaTier {
  id: string;
  operatorId?: number;
  tierName: string;
  minConversions: number;
  maxConversions?: number;
  rateMultiplier: number;
  bonusAmount?: number;
  isActive: boolean;
  createdAt: Date;
}

export interface SignupCpaAttribution {
  id: string;
  signupId: string;
  cpaRateId?: string;
  attributedAmount?: number;
  attributionDate: Date;
  isQualified: boolean;
  qualifiedAt?: Date;
  disqualificationReason?: string;
  createdAt: Date;
}

export interface CreateCpaRateInput {
  operatorId: number;
  stateCode: string;
  rateType: 'cpa' | 'rev_share' | 'hybrid';
  cpaAmount?: number;
  revSharePercentage?: number;
  minDeposit?: number;
  effectiveDate: string;
  endDate?: string;
  tier?: string;
}

export interface CpaRateLookup {
  operatorId: number;
  stateCode: string;
  date?: string;
}
