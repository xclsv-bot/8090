/**
 * Event Management Types
 * WO-28: Event Management data models and state machine
 */

import type { EventStatus, AmbassadorSkillLevel } from './models.js';

// ============================================
// ENUMS
// ============================================

export type EventType = 'activation' | 'promotion' | 'tournament' | 'watch_party' | 'corporate' | 'other';
export type AssignmentStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed';

// ============================================
// EXTENDED EVENT MODEL
// ============================================

export interface EventExtended {
  id: string;
  title: string;
  description?: string;
  eventType: EventType;
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  region?: string;
  eventDate: Date;
  startTime?: string;
  endTime?: string;
  timezone: string;
  status: EventStatus;
  venueContactName?: string;
  venueContactPhone?: string;
  venueContactEmail?: string;
  expectedAttendance?: number;
  actualAttendance?: number;
  budget?: number;
  actualCost?: number;
  minAmbassadors: number;
  maxAmbassadors?: number;
  requiredSkillLevel?: AmbassadorSkillLevel;
  isRecurring: boolean;
  recurrenceRule?: string;
  parentEventId?: string;
  cancelledAt?: Date;
  cancelledReason?: string;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventStateHistory {
  id: string;
  eventId: string;
  fromStatus?: EventStatus;
  toStatus: EventStatus;
  changedBy?: string;
  changeReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface EventChecklist {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: Date;
  dueDate?: Date;
  sortOrder: number;
  createdAt: Date;
}

export interface EventOperator {
  id: string;
  eventId: string;
  operatorId: number;
  isPrimary: boolean;
  promoMaterials?: string;
  specialInstructions?: string;
  signupGoal?: number;
  createdAt: Date;
}

export interface EventMaterial {
  id: string;
  eventId: string;
  materialName: string;
  quantity: number;
  isProvided: boolean;
  providedBy?: string;
  notes?: string;
  createdAt: Date;
}

export interface EventNote {
  id: string;
  eventId: string;
  authorId?: string;
  noteType: 'general' | 'issue' | 'update' | 'internal';
  content: string;
  isPinned: boolean;
  createdAt: Date;
}

export interface EventMetrics {
  id: string;
  eventId: string;
  totalSignups: number;
  validatedSignups: number;
  totalAmbassadors: number;
  totalHours: number;
  totalCost: number;
  costPerSignup?: number;
  revenueAttributed?: number;
  roi?: number;
  calculatedAt: Date;
}

export interface EventAssignmentExtended {
  id: string;
  eventId: string;
  ambassadorId: string;
  role: string;
  status: AssignmentStatus;
  scheduledStart?: string;
  scheduledEnd?: string;
  checkInTime?: Date;
  checkOutTime?: Date;
  hoursWorked?: number;
  confirmedAt?: Date;
  declinedReason?: string;
  payRate?: number;
  bonusAmount?: number;
  totalSignups: number;
  notes?: string;
  createdAt: Date;
}

// ============================================
// STATE MACHINE
// ============================================

export const EventStateTransitions: Record<EventStatus, EventStatus[]> = {
  planned: ['confirmed', 'cancelled'],
  confirmed: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],  // Terminal state
  cancelled: [],  // Terminal state
};

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return EventStateTransitions[from]?.includes(to) ?? false;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateEventInput {
  title: string;
  description?: string;
  eventType?: EventType;
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  region?: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  venueContactName?: string;
  venueContactPhone?: string;
  venueContactEmail?: string;
  expectedAttendance?: number;
  budget?: number;
  minAmbassadors?: number;
  maxAmbassadors?: number;
  requiredSkillLevel?: AmbassadorSkillLevel;
  operatorIds?: number[];
}

export interface UpdateEventStatusInput {
  eventId: string;
  newStatus: EventStatus;
  reason?: string;
}

export interface CreateAssignmentInput {
  eventId: string;
  ambassadorId: string;
  role?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  payRate?: number;
}

export interface EventSearchFilters {
  status?: EventStatus;
  eventType?: EventType;
  region?: string;
  state?: string;
  fromDate?: string;
  toDate?: string;
  operatorId?: number;
  search?: string;
}
