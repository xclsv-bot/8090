/**
 * Notification Types - WO-97
 * Types for ambassador notification system
 */

export type NotificationType = 'event_scheduled' | 'event_cancelled' | 'event_updated';
export type NotificationChannel = 'email' | 'sms' | 'push';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'retrying';

export interface NotificationLog {
  id: string;
  eventId: string;
  ambassadorId: string;
  notificationType: NotificationType;
  channel: NotificationChannel;
  recipientEmail?: string;
  subject?: string;
  body?: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  sentAt?: Date;
  errorMessage?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendNotificationInput {
  eventId: string;
  ambassadorId: string;
  notificationType: NotificationType;
  channel?: NotificationChannel;
}

export interface EventScheduledEmailData {
  ambassadorFirstName: string;
  ambassadorEmail: string;
  eventTitle: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  city: string;
  state: string;
  specialInstructions?: string;
}

export interface NotificationResult {
  success: boolean;
  notificationId: string;
  error?: string;
}
