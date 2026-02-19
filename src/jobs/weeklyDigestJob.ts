/**
 * Weekly Digest Job
 * WO-75: Analytics Reporting and Export Functionality
 * 
 * Automated weekly digest email generation and delivery
 * - Generates comprehensive weekly summary
 * - Sends formatted HTML emails to subscribers
 * - Attaches PDF reports when requested
 * - Tracks delivery status and failures
 */

import { db } from '../services/database.js';
import { logger } from '../utils/logger.js';
import { weeklyDigestService, type WeeklyDigestContent } from '../services/weeklyDigestService.js';
import { exportService } from '../services/exportService.js';
import { analyticsAuditService } from '../services/analyticsAuditService.js';
import type { DigestSubscription, ExportFilters } from '../types/export.js';

// ============================================
// CONFIGURATION
// ============================================

interface DigestJobConfig {
  /** Max subscribers to process per run */
  batchSize: number;
  /** Retry failed deliveries */
  retryFailures: boolean;
  /** Max retries for failed deliveries */
  maxRetries: number;
  /** Default delivery day (0=Sunday, 1=Monday, etc.) */
  defaultDeliveryDay: number;
  /** Default delivery hour (0-23) */
  defaultDeliveryHour: number;
}

const DEFAULT_CONFIG: DigestJobConfig = {
  batchSize: 100,
  retryFailures: true,
  maxRetries: 3,
  defaultDeliveryDay: 1, // Monday
  defaultDeliveryHour: 8, // 8 AM
};

interface DeliveryResult {
  subscriptionId: string;
  email: string;
  success: boolean;
  error?: string;
  deliveredAt?: Date;
}

// ============================================
// JOB FUNCTIONS
// ============================================

/**
 * Run the weekly digest delivery job
 * Should be scheduled to run hourly to catch all timezone windows
 */
