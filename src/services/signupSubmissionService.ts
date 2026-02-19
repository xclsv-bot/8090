/**
 * Sign-Up Submission Service
 * WO-67: Sign-up submission API and duplicate detection system
 * 
 * Handles:
 * - Event and solo chat sign-up submissions
 * - Idempotency key validation and deduplication
 * - Duplicate detection (email + operator + UTC date)
 * - CPA rate locking at submission time
 * - S3 image uploads for bet slips
 * - Audit log creation
 * - WebSocket event publishing
 */

import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { db } from './database.js';
import { storage } from './storage.js';
import { cpaService } from './cpaService.js';
import { eventPublisher } from './eventPublisher.js';
import { extractionJobService } from './extractionJobService.js';
import { customerioSyncJobService } from './customerioSyncJobService.js';
import { logger } from '../utils/logger.js';
import type {
  SignUpManaged,
  SignUpSourceType,
  SignUpResponse,
  SignUpAuditAction,
  SubmitSignUpErrorResponse,
  CreateAuditLogInput,
  SignUpIdempotencyKey,
} from '../types/signup.js';

// ============================================
// TYPES
// ============================================

export interface EventSignUpSubmission {
  eventId: string;
  operatorId: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerState?: string;
  idempotencyKey: string;
  betSlipPhoto?: string | Buffer; // Base64 string or Buffer
  betSlipContentType?: string;
}

export interface SoloSignUpSubmission extends Omit<EventSignUpSubmission, 'eventId'> {
  soloChatId: string;
}

export interface SubmissionContext {
  ambassadorId: string;
  ipAddress?: string;
  deviceType?: string;
  latitude?: number;
  longitude?: number;
}

export interface SubmissionResult {
  success: true;
  signup: SignUpResponse;
  isIdempotentReturn: boolean;
}

export interface SubmissionError {
  success: false;
  error: SubmitSignUpErrorResponse;
}

export type SubmissionOutcome = SubmissionResult | SubmissionError;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse customer name into first and last name
 */
function parseCustomerName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Get UTC date string (YYYY-MM-DD) for duplicate checking
 */
function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Transform raw database row (snake_case) to SignUpManaged (camelCase)
 */
