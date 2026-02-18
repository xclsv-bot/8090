/**
 * Operator Service
 * WO-2, WO-46: Operator Management functionality
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
// Operator type defined locally since models may vary
interface Operator {
  id: number;
  displayName: string;
  legalName?: string;
  operatorType: string;
  logoUrl?: string;
  websiteUrl?: string;
  affiliatePortalUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OperatorStateAvailability {
  operatorId: number;
  stateCode: string;
  isLive: boolean;
  launchDate?: Date;
  restrictions?: string;
}

interface CreateOperatorInput {
  displayName: string;
  legalName?: string;
  operatorType: 'sportsbook' | 'casino' | 'dfs' | 'sweepstakes';
  logoUrl?: string;
  websiteUrl?: string;
  affiliatePortalUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

class OperatorService {
  /**
   * Create operator
   */
  async create(input: CreateOperatorInput): Promise<Operator> {
    const result = await db.queryOne<Operator>(
      `INSERT INTO operators (
        display_name, legal_name, operator_type, logo_url, website_url,
        affiliate_portal_url, contact_email, contact_phone, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.displayName,
        input.legalName,
        input.operatorType,
        input.logoUrl,
        input.websiteUrl,
        input.affiliatePortalUrl,
        input.contactEmail,
        input.contactPhone,
        input.notes,
      ]
    );

    logger.info({ operatorId: result?.id, name: input.displayName }, 'Operator created');
    return result!;
  }

  /**
   * Get operator by ID
   */
  async getById(id: number): Promise<Operator | null> {
    return db.queryOne<Operator>('SELECT * FROM operators WHERE id = $1', [id]);
  }

  /**
   * Get all operators
   */
  async getAll(activeOnly = true): Promise<Operator[]> {
    const condition = activeOnly ? 'WHERE is_active = true' : '';
    return db.queryMany<Operator>(
      `SELECT * FROM operators ${condition} ORDER BY sort_order, display_name`
    );
  }

  /**
   * Update operator
   */
  async update(id: number, updates: Partial<CreateOperatorInput>): Promise<Operator | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      displayName: 'display_name',
      legalName: 'legal_name',
      operatorType: 'operator_type',
      logoUrl: 'logo_url',
      websiteUrl: 'website_url',
      affiliatePortalUrl: 'affiliate_portal_url',
      contactEmail: 'contact_email',
      contactPhone: 'contact_phone',
      notes: 'notes',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key as keyof CreateOperatorInput] !== undefined) {
        fields.push(`${dbField} = $${paramIndex++}`);
        values.push(updates[key as keyof CreateOperatorInput]);
      }
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    return db.queryOne<Operator>(
      `UPDATE operators SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }

  /**
   * Set state availability
   */
  async setStateAvailability(
    operatorId: number,
    stateCode: string,
    isLive: boolean,
    launchDate?: string,
    restrictions?: string
  ): Promise<void> {
    await db.query(
      `INSERT INTO operator_state_availability (operator_id, state_code, is_live, launch_date, restrictions)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (operator_id, state_code) 
       DO UPDATE SET is_live = $3, launch_date = $4, restrictions = $5, updated_at = NOW()`,
      [operatorId, stateCode, isLive, launchDate, restrictions]
    );

    logger.info({ operatorId, stateCode, isLive }, 'State availability updated');
  }

  /**
   * Get state availability for operator
   */
  async getStateAvailability(operatorId: number): Promise<OperatorStateAvailability[]> {
    return db.queryMany<OperatorStateAvailability>(
      `SELECT operator_id, state_code, is_live, launch_date, restrictions
       FROM operator_state_availability
       WHERE operator_id = $1
       ORDER BY state_code`,
      [operatorId]
    );
  }

  /**
   * Get operators available in state
   */
  async getByState(stateCode: string, operatorType?: string): Promise<(Operator & { launchDate?: Date })[]> {
    const typeCondition = operatorType ? 'AND o.operator_type = $2' : '';
    const params = operatorType ? [stateCode, operatorType] : [stateCode];

    return db.queryMany(
      `SELECT o.*, osa.launch_date
       FROM operators o
       JOIN operator_state_availability osa ON osa.operator_id = o.id
       WHERE osa.state_code = $1 AND osa.is_live = true AND o.is_active = true
       ${typeCondition}
       ORDER BY o.sort_order, o.display_name`,
      params
    );
  }

  /**
   * Bulk update state availability
   */
  async bulkSetStateAvailability(
    operatorId: number,
    states: { stateCode: string; isLive: boolean; launchDate?: string }[]
  ): Promise<void> {
    for (const state of states) {
      await this.setStateAvailability(operatorId, state.stateCode, state.isLive, state.launchDate);
    }

    logger.info({ operatorId, statesUpdated: states.length }, 'Bulk state availability updated');
  }

  /**
   * Get operator stats
   */
  async getStats(operatorId: number, fromDate?: string, toDate?: string): Promise<{
    totalSignups: number;
    validatedSignups: number;
    statesActive: number;
    totalRevenue: number;
  }> {
    const dateCondition = fromDate && toDate 
      ? 'AND created_at BETWEEN $2 AND $3' 
      : '';
    const params = fromDate && toDate 
      ? [operatorId, fromDate, toDate] 
      : [operatorId];

    const [signups, states, revenue] = await Promise.all([
      db.queryOne<{ total: string; validated: string }>(
        `SELECT COUNT(*) as total, 
                COUNT(*) FILTER (WHERE validation_status = 'validated') as validated
         FROM signups WHERE operator_id = $1 ${dateCondition}`,
        params
      ),
      db.queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM operator_state_availability WHERE operator_id = $1 AND is_live = true',
        [operatorId]
      ),
      db.queryOne<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0) as sum FROM revenue_tracking 
         WHERE operator_id = $1 ${dateCondition.replace('created_at', 'revenue_date')}`,
        params
      ),
    ]);

    return {
      totalSignups: parseInt(signups?.total || '0'),
      validatedSignups: parseInt(signups?.validated || '0'),
      statesActive: parseInt(states?.count || '0'),
      totalRevenue: parseFloat(revenue?.sum || '0'),
    };
  }

  /**
   * Get all states with operator availability summary
   */
  async getStatesSummary(): Promise<{
    stateCode: string;
    operatorCount: number;
    sportsbookCount: number;
    casinoCount: number;
  }[]> {
    return db.queryMany(
      `SELECT 
        osa.state_code,
        COUNT(DISTINCT osa.operator_id) as operator_count,
        COUNT(DISTINCT osa.operator_id) FILTER (WHERE o.operator_type = 'sportsbook') as sportsbook_count,
        COUNT(DISTINCT osa.operator_id) FILTER (WHERE o.operator_type = 'casino') as casino_count
       FROM operator_state_availability osa
       JOIN operators o ON o.id = osa.operator_id
       WHERE osa.is_live = true AND o.is_active = true
       GROUP BY osa.state_code
       ORDER BY osa.state_code`
    );
  }

  /**
   * Update sort order
   */
  async updateSortOrder(operatorId: number, sortOrder: number): Promise<void> {
    await db.query(
      'UPDATE operators SET sort_order = $1, updated_at = NOW() WHERE id = $2',
      [sortOrder, operatorId]
    );
  }

  /**
   * Toggle active status
   */
  async setActive(operatorId: number, isActive: boolean): Promise<Operator | null> {
    return db.queryOne<Operator>(
      'UPDATE operators SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [isActive, operatorId]
    );
  }
}

export const operatorService = new OperatorService();
