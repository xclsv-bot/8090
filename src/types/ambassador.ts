/**
 * Ambassador Management Types
 * WO-9: Ambassador data models
 */

import type { AmbassadorSkillLevel, AmbassadorStatus } from './models.js';

// ============================================
// ENUMS
// ============================================

export type SkillLevelChangeStatus = 'pending' | 'approved' | 'rejected';
export type AuditAction = 'create' | 'update' | 'delete' | 'status_change' | 'skill_change';

// ============================================
// MODELS
// ============================================

export interface AmbassadorPerformanceHistory {
  id: string;
  ambassadorId: string;
  periodStart: Date;
  periodEnd: Date;
  totalSignups: number;
  validatedSignups: number;
  rejectedSignups: number;
  totalEvents: number;
  totalHours: number;
  performanceScore?: number;
  validationRate?: number;
  avgSignupsPerEvent?: number;
  notes?: string;
  calculatedAt: Date;
  createdAt: Date;
}

export interface SkillLevelSuggestion {
  id: string;
  ambassadorId: string;
  currentLevel: AmbassadorSkillLevel;
  suggestedLevel: AmbassadorSkillLevel;
  reason: string;
  supportingData?: {
    performanceScore?: number;
    totalSignups?: number;
    validationRate?: number;
    monthsAtLevel?: number;
    [key: string]: unknown;
  };
  status: SkillLevelChangeStatus;
  suggestedBy?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  createdAt: Date;
}

export interface AmbassadorAuditLog {
  id: string;
  ambassadorId: string;
  action: AuditAction;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy?: string;
  changeReason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface AvailabilitySlot {
  hour: number;  // 0-23
  available: boolean;
  preferenceLevel?: 'preferred' | 'available' | 'if_needed';
}

export interface AmbassadorAvailabilitySnapshot {
  id: string;
  ambassadorId: string;
  snapshotDate: Date;
  dayOfWeek: number;  // 0=Sunday, 6=Saturday
  availabilityData: {
    slots: AvailabilitySlot[];
  };
  totalAvailableHours: number;
  preferredRegions?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorEmergencyContact {
  id: string;
  ambassadorId: string;
  contactName: string;
  relationship?: string;
  phone: string;
  email?: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorDocument {
  id: string;
  ambassadorId: string;
  documentType: 'w9' | 'id' | 'contract' | 'background_check' | 'other';
  fileKey: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy?: string;
  verifiedAt?: Date;
  verifiedBy?: string;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreatePerformanceHistoryInput {
  ambassadorId: string;
  periodStart: string;
  periodEnd: string;
  totalSignups: number;
  validatedSignups: number;
  rejectedSignups?: number;
  totalEvents: number;
  totalHours?: number;
  notes?: string;
}

export interface CreateSkillLevelSuggestionInput {
  ambassadorId: string;
  suggestedLevel: AmbassadorSkillLevel;
  reason: string;
  supportingData?: Record<string, unknown>;
}

export interface ReviewSkillLevelSuggestionInput {
  suggestionId: string;
  approved: boolean;
  reviewNotes?: string;
}

export interface CreateAuditLogInput {
  ambassadorId: string;
  action: AuditAction;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changeReason?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAvailabilityInput {
  ambassadorId: string;
  date: string;
  slots: AvailabilitySlot[];
  preferredRegions?: string[];
  notes?: string;
}

export interface CreateEmergencyContactInput {
  ambassadorId: string;
  contactName: string;
  relationship?: string;
  phone: string;
  email?: string;
  isPrimary?: boolean;
}

export interface UploadDocumentInput {
  ambassadorId: string;
  documentType: string;
  fileKey: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  expiresAt?: string;
}

// ============================================
// QUERY TYPES
// ============================================

export interface AmbassadorSearchFilters {
  status?: AmbassadorStatus;
  skillLevel?: AmbassadorSkillLevel;
  region?: string;
  minPerformanceScore?: number;
  availableOn?: string;  // Date string
  search?: string;  // Name/email search
}

export interface PerformanceHistoryFilters {
  ambassadorId?: string;
  fromDate?: string;
  toDate?: string;
  minScore?: number;
}
