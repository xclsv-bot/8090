/**
 * Event Duplication Service
 * WO-59: Enhanced Event Duplication API with Bulk Operations
 * 
 * Implements single and bulk event duplication with recurrence patterns.
 * Following REQ-EM-003: Duplicate Event requirements.
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type { EventExtended } from '../types/event.js';
import type {
  DuplicateEventInput,
  DuplicateEventResult,
  BulkDuplicateEventInput,
  BulkDuplicateResult,
  BulkDuplicateFailure,
  RecurrencePattern,
  GeneratedDate,
} from '../types/event-duplication.js';

class EventDuplicationService {
  /**
   * Duplicate a single event to a new date
   * 
   * AC-EM-003.1: Copies all event details except event_id, event_date, 
   *              start_time, end_time, status, and ambassador assignments
   * AC-EM-003.3: Sets new event's status to 'planned' (scheduled)
   * AC-EM-003.4: Validates that new event_date is not in the past
   */
  async duplicateEvent(
    sourceEventId: string,
    input: DuplicateEventInput,
    createdBy?: string
  ): Promise<DuplicateEventResult> {
    // Validate date is not in the past
    const dateValidation = this.validateFutureDate(input.eventDate);
    if (!dateValidation.valid) {
      return {
        success: false,
        error: dateValidation.error,
      };
    }

    // Get source event
    const sourceEvent = await this.getSourceEvent(sourceEventId);
    if (!sourceEvent) {
      return {
        success: false,
        error: 'Source event not found',
      };
    }

    try {
      // Create duplicate with new date/times, status = 'planned'
      const duplicatedEvent = await this.createDuplicateEvent(
        sourceEvent,
        input.eventDate,
        input.startTime ?? sourceEvent.startTime,
        input.endTime ?? sourceEvent.endTime,
        input.title ?? sourceEvent.title,
        createdBy
      );

      logger.info({
        sourceEventId,
        newEventId: duplicatedEvent.id,
        newDate: input.eventDate,
      }, 'Event duplicated successfully');

      return {
        success: true,
        event: duplicatedEvent,
      };
    } catch (error) {
      logger.error({ sourceEventId, error }, 'Failed to duplicate event');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during duplication',
      };
    }
  }

  /**
   * Bulk duplicate an event with recurrence pattern
   * 
   * AC-EM-003.5: Supports weekly, bi-weekly, and monthly recurrence patterns
   * AC-EM-003.6: Generates all event copies within the specified date range
   */
  async bulkDuplicateEvent(
    sourceEventId: string,
    input: BulkDuplicateEventInput,
    createdBy?: string
  ): Promise<BulkDuplicateResult> {
    const result: BulkDuplicateResult = {
      totalRequested: 0,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      createdEvents: [],
      failures: [],
    };

    // Validate date range
    const rangeValidation = this.validateDateRange(input.startDate, input.endDate);
    if (!rangeValidation.valid) {
      result.failures.push({
        date: input.startDate,
        reason: rangeValidation.error!,
        code: 'VALIDATION_ERROR',
      });
      result.failureCount = 1;
      result.totalRequested = 1;
      return result;
    }

    // Get source event
    const sourceEvent = await this.getSourceEvent(sourceEventId);
    if (!sourceEvent) {
      result.failures.push({
        date: input.startDate,
        reason: 'Source event not found',
        code: 'VALIDATION_ERROR',
      });
      result.failureCount = 1;
      result.totalRequested = 1;
      return result;
    }

    // Generate dates based on recurrence pattern
    const dates = this.generateRecurrenceDates(
      input.startDate,
      input.endDate,
      input.recurrencePattern,
      sourceEvent.eventDate
    );

    result.totalRequested = dates.length;

    if (dates.length === 0) {
      logger.warn({
        sourceEventId,
        pattern: input.recurrencePattern,
        startDate: input.startDate,
        endDate: input.endDate,
      }, 'No dates generated for bulk duplication');
      return result;
    }

    // Check for conflicts if skipConflicts is enabled
    let existingDates: Set<string> = new Set();
    if (input.skipConflicts && sourceEvent.venue) {
      existingDates = await this.getExistingEventDates(
        sourceEvent.venue,
        input.startDate,
        input.endDate
      );
    }

    // Create events for each date
    const today = this.getTodayDateString();

    for (const dateInfo of dates) {
      // Skip past dates
      if (dateInfo.date < today) {
        result.failures.push({
          date: dateInfo.date,
          reason: 'Date is in the past',
          code: 'PAST_DATE',
        });
        result.skippedCount++;
        continue;
      }

      // Skip conflicts
      if (input.skipConflicts && existingDates.has(dateInfo.date)) {
        result.failures.push({
          date: dateInfo.date,
          reason: 'Conflict with existing event at same venue',
          code: 'CONFLICT',
        });
        result.skippedCount++;
        continue;
      }

      try {
        const duplicatedEvent = await this.createDuplicateEvent(
          sourceEvent,
          dateInfo.date,
          input.startTime ?? sourceEvent.startTime,
          input.endTime ?? sourceEvent.endTime,
          sourceEvent.title,
          createdBy
        );

        result.createdEvents.push(duplicatedEvent);
        result.successCount++;
      } catch (error) {
        logger.error({
          sourceEventId,
          targetDate: dateInfo.date,
          error,
        }, 'Failed to create duplicate event');

        result.failures.push({
          date: dateInfo.date,
          reason: error instanceof Error ? error.message : 'Database error',
          code: 'DATABASE_ERROR',
        });
        result.failureCount++;
      }
    }

    logger.info({
      sourceEventId,
      pattern: input.recurrencePattern,
      startDate: input.startDate,
      endDate: input.endDate,
      totalRequested: result.totalRequested,
      successCount: result.successCount,
      failureCount: result.failureCount,
      skippedCount: result.skippedCount,
    }, 'Bulk event duplication completed');

    return result;
  }

  /**
   * Get source event for duplication
   */
  private async getSourceEvent(eventId: string): Promise<EventExtended | null> {
    return db.queryOne<EventExtended>(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );
  }

  /**
   * Create a duplicate event with new date/times
   * Copies all fields except: id, event_date, start_time, end_time, status
   * Sets status to 'planned' and generates new timestamps
   */
  private async createDuplicateEvent(
    source: EventExtended,
    newDate: string,
    newStartTime: string | undefined,
    newEndTime: string | undefined,
    title: string,
    createdBy?: string
  ): Promise<EventExtended> {
    const result = await db.queryOne<EventExtended>(
      `INSERT INTO events (
        title, description, event_type, venue, address, city, state, region,
        event_date, start_time, end_time, timezone,
        venue_contact_name, venue_contact_phone, venue_contact_email,
        expected_attendance, budget, min_ambassadors, max_ambassadors,
        required_skill_level, status, is_recurring, parent_event_id, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20, 'planned', $21, $22, $23
      )
      RETURNING *`,
      [
        title,
        source.description,
        source.eventType,
        source.venue,
        source.address,
        source.city,
        source.state,
        source.region,
        newDate,
        newStartTime,
        newEndTime,
        source.timezone,
        source.venueContactName,
        source.venueContactPhone,
        source.venueContactEmail,
        source.expectedAttendance,
        source.budget,
        source.minAmbassadors,
        source.maxAmbassadors,
        source.requiredSkillLevel,
        source.isRecurring,
        source.id, // parent_event_id references the source
        source.notes,
      ]
    );

    if (!result) {
      throw new Error('Failed to create duplicate event');
    }

    // Log state history for the new event
    await db.query(
      `INSERT INTO event_state_history (event_id, from_status, to_status, changed_by, change_reason)
       VALUES ($1, NULL, 'planned', $2, 'Created via event duplication')`,
      [result.id, createdBy]
    );

    // Copy event operators from source
    await this.copyEventOperators(source.id, result.id);

    return result;
  }

  /**
   * Copy event operators from source to duplicate
   */
  private async copyEventOperators(sourceId: string, targetId: string): Promise<void> {
    await db.query(
      `INSERT INTO event_operators (event_id, operator_id, is_primary, promo_materials, special_instructions, signup_goal)
       SELECT $2, operator_id, is_primary, promo_materials, special_instructions, signup_goal
       FROM event_operators
       WHERE event_id = $1`,
      [sourceId, targetId]
    );
  }

  /**
   * Generate dates based on recurrence pattern
   * 
   * AC-EM-003.5: Supports weekly, bi-weekly, and monthly patterns
   */
  generateRecurrenceDates(
    startDate: string,
    endDate: string,
    pattern: RecurrencePattern,
    sourceEventDate?: Date
  ): GeneratedDate[] {
    const dates: GeneratedDate[] = [];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    // For monthly pattern, preserve the day of month from source event
    const sourceDayOfMonth = sourceEventDate 
      ? new Date(sourceEventDate).getDate() 
      : start.getDate();

    let current = new Date(start);

    // For weekly/bi-weekly, preserve day of week from source or start date
    const targetDayOfWeek = sourceEventDate
      ? new Date(sourceEventDate).getDay()
      : start.getDay();

    // Adjust start to first occurrence of target day of week
    if (pattern === 'weekly' || pattern === 'bi-weekly') {
      const currentDayOfWeek = current.getDay();
      const daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
      current.setDate(current.getDate() + daysUntilTarget);
    }

    while (current <= end) {
      const dateStr = this.formatDate(current);
      dates.push({
        date: dateStr,
        dayOfWeek: current.getDay(),
      });

      // Advance based on pattern
      switch (pattern) {
        case 'weekly':
          current.setDate(current.getDate() + 7);
          break;
        case 'bi-weekly':
          current.setDate(current.getDate() + 14);
          break;
        case 'monthly':
          // Move to next month, same day of month
          const nextMonth = current.getMonth() + 1;
          const nextYear = current.getFullYear() + Math.floor(nextMonth / 12);
          const normalizedMonth = nextMonth % 12;
          
          // Handle months with fewer days
          const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
          const targetDay = Math.min(sourceDayOfMonth, daysInNextMonth);
          
          current = new Date(nextYear, normalizedMonth, targetDay);
          break;
      }
    }

    return dates;
  }

  /**
   * Get existing event dates at a venue within a date range
   */
  private async getExistingEventDates(
    venue: string,
    startDate: string,
    endDate: string
  ): Promise<Set<string>> {
    const results = await db.queryMany<{ event_date: Date }>(
      `SELECT event_date FROM events 
       WHERE venue = $1 
       AND event_date >= $2 
       AND event_date <= $3
       AND status != 'cancelled'`,
      [venue, startDate, endDate]
    );

    const dateSet = new Set<string>();
    for (const row of results) {
      dateSet.add(this.formatDate(new Date(row.event_date)));
    }
    return dateSet;
  }

  /**
   * Validate that a date is not in the past
   * AC-EM-003.4: Validates that new event_date is not in the past
   */
  validateFutureDate(dateStr: string): { valid: boolean; error?: string } {
    const today = this.getTodayDateString();
    
    if (dateStr < today) {
      return {
        valid: false,
        error: `Event date ${dateStr} is in the past. Must be today (${today}) or later.`,
      };
    }

    // Also validate the date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return {
        valid: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      };
    }

    // Validate it's a real date
    const parsed = new Date(dateStr + 'T00:00:00');
    if (isNaN(parsed.getTime())) {
      return {
        valid: false,
        error: 'Invalid date value.',
      };
    }

    return { valid: true };
  }

  /**
   * Validate date range for bulk operations
   */
  private validateDateRange(startDate: string, endDate: string): { valid: boolean; error?: string } {
    const startValidation = this.validateFutureDate(startDate);
    if (!startValidation.valid) {
      return startValidation;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return {
        valid: false,
        error: 'Invalid end date format. Expected YYYY-MM-DD.',
      };
    }

    if (endDate < startDate) {
      return {
        valid: false,
        error: 'End date must be on or after start date.',
      };
    }

    // Limit range to prevent excessive event creation (max 1 year)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const maxDays = 365;
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > maxDays) {
      return {
        valid: false,
        error: `Date range exceeds maximum of ${maxDays} days.`,
      };
    }

    return { valid: true };
  }

  /**
   * Get today's date as YYYY-MM-DD string
   */
  private getTodayDateString(): string {
    return this.formatDate(new Date());
  }

  /**
   * Format a date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Preview bulk duplication dates without creating events
   * Useful for UI to show user what dates will be created
   */
  async previewBulkDuplication(
    sourceEventId: string,
    input: BulkDuplicateEventInput
  ): Promise<{
    dates: GeneratedDate[];
    conflicts: string[];
    pastDates: string[];
  }> {
    const sourceEvent = await this.getSourceEvent(sourceEventId);
    
    const dates = this.generateRecurrenceDates(
      input.startDate,
      input.endDate,
      input.recurrencePattern,
      sourceEvent?.eventDate
    );

    const today = this.getTodayDateString();
    const pastDates = dates.filter(d => d.date < today).map(d => d.date);
    const futureDates = dates.filter(d => d.date >= today);

    let conflicts: string[] = [];
    if (input.skipConflicts && sourceEvent?.venue) {
      const existingDates = await this.getExistingEventDates(
        sourceEvent.venue,
        input.startDate,
        input.endDate
      );
      conflicts = futureDates
        .filter(d => existingDates.has(d.date))
        .map(d => d.date);
    }

    return {
      dates: futureDates,
      conflicts,
      pastDates,
    };
  }
}

export const eventDuplicationService = new EventDuplicationService();
