/**
 * Notification Service - WO-97
 * Handles sending notifications to ambassadors with retry logic
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import {
  NotificationLog,
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  SendNotificationInput,
  EventScheduledEmailData,
  NotificationResult,
} from '../types/notification.js';

// Retry delays in milliseconds (exponential backoff)
const RETRY_DELAYS = [
  1 * 60 * 1000,   // 1 minute
  5 * 60 * 1000,   // 5 minutes
  15 * 60 * 1000,  // 15 minutes
];

class NotificationService {
  /**
   * Send event scheduled notification to an ambassador
   * AC-97.1, AC-97.2, AC-97.3, AC-97.4
   */
  async sendEventScheduledNotification(
    eventId: string,
    ambassadorId: string
  ): Promise<NotificationResult> {
    const idempotencyKey = `${eventId}:${ambassadorId}:event_scheduled`;
    
    // AC-97.8: Check if notification already sent (prevent duplicates)
    const existing = await this.getByIdempotencyKey(idempotencyKey);
    if (existing && (existing.status === 'sent' || existing.status === 'pending')) {
      logger.info({ idempotencyKey }, 'Notification already exists, skipping');
      return { success: true, notificationId: existing.id };
    }

    // Fetch event and ambassador details
    const eventData = await this.getEventData(eventId);
    const ambassadorData = await this.getAmbassadorData(ambassadorId);
    
    if (!eventData || !ambassadorData) {
      logger.error({ eventId, ambassadorId }, 'Missing event or ambassador data');
      return { success: false, notificationId: '', error: 'Missing data' };
    }

    if (!ambassadorData.email) {
      logger.warn({ ambassadorId }, 'Ambassador has no email address');
      return { success: false, notificationId: '', error: 'No email address' };
    }

    // Format email content
    const emailData = this.formatEventScheduledEmail(eventData, ambassadorData);
    
    // Create notification log
    const notification = await this.createNotificationLog({
      eventId,
      ambassadorId,
      notificationType: 'event_scheduled',
      channel: 'email',
      recipientEmail: ambassadorData.email,
      subject: emailData.subject,
      body: emailData.body,
      idempotencyKey,
    });

    // Attempt to send
    return this.attemptSend(notification.id);
  }

  /**
   * Attempt to send a notification with retry logic
   * AC-97.6: Retry up to 3 times with exponential backoff
   */
  async attemptSend(notificationId: string): Promise<NotificationResult> {
    const notification = await this.getById(notificationId);
    if (!notification) {
      return { success: false, notificationId, error: 'Notification not found' };
    }

    try {
      // Update attempt count
      const attempts = notification.attempts + 1;
      await this.updateNotification(notificationId, {
        attempts,
        lastAttemptAt: new Date(),
        status: 'pending',
      });

      // Send email (placeholder - integrate with actual email service)
      await this.sendEmail(
        notification.recipientEmail!,
        notification.subject!,
        notification.body!
      );

      // Mark as sent
      await this.updateNotification(notificationId, {
        status: 'sent',
        sentAt: new Date(),
      });

      logger.info({ notificationId }, 'Notification sent successfully');
      return { success: true, notificationId };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const attempts = notification.attempts + 1;
      
      // Determine if we should retry
      if (attempts < notification.maxAttempts) {
        const nextRetryDelay = RETRY_DELAYS[attempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        const nextRetryAt = new Date(Date.now() + nextRetryDelay);
        
        await this.updateNotification(notificationId, {
          attempts,
          lastAttemptAt: new Date(),
          status: 'retrying',
          nextRetryAt,
          errorMessage,
        });
        
        logger.warn({ notificationId, attempts, nextRetryAt }, 'Notification failed, will retry');
      } else {
        // Max attempts reached
        await this.updateNotification(notificationId, {
          attempts,
          lastAttemptAt: new Date(),
          status: 'failed',
          errorMessage,
        });
        
        logger.error({ notificationId, attempts }, 'Notification failed permanently');
      }

      return { success: false, notificationId, error: errorMessage };
    }
  }

  /**
   * Process pending retries (called by cron/scheduler)
   */
  async processRetries(): Promise<number> {
    const pendingRetries = await db.query<{ id: string }>(
      `SELECT id FROM notification_logs 
       WHERE status = 'retrying' 
         AND next_retry_at <= NOW()
       ORDER BY next_retry_at ASC
       LIMIT 50`
    );

    let processed = 0;
    for (const row of pendingRetries.rows) {
      await this.attemptSend(row.id);
      processed++;
    }

    return processed;
  }

  /**
   * Get notification history for an event
   * AC-97.7: Admin can see notification history
   */
  async getEventNotifications(eventId: string): Promise<NotificationLog[]> {
    const result = await db.query<NotificationLog>(
      `SELECT 
        id, event_id as "eventId", ambassador_id as "ambassadorId",
        notification_type as "notificationType", channel,
        recipient_email as "recipientEmail", subject, status,
        attempts, max_attempts as "maxAttempts",
        last_attempt_at as "lastAttemptAt", sent_at as "sentAt",
        error_message as "errorMessage", created_at as "createdAt"
       FROM notification_logs
       WHERE event_id = $1
       ORDER BY created_at DESC`,
      [eventId]
    );
    return result.rows;
  }

  /**
   * Send email via configured email service
   * TODO: Integrate with Customer.io, SendGrid, or other provider
   */
  private async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // For now, log the email. In production, integrate with email service.
    logger.info({ to, subject }, 'Sending email notification');
    
    // Simulate potential failures for testing
    // In production, this would call the actual email API
    
    // Example Customer.io integration:
    // await customerioService.sendTransactionalEmail({
    //   to,
    //   transactional_message_id: 'event_scheduled',
    //   message_data: { subject, body }
    // });
    
    // For now, we'll consider it successful
    // Remove this and add real implementation
  }

  /**
   * Format the event scheduled email
   */
  private formatEventScheduledEmail(
    event: EventData,
    ambassador: AmbassadorData
  ): { subject: string; body: string } {
    const eventDate = new Date(event.eventDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const subject = `You're scheduled for ${event.title} on ${eventDate}`;
    
    const body = `
Hi ${ambassador.firstName},

You've been scheduled to work at:

📍 ${event.title}
📅 ${eventDate} at ${event.startTime || 'TBD'} - ${event.endTime || 'TBD'}
🏢 ${event.venue}${event.city ? `, ${event.city}` : ''}${event.state ? `, ${event.state}` : ''}

${event.notes ? `Special Instructions:\n${event.notes}\n` : ''}
Please confirm your availability in the app.

— XCLSV Events Team
    `.trim();

    return { subject, body };
  }

  // Database helper methods
  
  private async createNotificationLog(data: {
    eventId: string;
    ambassadorId: string;
    notificationType: NotificationType;
    channel: NotificationChannel;
    recipientEmail: string;
    subject: string;
    body: string;
    idempotencyKey: string;
  }): Promise<NotificationLog> {
    const result = await db.queryOne<NotificationLog>(
      `INSERT INTO notification_logs 
        (event_id, ambassador_id, notification_type, channel, recipient_email, subject, body, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, event_id as "eventId", ambassador_id as "ambassadorId", 
         notification_type as "notificationType", channel, status, attempts,
         max_attempts as "maxAttempts", created_at as "createdAt"`,
      [data.eventId, data.ambassadorId, data.notificationType, data.channel,
       data.recipientEmail, data.subject, data.body, data.idempotencyKey]
    );
    return result!;
  }

  private async getById(id: string): Promise<NotificationLog | null> {
    return db.queryOne<NotificationLog>(
      `SELECT id, event_id as "eventId", ambassador_id as "ambassadorId",
        notification_type as "notificationType", channel,
        recipient_email as "recipientEmail", subject, body, status,
        attempts, max_attempts as "maxAttempts",
        last_attempt_at as "lastAttemptAt", next_retry_at as "nextRetryAt",
        sent_at as "sentAt", error_message as "errorMessage",
        idempotency_key as "idempotencyKey", created_at as "createdAt"
       FROM notification_logs WHERE id = $1`,
      [id]
    );
  }

  private async getByIdempotencyKey(key: string): Promise<NotificationLog | null> {
    return db.queryOne<NotificationLog>(
      `SELECT id, status FROM notification_logs WHERE idempotency_key = $1`,
      [key]
    );
  }

  private async updateNotification(
    id: string,
    updates: Partial<{
      status: NotificationStatus;
      attempts: number;
      lastAttemptAt: Date;
      nextRetryAt: Date;
      sentAt: Date;
      errorMessage: string;
    }>
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.attempts !== undefined) {
      setClauses.push(`attempts = $${paramIndex++}`);
      values.push(updates.attempts);
    }
    if (updates.lastAttemptAt !== undefined) {
      setClauses.push(`last_attempt_at = $${paramIndex++}`);
      values.push(updates.lastAttemptAt);
    }
    if (updates.nextRetryAt !== undefined) {
      setClauses.push(`next_retry_at = $${paramIndex++}`);
      values.push(updates.nextRetryAt);
    }
    if (updates.sentAt !== undefined) {
      setClauses.push(`sent_at = $${paramIndex++}`);
      values.push(updates.sentAt);
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIndex++}`);
      values.push(updates.errorMessage);
    }

    values.push(id);
    await db.query(
      `UPDATE notification_logs SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  private async getEventData(eventId: string): Promise<EventData | null> {
    return db.queryOne<EventData>(
      `SELECT id, title, venue, city, state, event_date as "eventDate",
        start_time as "startTime", end_time as "endTime", notes
       FROM events WHERE id = $1`,
      [eventId]
    );
  }

  private async getAmbassadorData(ambassadorId: string): Promise<AmbassadorData | null> {
    return db.queryOne<AmbassadorData>(
      `SELECT id, first_name as "firstName", last_name as "lastName", email
       FROM ambassadors WHERE id = $1`,
      [ambassadorId]
    );
  }
}

// Internal types
interface EventData {
  id: string;
  title: string;
  venue: string;
  city?: string;
  state?: string;
  eventDate: Date;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

interface AmbassadorData {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export const notificationService = new NotificationService();
