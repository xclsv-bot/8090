/**
 * Availability Service
 * WO-35: Event Scheduling & Availability API
 * WO-89: Availability System Restructure - Patterns + Exceptions
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';

// ============================================
// Types
// ============================================

export interface AvailabilitySlot {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  timezone: string;  // IANA timezone (e.g., 'America/New_York')
  preferredRegions?: string[];
}

export interface AvailabilityException {
  date: string;        // YYYY-MM-DD
  isAvailable: boolean; // true = available override, false = unavailable
  startTime?: string;  // HH:MM (optional, for partial day)
  endTime?: string;    // HH:MM (optional, for partial day)
  reason?: string;
}

export interface DayAvailability {
  date: string;
  dayOfWeek: number;
  isAvailable: boolean;
  slots: Array<{
    startTime: string;
    endTime: string;
    timezone: string;
    source: 'pattern' | 'exception';
  }>;
  exception?: {
    reason?: string;
    isOverride: boolean;
  };
}

export interface AvailableAmbassador {
  id: string;
  name: string;
  skillLevel: string;
  timezone?: string;
  slots: Array<{ startTime: string; endTime: string }>;
}

export interface MigrationResult {
  ambassadorsMigrated: number;
  availabilityPatterns: number;
  exceptionsUpdated: number;
  errors: string[];
}

// ============================================
// Service
// ============================================

class AvailabilityService {
  /**
   * Set general availability patterns for ambassador
   * Replaces all existing patterns for the ambassador
   */
  async setGeneralAvailability(
    ambassadorId: string, 
    slots: AvailabilitySlot[]
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Clear existing availability
      await client.query(
        'DELETE FROM ambassador_general_availability WHERE ambassador_id = $1',
        [ambassadorId]
      );

      // Insert new slots
      for (const slot of slots) {
        await client.query(
          `INSERT INTO ambassador_general_availability 
           (ambassador_id, day_of_week, start_time, end_time, timezone, preferred_regions)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            ambassadorId, 
            slot.dayOfWeek, 
            slot.startTime, 
            slot.endTime, 
            slot.timezone || 'America/New_York',
            slot.preferredRegions || null
          ]
        );
      }
    });

    logger.info({ ambassadorId, slotCount: slots.length }, 'General availability updated');
  }

  /**
   * Update a single availability slot
   */
  async updateAvailabilitySlot(
    ambassadorId: string,
    dayOfWeek: number,
    slot: Omit<AvailabilitySlot, 'dayOfWeek'>
  ): Promise<void> {
    await db.query(
      `INSERT INTO ambassador_general_availability 
       (ambassador_id, day_of_week, start_time, end_time, timezone, preferred_regions)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ambassador_id, day_of_week, start_time) 
       DO UPDATE SET 
         end_time = EXCLUDED.end_time,
         timezone = EXCLUDED.timezone,
         preferred_regions = EXCLUDED.preferred_regions,
         updated_at = NOW()`,
      [
        ambassadorId,
        dayOfWeek,
        slot.startTime,
        slot.endTime,
        slot.timezone || 'America/New_York',
        slot.preferredRegions || null
      ]
    );

    logger.info({ ambassadorId, dayOfWeek }, 'Availability slot updated');
  }

  /**
   * Get general availability patterns for ambassador
   */
  async getGeneralAvailability(ambassadorId: string): Promise<AvailabilitySlot[]> {
    const rows = await db.queryMany<{
      day_of_week: number;
      start_time: string;
      end_time: string;
      timezone: string;
      preferred_regions: string[] | null;
    }>(
      `SELECT day_of_week, start_time::text, end_time::text, timezone, preferred_regions
       FROM ambassador_general_availability
       WHERE ambassador_id = $1 AND is_active = true
       ORDER BY day_of_week, start_time`,
      [ambassadorId]
    );

    return rows.map(r => ({
      dayOfWeek: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      timezone: r.timezone || 'America/New_York',
      preferredRegions: r.preferred_regions ?? undefined,
    }));
  }

  /**
   * Add or update availability exception
   * isAvailable=true means "I AM available on this date" (override pattern)
   * isAvailable=false means "I am NOT available on this date"
   */
  async addException(ambassadorId: string, exception: AvailabilityException): Promise<void> {
    await db.query(
      `INSERT INTO ambassador_availability_exceptions
       (ambassador_id, exception_date, is_available, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ambassador_id, exception_date, start_time) 
       DO UPDATE SET 
         is_available = EXCLUDED.is_available,
         end_time = EXCLUDED.end_time, 
         reason = EXCLUDED.reason`,
      [
        ambassadorId,
        exception.date,
        exception.isAvailable,
        exception.startTime || null,
        exception.endTime || null,
        exception.reason || null,
      ]
    );

    logger.info({ 
      ambassadorId, 
      date: exception.date, 
      isAvailable: exception.isAvailable 
    }, 'Availability exception added');
  }

  /**
   * Remove availability exception
   */
  async removeException(ambassadorId: string, date: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM ambassador_availability_exceptions WHERE ambassador_id = $1 AND exception_date = $2',
      [ambassadorId, date]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get exceptions for ambassador
   */
  async getExceptions(ambassadorId: string, fromDate?: string): Promise<AvailabilityException[]> {
    const dateCondition = fromDate ? 'AND exception_date >= $2' : '';
    const params = fromDate ? [ambassadorId, fromDate] : [ambassadorId];

    const rows = await db.queryMany<{
      exception_date: Date;
      is_available: boolean;
      start_time: string | null;
      end_time: string | null;
      reason: string | null;
    }>(
      `SELECT exception_date, is_available, start_time::text, end_time::text, reason
       FROM ambassador_availability_exceptions
       WHERE ambassador_id = $1 ${dateCondition}
       ORDER BY exception_date`,
      params
    );

    return rows.map(r => ({
      date: r.exception_date.toISOString().split('T')[0],
      isAvailable: r.is_available,
      startTime: r.start_time ?? undefined,
      endTime: r.end_time ?? undefined,
      reason: r.reason ?? undefined,
    }));
  }

  /**
   * Get computed availability for a specific date
   * Considers both patterns and exceptions
   */
  async getAvailabilityForDate(ambassadorId: string, date: string): Promise<DayAvailability> {
    const dateObj = new Date(date + 'T00:00:00Z');
    const dayOfWeek = dateObj.getUTCDay();

    // Get exception for this date (if any)
    const exception = await db.queryOne<{
      is_available: boolean;
      start_time: string | null;
      end_time: string | null;
      reason: string | null;
    }>(
      `SELECT is_available, start_time::text, end_time::text, reason
       FROM ambassador_availability_exceptions
       WHERE ambassador_id = $1 AND exception_date = $2`,
      [ambassadorId, date]
    );

    // Get recurring pattern for this day
    const patterns = await db.queryMany<{
      start_time: string;
      end_time: string;
      timezone: string;
    }>(
      `SELECT start_time::text, end_time::text, timezone
       FROM ambassador_general_availability
       WHERE ambassador_id = $1 AND day_of_week = $2 AND is_active = true
       ORDER BY start_time`,
      [ambassadorId, dayOfWeek]
    );

    // Determine availability based on exception + pattern logic
    let isAvailable: boolean;
    let slots: DayAvailability['slots'] = [];
    let exceptionInfo: DayAvailability['exception'];

    if (exception) {
      // Exception takes precedence
      isAvailable = exception.is_available;
      exceptionInfo = {
        reason: exception.reason ?? undefined,
        isOverride: exception.is_available, // true = available override
      };

      if (exception.is_available && exception.start_time && exception.end_time) {
        // Specific available time slot from exception
        slots = [{
          startTime: exception.start_time,
          endTime: exception.end_time,
          timezone: 'America/New_York', // Default for exceptions
          source: 'exception' as const,
        }];
      } else if (exception.is_available && patterns.length > 0) {
        // Available override without specific times - use pattern times
        slots = patterns.map(p => ({
          startTime: p.start_time,
          endTime: p.end_time,
          timezone: p.timezone,
          source: 'pattern' as const,
        }));
      }
    } else {
      // No exception - use pattern
      isAvailable = patterns.length > 0;
      slots = patterns.map(p => ({
        startTime: p.start_time,
        endTime: p.end_time,
        timezone: p.timezone,
        source: 'pattern' as const,
      }));
    }

    return {
      date,
      dayOfWeek,
      isAvailable,
      slots,
      exception: exceptionInfo,
    };
  }

  /**
   * Check if ambassador is available on date (simple boolean)
   */
  async isAvailable(ambassadorId: string, date: string): Promise<boolean> {
    const availability = await this.getAvailabilityForDate(ambassadorId, date);
    return availability.isAvailable;
  }

  /**
   * Get availability for a date range
   */
  async getAvailabilityRange(
    ambassadorId: string, 
    fromDate: string, 
    toDate: string
  ): Promise<DayAvailability[]> {
    const results: DayAvailability[] = [];
    const current = new Date(fromDate);
    const end = new Date(toDate);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      results.push(await this.getAvailabilityForDate(ambassadorId, dateStr));
      current.setDate(current.getDate() + 1);
    }

    return results;
  }

  /**
   * Get available ambassadors for date with full slot info
   */
  async getAvailableAmbassadors(date: string, region?: string): Promise<AvailableAmbassador[]> {
    const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay();

    // Get ambassadors with matching patterns who don't have unavailable exceptions
    const query = `
      SELECT DISTINCT 
        a.id, 
        a.first_name, 
        a.last_name, 
        a.skill_level,
        aga.timezone,
        aga.start_time::text as start_time,
        aga.end_time::text as end_time
      FROM ambassadors a
      JOIN ambassador_general_availability aga ON aga.ambassador_id = a.id
      WHERE a.status = 'active'
        AND aga.day_of_week = $1
        AND aga.is_active = true
        -- Exclude if there's an unavailable exception
        AND a.id NOT IN (
          SELECT ambassador_id 
          FROM ambassador_availability_exceptions
          WHERE exception_date = $2 AND is_available = false
        )
        ${region ? 'AND $3 = ANY(aga.preferred_regions)' : ''}
      
      UNION
      
      -- Include ambassadors with available exception overrides
      SELECT DISTINCT
        a.id,
        a.first_name,
        a.last_name,
        a.skill_level,
        COALESCE(aga.timezone, 'America/New_York') as timezone,
        COALESCE(aae.start_time::text, aga.start_time::text) as start_time,
        COALESCE(aae.end_time::text, aga.end_time::text) as end_time
      FROM ambassadors a
      JOIN ambassador_availability_exceptions aae ON aae.ambassador_id = a.id
      LEFT JOIN ambassador_general_availability aga ON aga.ambassador_id = a.id AND aga.day_of_week = $1
      WHERE a.status = 'active'
        AND aae.exception_date = $2
        AND aae.is_available = true
        ${region ? 'AND (aga.id IS NULL OR $3 = ANY(aga.preferred_regions))' : ''}
      
      ORDER BY first_name, last_name
    `;

    const params = region ? [dayOfWeek, date, region] : [dayOfWeek, date];
    
    const rows = await db.queryMany<{
      id: string;
      first_name: string;
      last_name: string;
      skill_level: string;
      timezone: string;
      start_time: string;
      end_time: string;
    }>(query, params);

    // Group by ambassador
    const ambassadorMap = new Map<string, AvailableAmbassador>();
    
    for (const row of rows) {
      const existing = ambassadorMap.get(row.id);
      const slot = { startTime: row.start_time, endTime: row.end_time };
      
      if (existing) {
        existing.slots.push(slot);
      } else {
        ambassadorMap.set(row.id, {
          id: row.id,
          name: `${row.first_name} ${row.last_name}`,
          skillLevel: row.skill_level,
          timezone: row.timezone,
          slots: [slot],
        });
      }
    }

    return Array.from(ambassadorMap.values());
  }

  /**
   * Get availability heatmap data
   */
  async getHeatmap(fromDate: string, toDate: string): Promise<{
    date: string;
    availableCount: number;
    dayOfWeek: number;
  }[]> {
    const rows = await db.queryMany<{ 
      date: Date; 
      count: string; 
      day_of_week: number;
    }>(
      `WITH dates AS (
         SELECT generate_series($1::date, $2::date, '1 day'::interval)::date as date
       ),
       pattern_available AS (
         SELECT d.date, a.id as ambassador_id
         FROM dates d
         CROSS JOIN ambassadors a
         JOIN ambassador_general_availability aga ON aga.ambassador_id = a.id
         WHERE a.status = 'active'
           AND aga.day_of_week = EXTRACT(DOW FROM d.date)
           AND aga.is_active = true
       ),
       exception_unavailable AS (
         SELECT exception_date, ambassador_id
         FROM ambassador_availability_exceptions
         WHERE is_available = false
           AND exception_date BETWEEN $1 AND $2
       ),
       exception_available AS (
         SELECT exception_date, ambassador_id
         FROM ambassador_availability_exceptions
         WHERE is_available = true
           AND exception_date BETWEEN $1 AND $2
       )
       SELECT 
         d.date, 
         EXTRACT(DOW FROM d.date)::integer as day_of_week,
         COUNT(DISTINCT COALESCE(ea.ambassador_id, pa.ambassador_id)) as count
       FROM dates d
       LEFT JOIN pattern_available pa ON pa.date = d.date
       LEFT JOIN exception_unavailable eu ON eu.exception_date = d.date AND eu.ambassador_id = pa.ambassador_id
       LEFT JOIN exception_available ea ON ea.exception_date = d.date
       WHERE pa.ambassador_id IS NOT NULL AND eu.ambassador_id IS NULL
          OR ea.ambassador_id IS NOT NULL
       GROUP BY d.date
       ORDER BY d.date`,
      [fromDate, toDate]
    );

    return rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      availableCount: parseInt(r.count),
      dayOfWeek: r.day_of_week,
    }));
  }

  /**
   * Bulk set exceptions (for vacation/time-off periods)
   */
  async setExceptionRange(
    ambassadorId: string,
    fromDate: string,
    toDate: string,
    isAvailable: boolean,
    reason?: string
  ): Promise<number> {
    const current = new Date(fromDate);
    const end = new Date(toDate);
    let count = 0;

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      await this.addException(ambassadorId, {
        date: dateStr,
        isAvailable,
        reason,
      });
      count++;
      current.setDate(current.getDate() + 1);
    }

    logger.info({ 
      ambassadorId, 
      fromDate, 
      toDate, 
      isAvailable, 
      daysSet: count 
    }, 'Exception range set');

    return count;
  }

  /**
   * Clear old exceptions (cleanup)
   */
  async clearOldExceptions(beforeDate: string): Promise<number> {
    const result = await db.query(
      'DELETE FROM ambassador_availability_exceptions WHERE exception_date < $1',
      [beforeDate]
    );
    
    const count = result.rowCount ?? 0;
    logger.info({ beforeDate, removed: count }, 'Old exceptions cleared');
    return count;
  }

  /**
   * Migrate existing availability data to new structure
   * - Sets default timezone for patterns without one
   * - Sets is_available=false for existing exceptions (old behavior)
   */
  async migrateExistingData(): Promise<MigrationResult> {
    const errors: string[] = [];
    let ambassadorsMigrated = 0;
    let availabilityPatterns = 0;
    let exceptionsUpdated = 0;

    try {
      // Update patterns without timezone
      const patternResult = await db.query(
        `UPDATE ambassador_general_availability 
         SET timezone = 'America/New_York' 
         WHERE timezone IS NULL`
      );
      availabilityPatterns = patternResult.rowCount ?? 0;

      // Update exceptions without is_available
      const exceptionResult = await db.query(
        `UPDATE ambassador_availability_exceptions 
         SET is_available = false 
         WHERE is_available IS NULL`
      );
      exceptionsUpdated = exceptionResult.rowCount ?? 0;

      // Count unique ambassadors migrated
      const countResult = await db.queryOne<{ count: string }>(
        `SELECT COUNT(DISTINCT ambassador_id) as count 
         FROM ambassador_general_availability`
      );
      ambassadorsMigrated = parseInt(countResult?.count ?? '0');

      logger.info({
        ambassadorsMigrated,
        availabilityPatterns,
        exceptionsUpdated,
      }, 'Availability data migration completed');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(message);
      logger.error({ error }, 'Migration error');
    }

    return {
      ambassadorsMigrated,
      availabilityPatterns,
      exceptionsUpdated,
      errors,
    };
  }

  /**
   * Copy availability from one ambassador to another
   * Useful for team leads setting up new ambassadors
   */
  async copyAvailability(
    sourceAmbassadorId: string, 
    targetAmbassadorId: string
  ): Promise<{ patternsCopied: number }> {
    const patterns = await this.getGeneralAvailability(sourceAmbassadorId);
    
    if (patterns.length > 0) {
      await this.setGeneralAvailability(targetAmbassadorId, patterns);
    }

    logger.info({ 
      sourceAmbassadorId, 
      targetAmbassadorId, 
      patternsCopied: patterns.length 
    }, 'Availability copied');

    return { patternsCopied: patterns.length };
  }

  /**
   * Get summary statistics for availability system
   */
  async getStatistics(): Promise<{
    totalAmbassadorsWithAvailability: number;
    totalPatterns: number;
    totalExceptions: number;
    upcomingExceptions: number;
  }> {
    const stats = await db.queryOne<{
      ambassadors: string;
      patterns: string;
      exceptions: string;
      upcoming: string;
    }>(`
      SELECT 
        (SELECT COUNT(DISTINCT ambassador_id) FROM ambassador_general_availability WHERE is_active = true) as ambassadors,
        (SELECT COUNT(*) FROM ambassador_general_availability WHERE is_active = true) as patterns,
        (SELECT COUNT(*) FROM ambassador_availability_exceptions) as exceptions,
        (SELECT COUNT(*) FROM ambassador_availability_exceptions WHERE exception_date >= CURRENT_DATE) as upcoming
    `);

    return {
      totalAmbassadorsWithAvailability: parseInt(stats?.ambassadors ?? '0'),
      totalPatterns: parseInt(stats?.patterns ?? '0'),
      totalExceptions: parseInt(stats?.exceptions ?? '0'),
      upcomingExceptions: parseInt(stats?.upcoming ?? '0'),
    };
  }
}

export const availabilityService = new AvailabilityService();
