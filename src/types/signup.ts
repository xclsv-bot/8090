/**
 * Sign-Up Management Types - WO-52
 */

import type { ValidationStatus } from './models.js';

export interface SignUpExtended {
  id: string;
  eventId?: string;
  ambassadorId: string;
  payPeriodId?: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  customerZip?: string;
  customerDob?: Date;
  operatorId: number;
  operatorName?: string;
  validationStatus: ValidationStatus;
  submittedAt: Date;
  validatedAt?: Date;
  rejectionReason?: string;
  betSlipImageKey?: string;
  promoCodeUsed?: string;
  deviceType?: string;
  ipAddress?: string;
  latitude?: number;
  longitude?: number;
  source: string;
  externalId?: string;
  isDuplicate: boolean;
  duplicateOfId?: string;
  notes?: string;
  createdAt: Date;
}

export interface SignupValidationQueue {
  id: string;
  signupId: string;
  queueReason: string;
  priority: number;
  assignedTo?: string;
  assignedAt?: Date;
  notes?: string;
  createdAt: Date;
}

export interface SignupImportBatch {
  id: string;
  source: string;
  fileName?: string;
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  duplicateRecords: number;
  status: string;
  errorLog?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  createdBy?: string;
  createdAt: Date;
}

export interface CreateSignUpInput {
  eventId?: string;
  ambassadorId: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerState?: string;
  operatorId: number;
  betSlipImageKey?: string;
  promoCodeUsed?: string;
  source?: string;
}

export interface SignUpSearchFilters {
  eventId?: string;
  ambassadorId?: string;
  operatorId?: number;
  validationStatus?: ValidationStatus;
  fromDate?: string;
  toDate?: string;
  state?: string;
  source?: string;
  search?: string;
}
