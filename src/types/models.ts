/**
 * XCLSV Core Platform - Database Models
 * WO-20: Core shared data models
 */

// ============================================
// ENUMS
// ============================================

export type EventStatus = 'planned' | 'confirmed' | 'active' | 'completed' | 'cancelled';
export type AmbassadorSkillLevel = 'trainee' | 'standard' | 'senior' | 'lead';
export type CompensationType = 'per_signup' | 'hourly' | 'hybrid';
export type AmbassadorStatus = 'active' | 'inactive' | 'suspended';
export type ValidationStatus = 'pending' | 'validated' | 'rejected' | 'duplicate';
export type PayPeriodStatus = 'open' | 'closed' | 'processing' | 'paid';
export type BonusScope = 'event' | 'ambassador' | 'pay_period';

// ============================================
// MODELS
// ============================================

export interface Event {
  id: string;
  title: string;
  description?: string;
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  eventDate: Date;
  startTime?: string;
  endTime?: string;
  status: EventStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Ambassador {
  id: string;
  clerkUserId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  skillLevel: AmbassadorSkillLevel;
  compensationType: CompensationType;
  hourlyRate?: number;
  perSignupRate?: number;
  status: AmbassadorStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayPeriod {
  id: string;
  startDate: Date;
  endDate: Date;
  status: PayPeriodStatus;
  totalSignups: number;
  totalAmount: number;
  processedAt?: Date;
  notes?: string;
  createdAt: Date;
}

export interface SignUp {
  id: string;
  eventId?: string;
  ambassadorId: string;
  payPeriodId?: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  operatorId: number;
  operatorName?: string;
  validationStatus: ValidationStatus;
  submittedAt: Date;
  validatedAt?: Date;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
}

export interface EventAssignment {
  id: string;
  eventId: string;
  ambassadorId: string;
  role: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  checkInTime?: Date;
  checkOutTime?: Date;
  hoursWorked?: number;
  notes?: string;
  createdAt: Date;
}

export interface BonusThreshold {
  id: string;
  name: string;
  description?: string;
  thresholdCount: number;
  bonusAmount: number;
  scope: BonusScope;
  eventId?: string;
  ambassadorId?: string;
  payPeriodId?: string;
  isActive: boolean;
  createdAt: Date;
}

// ============================================
// CREATE/UPDATE DTOs
// ============================================

export interface CreateEventInput {
  title: string;
  description?: string;
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  eventDate: string; // ISO date
  startTime?: string;
  endTime?: string;
  status?: EventStatus;
  notes?: string;
}

export interface CreateAmbassadorInput {
  clerkUserId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  skillLevel?: AmbassadorSkillLevel;
  compensationType?: CompensationType;
  hourlyRate?: number;
  perSignupRate?: number;
  notes?: string;
}

export interface CreateSignUpInput {
  eventId?: string;
  ambassadorId: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  operatorId: number;
  operatorName?: string;
  notes?: string;
}

export interface CreateEventAssignmentInput {
  eventId: string;
  ambassadorId: string;
  role?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface CreateBonusThresholdInput {
  name: string;
  description?: string;
  thresholdCount: number;
  bonusAmount: number;
  scope: BonusScope;
  eventId?: string;
  ambassadorId?: string;
  payPeriodId?: string;
}
