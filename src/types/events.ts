/**
 * XCLSV Core Platform - Real-time Event Types
 * WO-21: WebSocket gateway and real-time event system
 */

// ============================================
// EVENT TYPES
// ============================================

export const EventTypes = {
  // Sign-up events
  SIGNUP_SUBMITTED: 'sign_up.submitted',
  SIGNUP_VALIDATED: 'sign_up.validated',
  SIGNUP_REJECTED: 'sign_up.rejected',
  
  // Sign-up extraction events (WO-68)
  SIGNUP_EXTRACTION_COMPLETED: 'sign_up.extraction_completed',
  SIGNUP_EXTRACTION_CONFIRMED: 'sign_up.extraction_confirmed',
  SIGNUP_EXTRACTION_SKIPPED: 'sign_up.extraction_skipped',
  
  // Customer.io sync events (WO-69)
  SIGNUP_CUSTOMERIO_SYNCED: 'sign_up.customerio_synced',
  SIGNUP_CUSTOMERIO_SYNC_FAILED: 'sign_up.customerio_sync_failed',
  
  // Event (venue) events
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_CANCELLED: 'event.cancelled',
  EVENT_COMPLETED: 'event.completed',
  
  // Ambassador events
  AMBASSADOR_AVAILABILITY_CHANGED: 'ambassador.availability_changed',
  AMBASSADOR_ASSIGNED: 'ambassador.assigned',
  AMBASSADOR_CHECKED_IN: 'ambassador.checked_in',
  AMBASSADOR_CHECKED_OUT: 'ambassador.checked_out',
  
  // Payroll events
  PAYROLL_CALCULATED: 'payroll.calculated',
  PAYROLL_PROCESSED: 'payroll.processed',
  PAY_PERIOD_CLOSED: 'pay_period.closed',
  
  // External sync events
  EXTERNAL_SYNC_STARTED: 'external_sync.started',
  EXTERNAL_SYNC_COMPLETED: 'external_sync.completed',
  EXTERNAL_SYNC_FAILED: 'external_sync.failed',
  
  // System events
  CONNECTION_ESTABLISHED: 'connection.established',
  CONNECTION_ERROR: 'connection.error',
  
  // Dashboard events (WO-72)
  DASHBOARD_SIGNUP_UPDATE: 'dashboard.signup_update',
  DASHBOARD_METRICS_REFRESH: 'dashboard.metrics_refresh',
  DASHBOARD_ALERT: 'dashboard.alert',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

// ============================================
// EVENT PAYLOADS
// ============================================

export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SignUpEvent extends BaseEvent {
  type: 'sign_up.submitted' | 'sign_up.validated' | 'sign_up.rejected';
  payload: {
    signUpId: string;
    eventId?: string;
    ambassadorId: string;
    operatorId: number;
    customerName: string;
    validationStatus?: string;
    rejectionReason?: string;
  };
}

export interface EventUpdateEvent extends BaseEvent {
  type: 'event.created' | 'event.updated' | 'event.cancelled' | 'event.completed';
  payload: {
    eventId: string;
    title: string;
    status: string;
    changes?: Record<string, { old: unknown; new: unknown }>;
  };
}

export interface AmbassadorEvent extends BaseEvent {
  type: 'ambassador.availability_changed' | 'ambassador.assigned' | 'ambassador.checked_in' | 'ambassador.checked_out';
  payload: {
    ambassadorId: string;
    eventId?: string;
    availability?: boolean;
    checkTime?: string;
  };
}

export interface PayrollEvent extends BaseEvent {
  type: 'payroll.calculated' | 'payroll.processed' | 'pay_period.closed';
  payload: {
    payPeriodId: string;
    totalAmount?: number;
    totalSignups?: number;
    ambassadorCount?: number;
  };
}

export interface ExternalSyncEvent extends BaseEvent {
  type: 'external_sync.started' | 'external_sync.completed' | 'external_sync.failed';
  payload: {
    syncType: string;
    source: string;
    recordsProcessed?: number;
    errorMessage?: string;
  };
}

export interface DashboardEvent extends BaseEvent {
  type: 'dashboard.signup_update' | 'dashboard.metrics_refresh' | 'dashboard.alert';
  payload: Record<string, unknown>;
}

export type PlatformEvent = 
  | SignUpEvent 
  | EventUpdateEvent 
  | AmbassadorEvent 
  | PayrollEvent 
  | ExternalSyncEvent
  | DashboardEvent
  | BaseEvent;

// ============================================
// SUBSCRIPTION & FILTERING
// ============================================

export interface SubscriptionFilter {
  eventTypes?: EventType[];
  eventIds?: string[];        // Specific venue events
  ambassadorIds?: string[];   // Specific ambassadors
  regions?: string[];         // Geographic regions (state)
}

export interface ClientSubscription {
  clientId: string;
  userId: string;
  userRole: string;
  filters: SubscriptionFilter;
  subscribedAt: Date;
}

// ============================================
// WEBSOCKET MESSAGES
// ============================================

export interface WSMessage {
  action: 'subscribe' | 'unsubscribe' | 'ping' | 'replay';
  payload?: unknown;
}

export interface WSSubscribeMessage extends WSMessage {
  action: 'subscribe';
  payload: {
    eventTypes?: EventType[];
    eventIds?: string[];
    ambassadorIds?: string[];
  };
}

export interface WSReplayMessage extends WSMessage {
  action: 'replay';
  payload: {
    fromTimestamp: string;
    eventTypes?: EventType[];
    limit?: number;
  };
}
