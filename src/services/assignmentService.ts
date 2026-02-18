/**
 * Assignment Service
 * WO-30: Ambassador assignment and conflict management
 * WO-31: Auto-assignment algorithm
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type { EventAssignmentExtended, AssignmentStatus } from '../types/event.js';

interface CreateAssignmentInput {
  eventId: string;
  ambassadorId: string;
  role?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  payRate?: number;
}

interface AssignmentConflict {
  ambassadorId: string;
  eventId: string;
  conflictingEventId: string;
  conflictType: string;
}

class AssignmentService {
  /**
   * Create assignment with conflict check
   */
  async create(input: CreateAssignmentInput, createdBy?: string): Promise<EventAssignmentExtended> {
    // Check for conflicts
    const conflicts = await this.checkConflicts(input.ambassadorId, input.eventId);
    if (conflicts.length > 0) {
      throw new Error(`Assignment conflict: ${conflicts[0].conflictType}`);
    }

    const result = await db.queryOne<EventAssignmentExtended>(
      `INSERT INTO event_assignments (
        event_id, ambassador_id, role, scheduled_start, scheduled_end, pay_rate, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *`,
      [
        input.eventId,
        input.ambassadorId,
        input.role || 'ambassador',
        input.scheduledStart,
        input.scheduledEnd,
        input.payRate,
      ]
    );

    logger.info({ assignmentId: result?.id, eventId: input.eventId, ambassadorId: input.ambassadorId }, 'Assignment created');
    return result!;
  }

  /**
   * Check for scheduling conflicts
   */
  async checkConflicts(ambassadorId: string, eventId: string): Promise<AssignmentConflict[]> {
    const conflicts: AssignmentConflict[] = [];

    // Get the event details
    const event = await db.queryOne<{ event_date: Date; start_time: string; end_time: string }>(
      'SELECT event_date, start_time, end_time FROM events WHERE id = $1',
      [eventId]
    );
    if (!event) return conflicts;

    // Check for double-booking on same date
    const existingAssignments = await db.queryMany<{ event_id: string }>(
      `SELECT ea.event_id FROM event_assignments ea
       JOIN events e ON e.id = ea.event_id
       WHERE ea.ambassador_id = $1 
       AND e.event_date = $2 
       AND ea.status NOT IN ('declined', 'cancelled')
       AND ea.event_id != $3`,
      [ambassadorId, event.event_date, eventId]
    );

    for (const assignment of existingAssignments) {
      conflicts.push({
        ambassadorId,
        eventId,
        conflictingEventId: assignment.event_id,
        conflictType: 'double_booked',
      });
    }

    // Check availability exceptions
    const exception = await db.queryOne(
      `SELECT id FROM ambassador_availability_exceptions
       WHERE ambassador_id = $1 AND exception_date = $2`,
      [ambassadorId, event.event_date]
    );

    if (exception) {
      conflicts.push({
        ambassadorId,
        eventId,
        conflictingEventId: '',
        conflictType: 'unavailable',
      });
    }

    return conflicts;
  }

  /**
   * Update assignment status
   */
  async updateStatus(
    id: string, 
    status: AssignmentStatus, 
    updatedBy?: string,
    reason?: string
  ): Promise<EventAssignmentExtended | null> {
    const additionalFields: string[] = [];
    const values: unknown[] = [status, id];

    if (status === 'confirmed') {
      additionalFields.push('confirmed_at = NOW()');
    } else if (status === 'declined' && reason) {
      additionalFields.push('declined_reason = $3');
      values.push(reason);
    }

    const setClause = ['status = $1', ...additionalFields].join(', ');

    const result = await db.queryOne<EventAssignmentExtended>(
      `UPDATE event_assignments SET ${setClause}
       WHERE id = $2
       RETURNING *`,
      values
    );

    logger.info({ assignmentId: id, status }, 'Assignment status updated');
    return result;
  }

  /**
   * Check in ambassador
   */
  async checkIn(id: string): Promise<EventAssignmentExtended | null> {
    return db.queryOne<EventAssignmentExtended>(
      `UPDATE event_assignments 
       SET check_in_time = NOW(), status = 'confirmed'
       WHERE id = $1
       RETURNING *`,
      [id]
    );
  }

  /**
   * Check out ambassador
   */
  async checkOut(id: string): Promise<EventAssignmentExtended | null> {
    const result = await db.queryOne<EventAssignmentExtended>(
      `UPDATE event_assignments 
       SET check_out_time = NOW(), 
           status = 'completed',
           hours_worked = EXTRACT(EPOCH FROM (NOW() - check_in_time)) / 3600
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Update signup count
    if (result) {
      const signupCount = await db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM signups 
         WHERE event_id = $1 AND ambassador_id = $2`,
        [result.eventId, result.ambassadorId]
      );
      
      await db.query(
        'UPDATE event_assignments SET total_signups = $1 WHERE id = $2',
        [parseInt(signupCount?.count || '0'), id]
      );
    }

    return result;
  }

  /**
   * Get assignments for event
   */
  async getByEvent(eventId: string): Promise<EventAssignmentExtended[]> {
    return db.queryMany<EventAssignmentExtended>(
      `SELECT ea.*, a.first_name, a.last_name, a.email, a.skill_level
       FROM event_assignments ea
       JOIN ambassadors a ON a.id = ea.ambassador_id
       WHERE ea.event_id = $1
       ORDER BY ea.created_at`,
      [eventId]
    );
  }

  /**
   * Get assignments for ambassador
   */
  async getByAmbassador(ambassadorId: string, upcoming = true): Promise<EventAssignmentExtended[]> {
    const dateCondition = upcoming ? 'AND e.event_date >= CURRENT_DATE' : '';
    
    return db.queryMany<EventAssignmentExtended>(
      `SELECT ea.*, e.title as event_title, e.event_date, e.venue, e.city, e.state
       FROM event_assignments ea
       JOIN events e ON e.id = ea.event_id
       WHERE ea.ambassador_id = $1 ${dateCondition}
       ORDER BY e.event_date`,
      [ambassadorId]
    );
  }

  /**
   * Auto-suggest ambassadors for event
   */
  async suggestAmbassadors(eventId: string, limit = 10): Promise<{
    ambassadorId: string;
    name: string;
    score: number;
    reasons: string[];
  }[]> {
    const event = await db.queryOne<{ event_date: Date; state: string; required_skill_level: string }>(
      'SELECT event_date, state, required_skill_level FROM events WHERE id = $1',
      [eventId]
    );
    if (!event) return [];

    // Get available ambassadors with scoring
    const ambassadors = await db.queryMany<{
      id: string;
      first_name: string;
      last_name: string;
      skill_level: string;
      performance_score: number;
    }>(
      `SELECT a.id, a.first_name, a.last_name, a.skill_level,
              COALESCE(ph.performance_score, 50) as performance_score
       FROM ambassadors a
       LEFT JOIN LATERAL (
         SELECT performance_score FROM ambassador_performance_history 
         WHERE ambassador_id = a.id 
         ORDER BY calculated_at DESC LIMIT 1
       ) ph ON true
       WHERE a.status = 'active'
       AND a.id NOT IN (
         SELECT ea.ambassador_id FROM event_assignments ea
         JOIN events e ON e.id = ea.event_id
         WHERE e.event_date = $1 AND ea.status NOT IN ('declined', 'cancelled')
       )
       AND a.id NOT IN (
         SELECT ambassador_id FROM ambassador_availability_exceptions
         WHERE exception_date = $1
       )
       ORDER BY ph.performance_score DESC NULLS LAST
       LIMIT $2`,
      [event.event_date, limit]
    );

    return ambassadors.map(a => {
      const reasons: string[] = [];
      let score = a.performance_score || 50;

      // Skill level match bonus
      if (event.required_skill_level && a.skill_level === event.required_skill_level) {
        score += 10;
        reasons.push('Skill level match');
      }

      // High performer bonus
      if (a.performance_score >= 80) {
        reasons.push('High performer');
      }

      return {
        ambassadorId: a.id,
        name: `${a.first_name} ${a.last_name}`,
        score: Math.min(score, 100),
        reasons,
      };
    });
  }

  /**
   * Bulk assign ambassadors to event
   */
  async bulkAssign(eventId: string, ambassadorIds: string[], createdBy?: string): Promise<{
    success: string[];
    failed: { ambassadorId: string; reason: string }[];
  }> {
    const success: string[] = [];
    const failed: { ambassadorId: string; reason: string }[] = [];

    for (const ambassadorId of ambassadorIds) {
      try {
        await this.create({ eventId, ambassadorId }, createdBy);
        success.push(ambassadorId);
      } catch (error: any) {
        failed.push({ ambassadorId, reason: error.message });
      }
    }

    return { success, failed };
  }
}

export const assignmentService = new AssignmentService();
