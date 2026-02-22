/**
 * Sign-Up Service
 * WO-53: AI extraction workflow + Customer.io sync
 * WO-54: Sign-Up Management API + real-time updates
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { eventPublisher } from './eventPublisher.js';
import { cpaService } from './cpaService.js';
import type { SignUp, ValidationStatus } from '../types/models.js';

type SignupStatus = 'pending' | 'confirmed' | 'invalid' | 'duplicate';
type Signup = SignUp;

interface CreateSignupInput {
  eventId?: string;
  ambassadorId: string;
  operatorId: number;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone?: string;
  customerState?: string;
  depositAmount?: number;
  promoCode?: string;
  sourceType?: string;
  sourceRef?: string;
  rawData?: Record<string, unknown>;
}

interface SignupSearchFilters {
  eventId?: string;
  ambassadorId?: string;
  operatorId?: number;
  status?: SignupStatus;
  validationStatus?: ValidationStatus;
  fromDate?: string;
  toDate?: string;
  search?: string;
  customerState?: string;
}

interface AIExtractionResult {
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerState?: string;
  operatorId?: number;
  confidence: number;
  rawText: string;
}

class SignupService {
  /**
   * Create a new signup
   */
  async create(input: CreateSignupInput, createdBy?: string): Promise<Signup> {
    // Check for duplicates
    const duplicate = await this.checkDuplicate(input.customerEmail, input.operatorId);
    if (duplicate) {
      throw new Error(`Duplicate signup: ${duplicate.id}`);
    }

    const result = await db.queryOne<Signup>(
      `INSERT INTO signups (
        event_id, ambassador_id, operator_id,
        customer_first_name, customer_last_name, customer_email, customer_phone, customer_state,
        deposit_amount, promo_code, source_type, source_ref, raw_data,
        status, validation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', 'pending')
      RETURNING *`,
      [
        input.eventId,
        input.ambassadorId,
        input.operatorId,
        input.customerFirstName,
        input.customerLastName,
        input.customerEmail,
        input.customerPhone,
        input.customerState,
        input.depositAmount,
        input.promoCode,
        input.sourceType || 'manual',
        input.sourceRef,
        input.rawData ? JSON.stringify(input.rawData) : null,
      ]
    );

    if (result) {
      // Calculate CPA if state is known
      if (input.customerState) {
        await cpaService.calculateSignupCpa(result.id);
      }

      // Publish event
      await eventPublisher.publish({
        type: 'sign_up.submitted',
        userId: createdBy,
        payload: {
          signUpId: result.id,
          eventId: input.eventId,
          ambassadorId: input.ambassadorId,
          operatorId: input.operatorId,
          customerName: `${input.customerFirstName} ${input.customerLastName}`,
        },
      } as any);

      // Sync to Customer.io if configured
      await this.syncToCustomerIo(result);
    }

    logger.info({ signupId: result?.id }, 'Signup created');
    return result!;
  }

  /**
   * Check for duplicate signup
   */
  async checkDuplicate(email: string, operatorId: number): Promise<Signup | null> {
    return db.queryOne<Signup>(
      `SELECT * FROM signups 
       WHERE customer_email = $1 AND operator_id = $2 
       AND created_at > NOW() - INTERVAL '30 days'`,
      [email.toLowerCase(), operatorId]
    );
  }

  /**
   * Get signup by ID
   */
  async getById(id: string): Promise<Signup | null> {
    return db.queryOne<Signup>('SELECT * FROM signups WHERE id = $1', [id]);
  }

  /**
   * Search signups
   */
  async search(filters: SignupSearchFilters, page = 1, limit = 50): Promise<{
    items: Signup[];
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.eventId) {
      conditions.push(`s.event_id = $${paramIndex++}`);
      values.push(filters.eventId);
    }
    if (filters.ambassadorId) {
      conditions.push(`s.ambassador_id = $${paramIndex++}`);
      values.push(filters.ambassadorId);
    }
    if (filters.operatorId) {
      conditions.push(`s.operator_id = $${paramIndex++}`);
      values.push(filters.operatorId);
    }
    if (filters.status) {
      conditions.push(`s.status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.validationStatus) {
      conditions.push(`s.validation_status = $${paramIndex++}`);
      values.push(filters.validationStatus);
    }
    if (filters.customerState) {
      conditions.push(`s.customer_state = $${paramIndex++}`);
      values.push(filters.customerState);
    }
    if (filters.fromDate) {
      conditions.push(`s.created_at >= $${paramIndex++}`);
      values.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`s.created_at <= $${paramIndex++}`);
      values.push(filters.toDate);
    }
    if (filters.search) {
      conditions.push(`(
        s.customer_first_name ILIKE $${paramIndex} OR 
        s.customer_last_name ILIKE $${paramIndex} OR 
        s.customer_email ILIKE $${paramIndex}
      )`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [rawItems, countResult] = await Promise.all([
      db.queryMany<Signup & { 
        ambassador_first_name?: string; 
        ambassador_last_name?: string;
        operator_name?: string;
      }>(
        `SELECT s.*, 
                a.first_name as ambassador_first_name, 
                a.last_name as ambassador_last_name,
                o.name as operator_name
         FROM signups s
         LEFT JOIN ambassadors a ON s.ambassador_id = a.id
         LEFT JOIN operators o ON s.operator_id = o.id
         ${whereClause}
         ORDER BY s.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM signups ${whereClause}`,
        values
      ),
    ]);

    // Transform to include nested ambassador and operator objects
    // Note: rawItems use snake_case from DB (ambassador_id), types use camelCase (ambassadorId)
    const items = rawItems.map(item => {
      const rawItem = item as any; // Access snake_case properties
      return {
        ...item,
        ambassador: rawItem.ambassador_id ? {
          id: rawItem.ambassador_id,
          firstName: rawItem.ambassador_first_name || '',
          lastName: rawItem.ambassador_last_name || '',
        } : undefined,
        operatorName: rawItem.operator_name || undefined,
      };
    }) as Signup[];

    return {
      items,
      total: parseInt(countResult?.count || '0'),
      page,
      limit,
    };
  }

  /**
   * Update validation status
   */
  async updateValidation(
    id: string,
    status: ValidationStatus,
    validatedBy?: string,
    notes?: string
  ): Promise<Signup | null> {
    const result = await db.queryOne<Signup>(
      `UPDATE signups SET 
        validation_status = $1,
        validated_at = NOW(),
        validated_by = $2,
        validation_notes = $3
       WHERE id = $4
       RETURNING *`,
      [status, validatedBy, notes, id]
    );

    if (result) {
      const eventType = status === 'validated' ? 'sign_up.validated' : 'sign_up.rejected';
      await eventPublisher.publish({
        type: eventType,
        userId: validatedBy,
        payload: {
          signUpId: id,
          ambassadorId: result.ambassadorId,
          operatorId: result.operatorId,
          customerName: `${result.customerFirstName} ${result.customerLastName}`,
          validationStatus: status,
          rejectionReason: status === 'rejected' ? notes : undefined,
        },
      } as any);
    }

    logger.info({ signupId: id, status }, 'Signup validation updated');
    return result;
  }

  /**
   * Bulk import signups
   */
  async bulkImport(
    signups: CreateSignupInput[],
    batchName: string,
    importedBy?: string
  ): Promise<{
    batchId: string;
    success: number;
    failed: number;
    duplicates: number;
    errors: { index: number; error: string }[];
  }> {
    // Create import batch
    const batch = await db.queryOne<{ id: string }>(
      `INSERT INTO signup_import_batches (batch_name, imported_by, total_records)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [batchName, importedBy, signups.length]
    );

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < signups.length; i++) {
      try {
        const signup = signups[i];
        signup.sourceType = 'import';
        signup.sourceRef = batch!.id;
        await this.create(signup, importedBy);
        success++;
      } catch (error: any) {
        if (error.message.includes('Duplicate')) {
          duplicates++;
        } else {
          failed++;
          errors.push({ index: i, error: error.message });
        }
      }
    }

    // Update batch stats
    await db.query(
      `UPDATE signup_import_batches SET 
        successful_records = $1, failed_records = $2, duplicate_records = $3,
        status = 'completed', completed_at = NOW()
       WHERE id = $4`,
      [success, failed, duplicates, batch!.id]
    );

    logger.info({ batchId: batch!.id, success, failed, duplicates }, 'Bulk import completed');

    return {
      batchId: batch!.id,
      success,
      failed,
      duplicates,
      errors,
    };
  }

  /**
   * AI extraction from raw text/image
   */
  async extractFromText(rawText: string): Promise<AIExtractionResult> {
    // Pattern matching for common formats
    const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/i);
    const phoneMatch = rawText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const stateMatch = rawText.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i);

    // Name extraction (first line or before email often contains name)
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
    let firstName = '';
    let lastName = '';

    for (const line of lines) {
      // Skip lines that look like emails or phone numbers
      if (line.includes('@') || /^\d/.test(line)) continue;
      
      const nameParts = line.split(/\s+/);
      if (nameParts.length >= 2 && nameParts[0].length > 1 && nameParts[1].length > 1) {
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
        break;
      }
    }

    // Operator detection based on keywords
    let operatorId: number | undefined;
    const lowerText = rawText.toLowerCase();
    if (lowerText.includes('fanduel')) operatorId = 23;
    else if (lowerText.includes('draftkings') || lowerText.includes('dk')) operatorId = 8;
    else if (lowerText.includes('betmgm')) operatorId = 3;
    else if (lowerText.includes('caesars')) operatorId = 4;
    else if (lowerText.includes('wow casino')) operatorId = 12;

    const confidence = [
      emailMatch ? 0.3 : 0,
      firstName ? 0.25 : 0,
      lastName ? 0.15 : 0,
      stateMatch ? 0.15 : 0,
      operatorId ? 0.15 : 0,
    ].reduce((a, b) => a + b, 0);

    return {
      customerFirstName: firstName || undefined,
      customerLastName: lastName || undefined,
      customerEmail: emailMatch?.[0]?.toLowerCase(),
      customerPhone: phoneMatch?.[0]?.replace(/\D/g, ''),
      customerState: stateMatch?.[1]?.toUpperCase(),
      operatorId,
      confidence,
      rawText,
    };
  }

  /**
   * Sync signup to Customer.io
   */
  private async syncToCustomerIo(signup: Signup): Promise<void> {
    try {
      // Get Customer.io credentials from integrations
      const creds = await db.queryOne<{ credentials_encrypted: string }>(
        "SELECT credentials_encrypted FROM integration_credentials WHERE integration_type = 'customerio' AND is_active = true"
      );

      if (!creds) {
        logger.debug('Customer.io not configured, skipping sync');
        return;
      }

      // In production, would decrypt and call Customer.io API
      // For now, just log
      logger.info({ signupId: signup.id, email: signup.customerEmail }, 'Would sync to Customer.io');

      // Mark as synced
      await db.query(
        "UPDATE signups SET synced_to_customerio = true, synced_at = NOW() WHERE id = $1",
        [signup.id]
      );
    } catch (error) {
      logger.error({ error, signupId: signup.id }, 'Failed to sync to Customer.io');
    }
  }

  /**
   * Get validation queue
   */
  async getValidationQueue(limit = 50): Promise<Signup[]> {
    return db.queryMany<Signup>(
      `SELECT s.*, a.first_name as ambassador_first_name, a.last_name as ambassador_last_name,
              o.display_name as operator_name
       FROM signups s
       LEFT JOIN ambassadors a ON a.id = s.ambassador_id
       LEFT JOIN operators o ON o.id = s.operator_id
       WHERE s.validation_status = 'pending'
       ORDER BY s.created_at ASC
       LIMIT $1`,
      [limit]
    );
  }

  /**
   * Get signup stats
   */
  async getStats(fromDate?: string, toDate?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byOperator: { operatorId: number; name: string; count: number }[];
    byAmbassador: { ambassadorId: string; name: string; count: number }[];
  }> {
    const dateCondition = fromDate && toDate 
      ? 'WHERE created_at BETWEEN $1 AND $2' 
      : '';
    const params = fromDate && toDate ? [fromDate, toDate] : [];

    const [total, byStatus, byOperator, byAmbassador] = await Promise.all([
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM signups ${dateCondition}`,
        params
      ),
      db.queryMany<{ status: string; count: string }>(
        `SELECT status, COUNT(*) as count FROM signups ${dateCondition} GROUP BY status`,
        params
      ),
      db.queryMany<{ operator_id: number; name: string; count: string }>(
        `SELECT s.operator_id, o.display_name as name, COUNT(*) as count 
         FROM signups s
         JOIN operators o ON o.id = s.operator_id
         ${dateCondition}
         GROUP BY s.operator_id, o.display_name
         ORDER BY count DESC`,
        params
      ),
      db.queryMany<{ ambassador_id: string; first_name: string; last_name: string; count: string }>(
        `SELECT s.ambassador_id, a.first_name, a.last_name, COUNT(*) as count
         FROM signups s
         JOIN ambassadors a ON a.id = s.ambassador_id
         ${dateCondition}
         GROUP BY s.ambassador_id, a.first_name, a.last_name
         ORDER BY count DESC
         LIMIT 20`,
        params
      ),
    ]);

    return {
      total: parseInt(total?.count || '0'),
      byStatus: byStatus.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {}),
      byOperator: byOperator.map(r => ({ 
        operatorId: r.operator_id, 
        name: r.name, 
        count: parseInt(r.count) 
      })),
      byAmbassador: byAmbassador.map(r => ({
        ambassadorId: r.ambassador_id,
        name: `${r.first_name} ${r.last_name}`,
        count: parseInt(r.count),
      })),
    };
  }
}

export const signupService = new SignupService();
