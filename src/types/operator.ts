/**
 * Operator Management Types
 * WO-45: Operator data models and business logic
 */

// ============================================
// ENUMS
// ============================================

export type OperatorStatus = 'active' | 'inactive' | 'pending' | 'suspended';
export type OperatorCategory = 'sportsbook' | 'casino' | 'dfs' | 'poker' | 'other';

// ============================================
// MODELS
// ============================================

export interface Operator {
  id: number;
  name: string;
  displayName: string;
  category: OperatorCategory;
  status: OperatorStatus;
  logoUrl?: string;
  websiteUrl?: string;
  affiliateLink?: string;
  description?: string;
  legalStates?: string[];
  minAge: number;
  trackingParamName?: string;
  trackingBaseUrl?: string;
  sortOrder: number;
  featured: boolean;
  colorPrimary?: string;
  colorSecondary?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatorStateAvailability {
  id: string;
  operatorId: number;
  stateCode: string;
  isAvailable: boolean;
  launchDate?: Date;
  notes?: string;
  createdAt: Date;
}

export interface OperatorPromotion {
  id: string;
  operatorId: number;
  name: string;
  description?: string;
  promoCode?: string;
  promoType?: string;
  value?: string;
  terms?: string;
  affiliateLink?: string;
  stateRestrictions?: string[];
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatorContact {
  id: string;
  operatorId: number;
  contactType: string;
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
  isPrimary: boolean;
  createdAt: Date;
}

export interface OperatorApiCredentials {
  id: string;
  operatorId: number;
  credentialType: string;
  endpointUrl?: string;
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatorSyncHistory {
  id: string;
  operatorId: number;
  syncType: string;
  status: 'started' | 'completed' | 'failed';
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateOperatorInput {
  name: string;
  displayName: string;
  category: OperatorCategory;
  logoUrl?: string;
  websiteUrl?: string;
  affiliateLink?: string;
  description?: string;
  legalStates?: string[];
  trackingParamName?: string;
  trackingBaseUrl?: string;
  featured?: boolean;
  colorPrimary?: string;
  colorSecondary?: string;
}

export interface UpdateOperatorInput {
  displayName?: string;
  status?: OperatorStatus;
  logoUrl?: string;
  websiteUrl?: string;
  affiliateLink?: string;
  description?: string;
  legalStates?: string[];
  trackingParamName?: string;
  trackingBaseUrl?: string;
  sortOrder?: number;
  featured?: boolean;
  colorPrimary?: string;
  colorSecondary?: string;
}

export interface CreatePromotionInput {
  operatorId: number;
  name: string;
  description?: string;
  promoCode?: string;
  promoType?: string;
  value?: string;
  terms?: string;
  affiliateLink?: string;
  stateRestrictions?: string[];
  startDate?: string;
  endDate?: string;
}

export interface OperatorSearchFilters {
  status?: OperatorStatus;
  category?: OperatorCategory;
  state?: string;
  featured?: boolean;
  search?: string;
}

// ============================================
// HELPER TYPES
// ============================================

export interface OperatorWithPromos extends Operator {
  activePromotions: OperatorPromotion[];
}

export interface OperatorsByState {
  stateCode: string;
  stateName: string;
  operators: Operator[];
}
