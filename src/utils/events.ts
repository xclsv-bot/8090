/**
 * Event Publishing Helpers
 * Convenient functions for publishing platform events
 */

import { eventPublisher } from '../services/eventPublisher.js';
import { EventTypes } from '../types/events.js';
import type { 
  SignUpEvent, 
  EventUpdateEvent, 
  AmbassadorEvent, 
  PayrollEvent,
  ExternalSyncEvent 
} from '../types/events.js';

/**
 * Publish a sign-up submitted event
 */
export async function publishSignUpSubmitted(data: {
  signUpId: string;
  eventId?: string;
  ambassadorId: string;
  operatorId: number;
  customerName: string;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.SIGNUP_SUBMITTED,
    userId: data.userId,
    payload: {
      signUpId: data.signUpId,
      eventId: data.eventId,
      ambassadorId: data.ambassadorId,
      operatorId: data.operatorId,
      customerName: data.customerName,
    },
  } as Omit<SignUpEvent, 'id' | 'timestamp'>);
}

/**
 * Publish a sign-up validated event
 */
export async function publishSignUpValidated(data: {
  signUpId: string;
  eventId?: string;
  ambassadorId: string;
  operatorId: number;
  customerName: string;
  validationStatus: string;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.SIGNUP_VALIDATED,
    userId: data.userId,
    payload: {
      signUpId: data.signUpId,
      eventId: data.eventId,
      ambassadorId: data.ambassadorId,
      operatorId: data.operatorId,
      customerName: data.customerName,
      validationStatus: data.validationStatus,
    },
  } as Omit<SignUpEvent, 'id' | 'timestamp'>);
}

/**
 * Publish an event updated notification
 */
export async function publishEventUpdated(data: {
  eventId: string;
  title: string;
  status: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.EVENT_UPDATED,
    userId: data.userId,
    payload: {
      eventId: data.eventId,
      title: data.title,
      status: data.status,
      changes: data.changes,
    },
  } as Omit<EventUpdateEvent, 'id' | 'timestamp'>);
}

/**
 * Publish ambassador check-in event
 */
export async function publishAmbassadorCheckedIn(data: {
  ambassadorId: string;
  eventId: string;
  checkTime: string;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.AMBASSADOR_CHECKED_IN,
    userId: data.userId,
    payload: {
      ambassadorId: data.ambassadorId,
      eventId: data.eventId,
      checkTime: data.checkTime,
    },
  } as Omit<AmbassadorEvent, 'id' | 'timestamp'>);
}

/**
 * Publish ambassador check-out event
 */
export async function publishAmbassadorCheckedOut(data: {
  ambassadorId: string;
  eventId: string;
  checkTime: string;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.AMBASSADOR_CHECKED_OUT,
    userId: data.userId,
    payload: {
      ambassadorId: data.ambassadorId,
      eventId: data.eventId,
      checkTime: data.checkTime,
    },
  } as Omit<AmbassadorEvent, 'id' | 'timestamp'>);
}

/**
 * Publish payroll calculated event
 */
export async function publishPayrollCalculated(data: {
  payPeriodId: string;
  totalAmount: number;
  totalSignups: number;
  ambassadorCount: number;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.PAYROLL_CALCULATED,
    userId: data.userId,
    payload: {
      payPeriodId: data.payPeriodId,
      totalAmount: data.totalAmount,
      totalSignups: data.totalSignups,
      ambassadorCount: data.ambassadorCount,
    },
  } as Omit<PayrollEvent, 'id' | 'timestamp'>);
}

/**
 * Publish external sync completed event
 */
export async function publishExternalSyncCompleted(data: {
  syncType: string;
  source: string;
  recordsProcessed: number;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.EXTERNAL_SYNC_COMPLETED,
    userId: data.userId,
    payload: {
      syncType: data.syncType,
      source: data.source,
      recordsProcessed: data.recordsProcessed,
    },
  } as Omit<ExternalSyncEvent, 'id' | 'timestamp'>);
}

/**
 * Publish external sync failed event
 */
export async function publishExternalSyncFailed(data: {
  syncType: string;
  source: string;
  errorMessage: string;
  userId?: string;
}): Promise<void> {
  await eventPublisher.publish({
    type: EventTypes.EXTERNAL_SYNC_FAILED,
    userId: data.userId,
    payload: {
      syncType: data.syncType,
      source: data.source,
      errorMessage: data.errorMessage,
    },
  } as Omit<ExternalSyncEvent, 'id' | 'timestamp'>);
}
