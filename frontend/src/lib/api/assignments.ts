/**
 * Assignments API
 * WO-98: Domain module for event-ambassador assignments (WO-95)
 */

import type { Ambassador } from '@/types';
import { get, post, patch, del } from './client';

// ============================================
// TYPES
// ============================================

export interface EventAssignment {
  id: string;
  eventId: string;
  ambassadorId: string;
  // Flat ambassador fields from JOIN
  firstName?: string;
  lastName?: string;
  email?: string;
  skillLevel?: string;
  // Nested ambassador (for frontend convenience)
  ambassador?: Ambassador;
  role?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  status: 'pending' | 'confirmed' | 'declined' | 'completed';
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked?: number;
  payRate?: number;
  bonusAmount?: number;
  totalSignups?: number;
}

export interface SuggestedAmbassador {
  ambassador: Ambassador;
  score: number;
  reasons: string[];
  hasConflict: boolean;
  conflictDetails?: string;
}

// ============================================
// ASSIGNMENTS API
// ============================================

export const assignmentsApi = {
  /** Get all assignments for an event */
  getByEvent: (eventId: string) =>
    get<EventAssignment[]>(`/api/v1/assignments/event/${eventId}`),

  /** Get assignments for an ambassador */
  getByAmbassador: (ambassadorId: string, upcoming = true) =>
    get<EventAssignment[]>(`/api/v1/assignments/ambassador/${ambassadorId}?upcoming=${upcoming}`),

  /** Create new assignment */
  create: (data: {
    eventId: string;
    ambassadorId: string;
    role?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    payRate?: number;
  }) => post<EventAssignment>('/api/v1/assignments', data),

  /** Remove assignment */
  remove: (assignmentId: string) => del<void>(`/api/v1/assignments/${assignmentId}`),

  /** Update assignment status */
  updateStatus: (assignmentId: string, status: string, reason?: string) =>
    patch<EventAssignment>(`/api/v1/assignments/${assignmentId}/status`, {
      status,
      declinedReason: reason,
    }),

  /** Get AI-suggested ambassadors for an event */
  suggest: (eventId: string, limit?: number) =>
    post<SuggestedAmbassador[]>(
      `/api/v1/assignments/suggest/${eventId}${limit ? `?limit=${limit}` : ''}`
    ),
};
