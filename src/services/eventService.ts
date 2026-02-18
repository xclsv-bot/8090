/**
 * Event Service
 * WO-29: Event CRUD API and basic operations
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { publishEventUpdated } from '../utils/events.js';
import type { EventStatus } from '../types/models.js';
import type { 
  EventExtended, 
  EventSearchFilters, 
  CreateEventInput,
  UpdateEventStatusInput,
  canTransition 
} from '../types/event.js';

interface UpdateEventInput {
  title?: string;
  description?: string;
  eventType?: string;
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  region?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  venueContactName?: string;
  venueContactPhone?: string;
  venueContactEmail?: string;
  expectedAttendance?: number;
  budget?: number;
  minAmbassadors?: number;
  maxAmbassadors?: number;
  requiredSkillLevel?: string;
  notes?: string;
}

class EventService {
  /**
   * Create a new event
   */
  async create(input: CreateEventInput, createdBy?: string): Promise<EventExtended> {
    const result = await db.queryOne<EventExtended>(
      `INSERT INTO events (
        title, description, event_type, venue, address, city, state, region,
        event_date, start_time, end_time, timezone,
        venue_contact_name, venue_contact_phone, venue_contact_email,
        expected_attendance, budget, min_ambassadors, max_ambassadors,
        required_skill_level, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'planned')
      RETURNING *`,
      [
        input.title,
        input.description,
        input.eventType || 'activation',
        input.venue,
        input.address,
        input.city,
        input.state,
        input.region,
        input.eventDate,
        input.startTime,
        input.endTime,
        input.timezone || 'America/New_York',
        input.venueContactName,
        input.venueContactPhone,
        input.venueContactEmail,
        input.expectedAttendance,
        input.budget,
        input.minAmbassadors || 1,
        input.maxAmbassadors,
        input.requiredSkillLevel,
      ]
    );

    if (result) {
      // Log state history
      await this.logStateChange(result.id, null, 'planned', createdBy);
      
      // Add operators if provided
      if (input.operatorIds?.length) {
        await this.addOperators(result.id, input.operatorIds);
      }
    }

    logger.info({ eventId: result?.id, title: input.title }, 'Event created');
    return result!;
  }

  /**
   * Get event by ID
   */
  async getById(id: string): Promise<EventExtended | null> {
    return db.queryOne<EventExtended>(
      'SELECT * FROM events WHERE id = $1',
      [id]
    );
  }

  /**
   * Get event with related data
   */
  async getWithDetails(id: string): Promise<EventExtended & {
    operators?: { id: number; name: string; isPrimary: boolean }[];
    assignmentCount?: number;
    signupCount?: number;
  } | null> {
    const event = await this.getById(id);
    if (!event) return null;

    const [operators, assignmentCount, signupCount] = await Promise.all([
      db.queryMany<{ id: number; name: string; is_primary: boolean }>(
        `SELECT o.id, o.display_name as name, eo.is_primary 
         FROM event_operators eo
         JOIN operators o ON o.id = eo.operator_id
         WHERE eo.event_id = $1`,
        [id]
      ),
      db.queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM event_assignments WHERE event_id = $1',
        [id]
      ),
      db.queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM signups WHERE event_id = $1',
        [id]
      ),
    ]);

    return {
      ...event,
      operators: operators.map(o => ({ id: o.id, name: o.name, isPrimary: o.is_primary })),
      assignmentCount: parseInt(assignmentCount?.count || '0'),
      signupCount: parseInt(signupCount?.count || '0'),
    };
  }

  /**
   * Update event
   */
  async update(id: string, input: UpdateEventInput, updatedBy?: string): Promise<EventExtended | null> {
    const current = await this.getById(id);
    if (!current) return null;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      eventType: 'event_type',
      venue: 'venue',
      address: 'address',
      city: 'city',
      state: 'state',
      region: 'region',
      eventDate: 'event_date',
      startTime: 'start_time',
      endTime: 'end_time',
      timezone: 'timezone',
      venueContactName: 'venue_contact_name',
      venueContactPhone: 'venue_contact_phone',
      venueContactEmail: 'venue_contact_email',
      expectedAttendance: 'expected_attendance',
      budget: 'budget',
      minAmbassadors: 'min_ambassadors',
      maxAmbassadors: 'max_ambassadors',
      requiredSkillLevel: 'required_skill_level',
      notes: 'notes',
    };

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (input[key as keyof UpdateEventInput] !== undefined) {
        fields.push(`${dbField} = $${paramIndex++}`);
        values.push(input[key as keyof UpdateEventInput]);
      }
    }

    if (fields.length === 0) return current;

    values.push(id);
    const result = await db.queryOne<EventExtended>(
      `UPDATE events SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result) {
      await publishEventUpdated({
        eventId: id,
        title: result.title,
        status: result.status,
        userId: updatedBy,
      });
    }

    logger.info({ eventId: id }, 'Event updated');
    return result;
  }

  /**
   * Update event status with state machine validation
   */
  async updateStatus(
    id: string, 
    newStatus: EventStatus, 
    updatedBy?: string,
    reason?: string
  ): Promise<EventExtended | null> {
    const current = await this.getById(id);
    if (!current) return null;

    // Validate state transition
    const validTransitions: Record<EventStatus, EventStatus[]> = {
      planned: ['confirmed', 'cancelled'],
      confirmed: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[current.status]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${current.status} to ${newStatus}`);
    }

    const additionalFields: string[] = [];
    const additionalValues: unknown[] = [];

    if (newStatus === 'cancelled') {
      additionalFields.push('cancelled_at = NOW()', 'cancelled_reason = $3');
      additionalValues.push(reason);
    } else if (newStatus === 'completed') {
      additionalFields.push('completed_at = NOW()');
    }

    const setClause = [`status = $1`, ...additionalFields].join(', ');
    
    const result = await db.queryOne<EventExtended>(
      `UPDATE events SET ${setClause}, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newStatus, id, ...additionalValues]
    );

    if (result) {
      await this.logStateChange(id, current.status, newStatus, updatedBy, reason);
      
      await publishEventUpdated({
        eventId: id,
        title: result.title,
        status: newStatus,
        changes: { status: { old: current.status, new: newStatus } },
        userId: updatedBy,
      });
    }

    logger.info({ eventId: id, from: current.status, to: newStatus }, 'Event status updated');
    return result;
  }

  /**
   * Search events with filters
   */
  async search(filters: EventSearchFilters, page = 1, limit = 20): Promise<{
    items: EventExtended[];
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

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      values.push(filters.eventType);
    }

    if (filters.region) {
      conditions.push(`region = $${paramIndex++}`);
      values.push(filters.region);
    }

    if (filters.state) {
      conditions.push(`state = $${paramIndex++}`);
      values.push(filters.state);
    }

    if (filters.fromDate) {
      conditions.push(`event_date >= $${paramIndex++}`);
      values.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`event_date <= $${paramIndex++}`);
      values.push(filters.toDate);
    }

    if (filters.search) {
      conditions.push(`(title ILIKE $${paramIndex} OR venue ILIKE $${paramIndex} OR city ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.queryMany<EventExtended>(
        `SELECT * FROM events ${whereClause}
         ORDER BY event_date DESC, start_time ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM events ${whereClause}`,
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
   * Get upcoming events
   */
  async getUpcoming(limit = 10): Promise<EventExtended[]> {
    return db.queryMany<EventExtended>(
      `SELECT * FROM events 
       WHERE event_date >= CURRENT_DATE AND status IN ('planned', 'confirmed')
       ORDER BY event_date ASC, start_time ASC
       LIMIT $1`,
      [limit]
    );
  }

  /**
   * Add operators to event
   */
  async addOperators(eventId: string, operatorIds: number[]): Promise<void> {
    for (let i = 0; i < operatorIds.length; i++) {
      await db.query(
        `INSERT INTO event_operators (event_id, operator_id, is_primary)
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id, operator_id) DO NOTHING`,
        [eventId, operatorIds[i], i === 0]
      );
    }
  }

  /**
   * Log state change
   */
  private async logStateChange(
    eventId: string,
    fromStatus: EventStatus | null,
    toStatus: EventStatus,
    changedBy?: string,
    reason?: string
  ): Promise<void> {
    await db.query(
      `INSERT INTO event_state_history (event_id, from_status, to_status, changed_by, change_reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, fromStatus, toStatus, changedBy, reason]
    );
  }

  /**
   * Delete event (soft delete by cancelling)
   */
  async delete(id: string, deletedBy?: string, reason?: string): Promise<boolean> {
    try {
      await this.updateStatus(id, 'cancelled', deletedBy, reason || 'Deleted');
      return true;
    } catch {
      return false;
    }
  }
}

export const eventService = new EventService();