function toSignUpManaged(row: Record<string, unknown>): SignUpManaged {
  return {
    id: row.id as string,
    eventId: row.event_id as string | undefined,
    soloChatId: row.solo_chat_id as string | undefined,
    ambassadorId: row.ambassador_id as string,
    payPeriodId: row.pay_period_id as string | undefined,
    customerFirstName: row.customer_first_name as string,
    customerLastName: row.customer_last_name as string,
    customerEmail: row.customer_email as string | undefined,
    customerPhone: row.customer_phone as string | undefined,
    customerAddress: row.customer_address as string | undefined,
    customerCity: row.customer_city as string | undefined,
    customerState: row.customer_state as string | undefined,
    customerZip: row.customer_zip as string | undefined,
    customerDob: row.customer_dob as Date | undefined,
    operatorId: row.operator_id as number,
    operatorName: row.operator_name as string | undefined,
    validationStatus: row.validation_status as any,
    submittedAt: row.submitted_at as Date,
    validatedAt: row.validated_at as Date | undefined,
    rejectionReason: row.rejection_reason as string | undefined,
    betSlipImageKey: row.bet_slip_image_key as string | undefined,
    promoCodeUsed: row.promo_code_used as string | undefined,
    deviceType: row.device_type as string | undefined,
    ipAddress: row.ip_address as string | undefined,
    latitude: row.latitude as number | undefined,
    longitude: row.longitude as number | undefined,
    source: (row.source as string) || 'app',
    externalId: row.external_id as string | undefined,
    isDuplicate: (row.is_duplicate as boolean) || false,
    duplicateOfId: row.duplicate_of_id as string | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as Date,
    sourceType: row.source_type as any,
    idempotencyKey: row.idempotency_key as string | undefined,
    extractionStatus: (row.extraction_status as any) || 'pending',
    extractionConfidence: row.extraction_confidence as number | undefined,
    betAmount: row.bet_amount as number | undefined,
    teamBetOn: row.team_bet_on as string | undefined,
    odds: row.odds as string | undefined,
    extractionReviewedBy: row.extraction_reviewed_by as string | undefined,
    extractionReviewedAt: row.extraction_reviewed_at as Date | undefined,
    customerioSynced: (row.customerio_synced as boolean) || false,
    customerioSyncedAt: row.customerio_synced_at as Date | undefined,
    customerioContactId: row.customerio_contact_id as string | undefined,
    customerioSyncFailed: (row.customerio_sync_failed as boolean) || false,
    customerioSyncError: row.customerio_sync_error as string | undefined,
    imageUrl: row.image_url as string | undefined,
    cpaApplied: row.cpa_applied as number | undefined,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Convert SignUpManaged to SignUpResponse for API response
 */
function toSignUpResponse(signup: SignUpManaged): SignUpResponse {
  return {
    id: signup.id,
    eventId: signup.eventId,
    ambassadorId: signup.ambassadorId,
    operatorId: String(signup.operatorId),
    customerName: `${signup.customerFirstName} ${signup.customerLastName}`.trim(),
    customerEmail: signup.customerEmail || '',
    sourceType: signup.sourceType,
    status: signup.validationStatus,
    cpaApplied: signup.cpaApplied || 0,
    extractionStatus: signup.extractionStatus,
    extractionConfidence: signup.extractionConfidence,
    betAmount: signup.betAmount,
    teamBetOn: signup.teamBetOn,
    odds: signup.odds,
    imageUrl: signup.imageUrl || '',
    customerioSynced: signup.customerioSynced,
    createdAt: signup.createdAt.toISOString(),
    updatedAt: signup.updatedAt.toISOString(),
  };
}

// ============================================
// SIGN-UP SUBMISSION SERVICE
// ============================================

class SignUpSubmissionService {
  private readonly IDEMPOTENCY_TTL_HOURS = 24;
  private readonly BET_SLIP_FOLDER = 'bet-slips';

  /**
   * Submit a sign-up through event chat
   */
  async submitEventSignUp(
    submission: EventSignUpSubmission,
    context: SubmissionContext
  ): Promise<SubmissionOutcome> {
    return this.processSubmission(submission, context, 'event');
  }

  /**
   * Submit a sign-up through solo chat
   */
  async submitSoloSignUp(
    submission: SoloSignUpSubmission,
    context: SubmissionContext
  ): Promise<SubmissionOutcome> {
    return this.processSubmission(submission, context, 'solo');
  }

  /**
   * Core submission processing logic
   */
  private async processSubmission(
    submission: EventSignUpSubmission | SoloSignUpSubmission,
    context: SubmissionContext,
    sourceType: SignUpSourceType
  ): Promise<SubmissionOutcome> {
    const { idempotencyKey, operatorId, customerEmail, customerName } = submission;

    // Validate idempotency key format (UUID v4)
    if (!this.isValidUuidV4(idempotencyKey)) {
      return {
        success: false,
        error: {
          error: 'Invalid idempotency key format',
          errorCode: 'validation_error',
          details: { idempotencyKey: 'Must be a valid UUID v4' },
        },
      };
    }

    // Check for idempotent request (existing idempotency key)
    const existingIdempotency = await this.checkIdempotencyKey(idempotencyKey);
    if (existingIdempotency) {
      const existingSignup = await this.getSignupById(existingIdempotency.signupId);
      if (existingSignup) {
        logger.info(
          { idempotencyKey, signupId: existingSignup.id },
          'Idempotent request - returning existing signup'
        );
        await this.createAuditLog({
          signupId: existingSignup.id,
          action: 'submitted',
          userId: context.ambassadorId,
          details: { idempotentReturn: true, idempotencyKey },
        });
        return {
          success: true,
          signup: toSignUpResponse(existingSignup),
          isIdempotentReturn: true,
        };
      }
    }

    // Check for duplicate (same email + operator + UTC date)
    const duplicateCheck = await this.checkDuplicate(
      customerEmail.toLowerCase(),
      operatorId
    );
    if (duplicateCheck) {
      logger.warn(
        { email: customerEmail, operatorId, duplicateId: duplicateCheck.id },
        'Duplicate sign-up detected'
      );
      await this.createAuditLog({
        signupId: duplicateCheck.id,
        action: 'duplicate_detected',
        userId: context.ambassadorId,
        details: {
          attemptedEmail: customerEmail,
          attemptedOperatorId: operatorId,
          idempotencyKey,
        },
      });
      return {
        success: false,
        error: {
          error: 'A sign-up for this customer and operator already exists today',
          errorCode: 'duplicate_detected',
          details: { existingSignupId: duplicateCheck.id },
        },
      };
    }

    // Look up CPA rate
    const { firstName, lastName } = parseCustomerName(customerName);
    const customerState = submission.customerState;
    let cpaApplied: number | null = null;

    if (customerState) {
      const cpaRate = await cpaService.getRate(operatorId, customerState);
      if (cpaRate && cpaRate.cpaAmount) {
        cpaApplied = cpaRate.cpaAmount;
      } else {
        // CPA lookup failed - we allow submission but log warning
        logger.warn(
          { operatorId, customerState },
          'No CPA rate found for operator/state combination'
        );
      }
    }

    // Upload bet slip image if provided
    let imageUrl: string | undefined;
    if (submission.betSlipPhoto) {
      try {
        imageUrl = await this.uploadBetSlipImage(
          submission.betSlipPhoto,
          submission.betSlipContentType
        );
      } catch (error) {
        logger.error({ error }, 'Failed to upload bet slip image');
        return {
          success: false,
          error: {
            error: 'Failed to upload bet slip image',
            errorCode: 'image_upload_failed',
            details: { message: (error as Error).message },
          },
        };
      }
    }

    // Create the sign-up record in a transaction
    try {
      const signup = await db.transaction(async (client) => {
        // Create sign-up
        const signupResult = await this.createSignupRecord(
          client,
          {
            eventId: sourceType === 'event' ? (submission as EventSignUpSubmission).eventId : undefined,
            soloChatId: sourceType === 'solo' ? (submission as SoloSignUpSubmission).soloChatId : undefined,
            ambassadorId: context.ambassadorId,
            customerFirstName: firstName,
            customerLastName: lastName,
            customerEmail: customerEmail.toLowerCase(),
            customerPhone: submission.customerPhone,
            customerState,
            operatorId,
            sourceType,
            imageUrl,
            cpaApplied,
            ipAddress: context.ipAddress,
            deviceType: context.deviceType,
            latitude: context.latitude,
            longitude: context.longitude,
            idempotencyKey,
          }
        );

        // Create idempotency key record
        await this.createIdempotencyKeyRecord(client, idempotencyKey, signupResult.id);

        // Create audit log
        await this.createAuditLogRecord(client, {
          signupId: signupResult.id,
          action: 'submitted',
          userId: context.ambassadorId,
          details: {
            sourceType,
            operatorId,
            cpaApplied,
            hasImage: !!imageUrl,
          },
        });

        return signupResult;
      });

      // Publish WebSocket event (outside transaction)
      await this.publishSignUpSubmittedEvent(signup, sourceType);

      // Create extraction job if image was uploaded (WO-68)
      if (imageUrl) {
        try {
          await extractionJobService.createJob(signup.id);
          logger.info({ signupId: signup.id }, 'Extraction job created for sign-up');
        } catch (extractionError) {
          // Don't fail the signup if extraction job creation fails
          logger.error(
            { error: extractionError, signupId: signup.id },
            'Failed to create extraction job - will retry later'
          );
        }
      }

      // WO-69: Create initial Customer.io sync job (Phase 1)
      try {
        await customerioSyncJobService.createInitialSyncJob(signup.id);
        logger.info({ signupId: signup.id }, 'Initial Customer.io sync job created');
      } catch (syncError) {
        // Don't fail the signup if sync job creation fails
        logger.error(
          { error: syncError, signupId: signup.id },
          'Failed to create initial Customer.io sync job - will retry later'
        );
      }

      logger.info(
        {
          signupId: signup.id,
          sourceType,
          operatorId,
          cpaApplied,
          ambassadorId: context.ambassadorId,
          hasExtractionJob: !!imageUrl,
        },
        'Sign-up submitted successfully'
      );

      return {
        success: true,
        signup: toSignUpResponse(signup),
        isIdempotentReturn: false,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create sign-up');
      throw error;
    }
  }

  /**
   * Validate UUID v4 format
   */
  private isValidUuidV4(uuid: string): boolean {
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Regex.test(uuid);
  }

  /**
   * Check if idempotency key exists and is not expired
   */
  private async checkIdempotencyKey(key: string): Promise<SignUpIdempotencyKey | null> {
    return db.queryOne<SignUpIdempotencyKey>(
      `SELECT * FROM signup_idempotency_keys 
       WHERE idempotency_key = $1 
       AND expires_at > NOW()`,
      [key]
    );
  }

  /**
   * Check for duplicate sign-up (same email + operator + UTC date)
   * Only considers non-rejected sign-ups
   */
  private async checkDuplicate(
    email: string,
    operatorId: number
  ): Promise<{ id: string } | null> {
    const utcDate = getUtcDateString();
    
    return db.queryOne<{ id: string }>(
      `SELECT id FROM signups
       WHERE customer_email = $1
       AND operator_id = $2
       AND DATE(submitted_at AT TIME ZONE 'UTC') = $3
       AND validation_status != 'rejected'
       LIMIT 1`,
      [email.toLowerCase(), operatorId, utcDate]
    );
  }

  /**
   * Get sign-up by ID
   */
  private async getSignupById(id: string): Promise<SignUpManaged | null> {
    const result = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM signups WHERE id = $1',
      [id]
    );
    return result ? toSignUpManaged(result) : null;
  }

  /**
   * Upload bet slip image to S3
   */
  private async uploadBetSlipImage(
    photo: string | Buffer,
    contentType?: string
  ): Promise<string> {
    let buffer: Buffer;
    let mimeType = contentType || 'image/jpeg';

    if (typeof photo === 'string') {
      // Handle base64 string
      const matches = photo.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        // Assume plain base64
        buffer = Buffer.from(photo, 'base64');
      }
    } else {
      buffer = photo;
    }

    // Generate unique key
    const extension = mimeType.split('/')[1] || 'jpg';
    const key = storage.generateKey(this.BET_SLIP_FOLDER, `betslip.${extension}`);

    // Upload to S3
    const result = await storage.upload(key, buffer, mimeType, {
      'x-amz-meta-type': 'bet-slip',
    });

    return result.url;
  }

  /**
   * Create sign-up record in database
   */
  private async createSignupRecord(
    client: PoolClient,
    data: {
      eventId?: string;
      soloChatId?: string;
      ambassadorId: string;
      customerFirstName: string;
      customerLastName: string;
      customerEmail: string;
      customerPhone?: string;
      customerState?: string;
      operatorId: number;
      sourceType: SignUpSourceType;
      imageUrl?: string;
      cpaApplied: number | null;
      ipAddress?: string;
      deviceType?: string;
      latitude?: number;
      longitude?: number;
      idempotencyKey: string;
    }
  ): Promise<SignUpManaged> {
    const id = randomUUID();
    const now = new Date();

    const result = await client.query(
      `INSERT INTO signups (
        id, event_id, solo_chat_id, ambassador_id,
        customer_first_name, customer_last_name, customer_email, customer_phone, customer_state,
        operator_id, source_type, image_url, cpa_applied,
        ip_address, device_type, latitude, longitude,
        idempotency_key, validation_status, extraction_status,
        customerio_synced, customerio_sync_failed,
        created_at, updated_at, submitted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        'pending', 'pending', false, false, $19, $19, $19
      )
      RETURNING *`,
      [
        id,
        data.eventId || null,
        data.soloChatId || null,
        data.ambassadorId,
        data.customerFirstName,
        data.customerLastName,
        data.customerEmail,
        data.customerPhone || null,
        data.customerState || null,
        data.operatorId,
        data.sourceType,
        data.imageUrl || null,
        data.cpaApplied,
        data.ipAddress || null,
        data.deviceType || null,
        data.latitude || null,
        data.longitude || null,
        data.idempotencyKey,
        now,
      ]
    );

    return toSignUpManaged(result.rows[0]);
  }

  /**
   * Create idempotency key record
   */
  private async createIdempotencyKeyRecord(
    client: PoolClient,
    idempotencyKey: string,
    signupId: string
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.IDEMPOTENCY_TTL_HOURS);

    await client.query(
      `INSERT INTO signup_idempotency_keys (id, idempotency_key, signup_id, created_at, expires_at)
       VALUES ($1, $2, $3, NOW(), $4)`,
      [randomUUID(), idempotencyKey, signupId, expiresAt]
    );
  }

  /**
   * Create audit log entry
   */
  async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    try {
      await db.query(
        `INSERT INTO signup_audit_log (id, signup_id, action, user_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          randomUUID(),
          input.signupId,
          input.action,
          input.userId || null,
          input.details ? JSON.stringify(input.details) : null,
        ]
      );
    } catch (error) {
      logger.error({ error, input }, 'Failed to create audit log');
    }
  }

  /**
   * Create audit log entry (transaction version)
   */
  private async createAuditLogRecord(
    client: PoolClient,
    input: CreateAuditLogInput
  ): Promise<void> {
    await client.query(
      `INSERT INTO signup_audit_log (id, signup_id, action, user_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        randomUUID(),
        input.signupId,
        input.action,
        input.userId || null,
        input.details ? JSON.stringify(input.details) : null,
      ]
    );
  }

  /**
   * Publish WebSocket event for sign-up submission
   */
  private async publishSignUpSubmittedEvent(
    signup: SignUpManaged,
    sourceType: SignUpSourceType
  ): Promise<void> {
    try {
      // Use the SignUpEvent format from events.ts
      await eventPublisher.publish({
        type: 'sign_up.submitted',
        userId: signup.ambassadorId,
        metadata: {
          signup: toSignUpResponse(signup),
          eventId: signup.eventId,
          soloChatId: signup.soloChatId,
          sourceType,
        },
      });
    } catch (error) {
      logger.error({ error, signupId: signup.id }, 'Failed to publish sign-up event');
    }
  }

  /**
   * Cleanup expired idempotency keys
   * Should be called periodically (e.g., via cron)
   */
  async cleanupExpiredIdempotencyKeys(): Promise<number> {
    const result = await db.query(
      'DELETE FROM signup_idempotency_keys WHERE expires_at < NOW()'
    );
    const deleted = result.rowCount || 0;
    
    if (deleted > 0) {
      logger.info({ deleted }, 'Cleaned up expired idempotency keys');
    }
    
    return deleted;
  }

  /**
   * Get audit log for a sign-up
   */
  async getAuditLog(signupId: string): Promise<{
    action: SignUpAuditAction;
    user?: string;
    details?: Record<string, unknown>;
    timestamp: string;
  }[]> {
    const logs = await db.queryMany<{
      action: SignUpAuditAction;
      user_id: string | null;
      details: Record<string, unknown> | null;
      created_at: Date;
    }>(
      `SELECT action, user_id, details, created_at
       FROM signup_audit_log
       WHERE signup_id = $1
       ORDER BY created_at DESC`,
      [signupId]
    );

    return logs.map((log) => ({
      action: log.action,
      user: log.user_id || undefined,
      details: log.details || undefined,
      timestamp: log.created_at.toISOString(),
    }));
  }
}

// Export singleton instance
export const signupSubmissionService = new SignUpSubmissionService();
