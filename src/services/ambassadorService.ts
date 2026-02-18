/**
 * Ambassador Service
 * WO-10: Ambassador CRUD API and profile management
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type { Ambassador, AmbassadorSkillLevel, AmbassadorStatus } from '../types/models.js';
import type { 
  AmbassadorSearchFilters, 
  CreateAuditLogInput,
  AmbassadorPerformanceHistory 
} from '../types/ambassador.js';

interface CreateAmbassadorInput {
  clerkUserId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  skillLevel?: AmbassadorSkillLevel;
  compensationType?: 'per_signup' | 'hourly' | 'hybrid';
  hourlyRate?: number;
  perSignupRate?: number;
  notes?: string;
}

interface UpdateAmbassadorInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  skillLevel?: AmbassadorSkillLevel;
  compensationType?: 'per_signup' | 'hourly' | 'hybrid';
  hourlyRate?: number;
  perSignupRate?: number;
  status?: AmbassadorStatus;
  notes?: string;
}

class AmbassadorService {
  /**
   * Create a new ambassador
   */
  async create(input: CreateAmbassadorInput, createdBy?: string): Promise<Ambassador> {
    const result = await db.queryOne<Ambassador>(
      `INSERT INTO ambassadors (
        clerk_user_id, first_name, last_name, email, phone,
        skill_level, compensation_type, hourly_rate, per_signup_rate, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        input.clerkUserId,
        input.firstName,
        input.lastName,
        input.email,
        input.phone,
        input.skillLevel || 'trainee',
        input.compensationType || 'per_signup',
        input.hourlyRate,
        input.perSignupRate,
        input.notes,
      ]
    );

    if (result) {
      await this.logAudit({
        ambassadorId: result.id,
        action: 'create',
        changedBy: createdBy,
      });
    }

    logger.info({ ambassadorId: result?.id, email: input.email }, 'Ambassador created');
    return result!;
  }

  /**
   * Get ambassador by ID
   */
  async getById(id: string): Promise<Ambassador | null> {
    return db.queryOne<Ambassador>(
      'SELECT * FROM ambassadors WHERE id = $1',
      [id]
    );
  }

  /**
   * Get ambassador by email
   */
  async getByEmail(email: string): Promise<Ambassador | null> {
    return db.queryOne<Ambassador>(
      'SELECT * FROM ambassadors WHERE email = $1',
      [email]
    );
  }

  /**
   * Get ambassador by Clerk user ID
   */
  async getByClerkId(clerkUserId: string): Promise<Ambassador | null> {
    return db.queryOne<Ambassador>(
      'SELECT * FROM ambassadors WHERE clerk_user_id = $1',
      [clerkUserId]
    );
  }

  /**
   * Update ambassador
   */
  async update(
    id: string, 
    input: UpdateAmbassadorInput, 
    updatedBy?: string
  ): Promise<Ambassador | null> {
    // Get current state for audit
    const current = await this.getById(id);
    if (!current) return null;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      skillLevel: 'skill_level',
      compensationType: 'compensation_type',
      hourlyRate: 'hourly_rate',
      perSignupRate: 'per_signup_rate',
      status: 'status',
      notes: 'notes',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (input[key as keyof UpdateAmbassadorInput] !== undefined) {
        fields.push(`${dbField} = $${paramIndex}`);
        values.push(input[key as keyof UpdateAmbassadorInput]);
        
        // Log audit for each changed field
        const oldValue = current[key as keyof Ambassador];
        const newValue = input[key as keyof UpdateAmbassadorInput];
        if (oldValue !== newValue) {
          await this.logAudit({
            ambassadorId: id,
            action: 'update',
            fieldName: key,
            oldValue: String(oldValue),
            newValue: String(newValue),
            changedBy: updatedBy,
          });
        }
        
        paramIndex++;
      }
    }

    if (fields.length === 0) return current;

    values.push(id);
    const result = await db.queryOne<Ambassador>(
      `UPDATE ambassadors SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    logger.info({ ambassadorId: id }, 'Ambassador updated');
    return result;
  }

  /**
   * Update ambassador status
   */
  async updateStatus(
    id: string, 
    status: AmbassadorStatus, 
    updatedBy?: string,
    reason?: string
  ): Promise<Ambassador | null> {
    const current = await this.getById(id);
    if (!current) return null;

    const result = await db.queryOne<Ambassador>(
      'UPDATE ambassadors SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    await this.logAudit({
      ambassadorId: id,
      action: 'status_change',
      fieldName: 'status',
      oldValue: current.status,
      newValue: status,
      changedBy: updatedBy,
      changeReason: reason,
    });

    logger.info({ ambassadorId: id, status }, 'Ambassador status updated');
    return result;
  }

  /**
   * Search ambassadors with filters
   */
  async search(filters: AmbassadorSearchFilters, page = 1, limit = 20): Promise<{
    items: Ambassador[];
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.skillLevel) {
      conditions.push(`skill_level = $${paramIndex++}`);
      values.push(filters.skillLevel);
    }

    if (filters.search) {
      conditions.push(`(
        first_name ILIKE $${paramIndex} OR 
        last_name ILIKE $${paramIndex} OR 
        email ILIKE $${paramIndex}
      )`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.minPerformanceScore !== undefined) {
      conditions.push(`id IN (
        SELECT ambassador_id FROM ambassador_performance_history 
        WHERE performance_score >= $${paramIndex}
        ORDER BY calculated_at DESC LIMIT 1
      )`);
      values.push(filters.minPerformanceScore);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.queryMany<Ambassador>(
        `SELECT * FROM ambassadors ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM ambassadors ${whereClause}`,
        values
      ),
    ]);

    return {
      items,
      total: parseInt(countResult?.count || '0'),
      page,
      limit,
    };
  }

  /**
   * Get ambassador with performance stats
   */
  async getWithStats(id: string): Promise<Ambassador & { 
    stats?: AmbassadorPerformanceHistory 
  } | null> {
    const ambassador = await this.getById(id);
    if (!ambassador) return null;

    const stats = await db.queryOne<AmbassadorPerformanceHistory>(
      `SELECT * FROM ambassador_performance_history 
       WHERE ambassador_id = $1 
       ORDER BY calculated_at DESC LIMIT 1`,
      [id]
    );

    return { ...ambassador, stats: stats || undefined };
  }

  /**
   * Delete ambassador (soft delete by setting status)
   */
  async delete(id: string, deletedBy?: string): Promise<boolean> {
    const result = await db.query(
      'UPDATE ambassadors SET status = $1, updated_at = NOW() WHERE id = $2',
      ['inactive', id]
    );

    if (result.rowCount && result.rowCount > 0) {
      await this.logAudit({
        ambassadorId: id,
        action: 'delete',
        changedBy: deletedBy,
      });
      logger.info({ ambassadorId: id }, 'Ambassador deleted (soft)');
      return true;
    }

    return false;
  }

  /**
   * Log audit entry
   */
  private async logAudit(input: CreateAuditLogInput & { changedBy?: string }): Promise<void> {
    try {
      await db.query(
        `INSERT INTO ambassador_audit_log (
          ambassador_id, action, field_name, old_value, new_value, 
          changed_by, change_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.ambassadorId,
          input.action,
          input.fieldName,
          input.oldValue,
          input.newValue,
          input.changedBy,
          input.changeReason,
        ]
      );
    } catch (error) {
      logger.error({ error, input }, 'Failed to log audit entry');
    }
  }

  /**
   * Get all active ambassadors (for dropdowns, etc.)
   */
  async getAllActive(): Promise<Ambassador[]> {
    return db.queryMany<Ambassador>(
      "SELECT * FROM ambassadors WHERE status = 'active' ORDER BY first_name, last_name"
    );
  }

  /**
   * Count ambassadors by status
   */
  async countByStatus(): Promise<Record<string, number>> {
    const results = await db.queryMany<{ status: string; count: string }>(
      'SELECT status, COUNT(*) as count FROM ambassadors GROUP BY status'
    );
    
    return results.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);
  }
}

export const ambassadorService = new AmbassadorService();