export async function runWeeklyDigestJob(
  config: Partial<DigestJobConfig> = {}
): Promise<{
  processed: number;
  delivered: number;
  failed: number;
  results: DeliveryResult[];
}> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  logger.info({ config: mergedConfig }, 'Starting weekly digest job');

  try {
    // Get subscribers due for delivery
    const subscribers = await getDueSubscribers(mergedConfig.batchSize);

    if (subscribers.length === 0) {
      logger.info('No subscribers due for weekly digest delivery');
      return { processed: 0, delivered: 0, failed: 0, results: [] };
    }

    logger.info({ subscriberCount: subscribers.length }, 'Processing weekly digest subscribers');

    // Generate digest content once (shared across all deliveries)
    const digestContent = await weeklyDigestService.generateDigest();

    // Process each subscriber
    const results: DeliveryResult[] = [];
    let delivered = 0;
    let failed = 0;

    for (const subscriber of subscribers) {
      try {
        const result = await deliverDigestToSubscriber(subscriber, digestContent);
        results.push(result);

        if (result.success) {
          delivered++;
          await markDeliverySuccess(subscriber.id);
        } else {
          failed++;
          await markDeliveryFailure(subscriber.id, result.error || 'Unknown error');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failed++;
        results.push({
          subscriptionId: subscriber.id,
          email: subscriber.email,
          success: false,
          error: errorMessage,
        });
        await markDeliveryFailure(subscriber.id, errorMessage);
      }
    }

    const durationMs = Date.now() - startTime;

    // Log job completion
    await logJobRun('weekly_digest', {
      processed: subscribers.length,
      delivered,
      failed,
      durationMs,
    });

    logger.info(
      { processed: subscribers.length, delivered, failed, durationMs },
      'Weekly digest job completed'
    );

    return {
      processed: subscribers.length,
      delivered,
      failed,
      results,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Weekly digest job failed');

    await logJobRun('weekly_digest', {
      processed: 0,
      delivered: 0,
      failed: 0,
      error: errorMessage,
    });

    throw error;
  }
}

/**
 * Get subscribers due for delivery based on their schedule
 */
async function getDueSubscribers(limit: number): Promise<DigestSubscription[]> {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();

  // Find subscribers where:
  // - Subscription is active
  // - Current day matches their delivery day
  // - Current hour matches their delivery hour (with 1-hour window)
  // - Not already delivered this week
  const results = await db.queryMany<any>(
    `SELECT * FROM digest_subscriptions
     WHERE is_active = true
       AND delivery_day = $1
       AND delivery_hour BETWEEN $2 AND $3
       AND (last_delivered_at IS NULL 
            OR last_delivered_at < DATE_TRUNC('week', NOW()))
     ORDER BY created_at
     LIMIT $4`,
    [currentDay, currentHour - 1, currentHour + 1, limit]
  );

  return results.map(mapSubscriptionFromDb);
}

/**
 * Deliver digest to a single subscriber
 */
async function deliverDigestToSubscriber(
  subscriber: DigestSubscription,
  digestContent: WeeklyDigestContent
): Promise<DeliveryResult> {
  logger.debug({ email: subscriber.email }, 'Delivering digest to subscriber');

  try {
    // Format content based on subscriber preferences
    let htmlContent = weeklyDigestService.formatAsHtml(digestContent);
    let pdfAttachment: Buffer | undefined;

    // Generate PDF if requested
    if (subscriber.format === 'pdf' || subscriber.format === 'both') {
      const filters: ExportFilters = {
        fromDate: digestContent.periodStart.toISOString().split('T')[0],
        toDate: digestContent.periodEnd.toISOString().split('T')[0],
      };

      const pdfResult = await exportService.export(
        'weekly_digest',
        'pdf',
        filters,
        { userId: 'system', userEmail: 'system@xclsv.com', userRole: 'system' }
      );

      pdfAttachment = Buffer.from(pdfResult.content);
    }

    // Send email (simulated - in production would use email service)
    await sendDigestEmail({
      to: subscriber.email,
      subject: `XCLSV Weekly Digest - ${digestContent.periodStart.toISOString().split('T')[0]} to ${digestContent.periodEnd.toISOString().split('T')[0]}`,
      html: htmlContent,
      attachment: pdfAttachment
        ? {
            filename: `weekly_digest_${digestContent.periodStart.toISOString().split('T')[0]}.pdf`,
            content: pdfAttachment,
          }
        : undefined,
    });

    // Log successful delivery
    await analyticsAuditService.log('export', 'report', undefined, {
      userId: 'system',
      userEmail: 'system@xclsv.com',
      userRole: 'system',
    }, {
      resourceName: 'Weekly Digest Email',
      actionDetails: {
        recipientEmail: subscriber.email,
        periodStart: digestContent.periodStart.toISOString(),
        periodEnd: digestContent.periodEnd.toISOString(),
        format: subscriber.format,
      },
      success: true,
    });

    return {
      subscriptionId: subscriber.id,
      email: subscriber.email,
      success: true,
      deliveredAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      { email: subscriber.email, error: errorMessage },
      'Failed to deliver digest'
    );

    return {
      subscriptionId: subscriber.id,
      email: subscriber.email,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send digest email (placeholder - integrate with actual email service)
 */
async function sendDigestEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachment?: { filename: string; content: Buffer };
}): Promise<void> {
  // In production, this would integrate with an email service like:
  // - SendGrid
  // - AWS SES
  // - Customer.io
  // - Mailgun
  
  // For now, log the email details
  logger.info(
    {
      to: params.to,
      subject: params.subject,
      hasAttachment: !!params.attachment,
      htmlLength: params.html.length,
    },
    'Sending weekly digest email'
  );

  // Simulate email sending delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Log to database for tracking
  await db.query(
    `INSERT INTO email_delivery_log (
      recipient, subject, email_type, status, sent_at
    ) VALUES ($1, $2, 'weekly_digest', 'sent', NOW())`,
    [params.to, params.subject]
  );
}

/**
 * Mark successful delivery
 */
async function markDeliverySuccess(subscriptionId: string): Promise<void> {
  await db.query(
    `UPDATE digest_subscriptions 
     SET last_delivered_at = NOW(),
         delivery_count = delivery_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [subscriptionId]
  );
}

/**
 * Mark failed delivery
 */
async function markDeliveryFailure(
  subscriptionId: string,
  error: string
): Promise<void> {
  await db.query(
    `UPDATE digest_subscriptions 
     SET last_delivery_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [subscriptionId, error]
  );
}

/**
 * Log job run for monitoring
 */
async function logJobRun(
  jobType: string,
  stats: {
    processed: number;
    delivered: number;
    failed: number;
    durationMs?: number;
    error?: string;
  }
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO job_run_logs (
        job_type, run_at, processed_count, success_count, failure_count,
        duration_ms, error_message
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6)`,
      [
        jobType,
        stats.processed,
        stats.delivered,
        stats.failed,
        stats.durationMs,
        stats.error,
      ]
    );
  } catch (error) {
    logger.error({ error }, 'Failed to log job run');
  }
}

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

/**
 * Subscribe to weekly digest
 */
export async function subscribeToDigest(params: {
  userId: string;
  email: string;
  deliveryDay?: number;
  deliveryHour?: number;
  timezone?: string;
  includeSections?: string[];
  format?: 'html' | 'pdf' | 'both';
}): Promise<DigestSubscription> {
  const result = await db.queryOne<any>(
    `INSERT INTO digest_subscriptions (
      user_id, email, is_active, delivery_day, delivery_hour,
      timezone, include_sections, format
    ) VALUES ($1, $2, true, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      is_active = true,
      delivery_day = EXCLUDED.delivery_day,
      delivery_hour = EXCLUDED.delivery_hour,
      timezone = EXCLUDED.timezone,
      include_sections = EXCLUDED.include_sections,
      format = EXCLUDED.format,
      updated_at = NOW()
    RETURNING *`,
    [
      params.userId,
      params.email,
      params.deliveryDay ?? DEFAULT_CONFIG.defaultDeliveryDay,
      params.deliveryHour ?? DEFAULT_CONFIG.defaultDeliveryHour,
      params.timezone ?? 'America/New_York',
      params.includeSections ?? [],
      params.format ?? 'html',
    ]
  );

  logger.info({ userId: params.userId, email: params.email }, 'User subscribed to weekly digest');

  return mapSubscriptionFromDb(result);
}

/**
 * Unsubscribe from weekly digest
 */
export async function unsubscribeFromDigest(userId: string): Promise<void> {
  await db.query(
    `UPDATE digest_subscriptions 
     SET is_active = false, updated_at = NOW() 
     WHERE user_id = $1`,
    [userId]
  );

  logger.info({ userId }, 'User unsubscribed from weekly digest');
}

/**
 * Get subscription status
 */
export async function getSubscriptionStatus(
  userId: string
): Promise<DigestSubscription | null> {
  const result = await db.queryOne<any>(
    `SELECT * FROM digest_subscriptions WHERE user_id = $1`,
    [userId]
  );

  return result ? mapSubscriptionFromDb(result) : null;
}

/**
 * Update subscription preferences
 */
export async function updateSubscriptionPreferences(
  userId: string,
  updates: Partial<Pick<DigestSubscription, 'deliveryDay' | 'deliveryHour' | 'timezone' | 'includeSections' | 'format'>>
): Promise<DigestSubscription> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [userId];
  let paramIndex = 2;

  if (updates.deliveryDay !== undefined) {
    setClauses.push(`delivery_day = $${paramIndex++}`);
    values.push(updates.deliveryDay);
  }
  if (updates.deliveryHour !== undefined) {
    setClauses.push(`delivery_hour = $${paramIndex++}`);
    values.push(updates.deliveryHour);
  }
  if (updates.timezone !== undefined) {
    setClauses.push(`timezone = $${paramIndex++}`);
    values.push(updates.timezone);
  }
  if (updates.includeSections !== undefined) {
    setClauses.push(`include_sections = $${paramIndex++}`);
    values.push(updates.includeSections);
  }
  if (updates.format !== undefined) {
    setClauses.push(`format = $${paramIndex++}`);
    values.push(updates.format);
  }

  const result = await db.queryOne<any>(
    `UPDATE digest_subscriptions 
     SET ${setClauses.join(', ')}
     WHERE user_id = $1
     RETURNING *`,
    values
  );

  if (!result) {
    throw new Error('Subscription not found');
  }

  return mapSubscriptionFromDb(result);
}

/**
 * Get all active subscribers (for admin)
 */
export async function getActiveSubscribers(): Promise<DigestSubscription[]> {
  const results = await db.queryMany<any>(
    `SELECT * FROM digest_subscriptions WHERE is_active = true ORDER BY created_at`
  );

  return results.map(mapSubscriptionFromDb);
}

// ============================================
// MANUAL TRIGGER
// ============================================

/**
 * Send digest to specific email (for testing or manual sends)
 */
export async function sendDigestToEmail(
  email: string,
  format: 'html' | 'pdf' | 'both' = 'html'
): Promise<DeliveryResult> {
  const digestContent = await weeklyDigestService.generateDigest();

  const mockSubscription: DigestSubscription = {
    id: 'manual',
    userId: 'admin',
    email,
    isActive: true,
    deliveryDay: new Date().getDay(),
    deliveryHour: new Date().getHours(),
    timezone: 'UTC',
    includeSections: [],
    format,
    deliveryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return deliverDigestToSubscriber(mockSubscription, digestContent);
}

/**
 * Preview digest content (for testing)
 */
export async function previewDigest(): Promise<{
  content: WeeklyDigestContent;
  html: string;
  text: string;
}> {
  const content = await weeklyDigestService.generateDigest();
  const html = weeklyDigestService.formatAsHtml(content);
  const text = weeklyDigestService.formatAsText(content);

  return { content, html, text };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function mapSubscriptionFromDb(row: any): DigestSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    isActive: row.is_active,
    deliveryDay: row.delivery_day,
    deliveryHour: row.delivery_hour,
    timezone: row.timezone,
    includeSections: row.include_sections || [],
    format: row.format,
    lastDeliveredAt: row.last_delivered_at ? new Date(row.last_delivered_at) : undefined,
    deliveryCount: row.delivery_count || 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ============================================
// EXPORTS
// ============================================

export const weeklyDigestJob = {
  runWeeklyDigestJob,
  subscribeToDigest,
  unsubscribeFromDigest,
  getSubscriptionStatus,
  updateSubscriptionPreferences,
  getActiveSubscribers,
  sendDigestToEmail,
  previewDigest,
};
