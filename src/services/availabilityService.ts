/**
 * Availability Service
 * WO-35: Event Scheduling & Availability API
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  preferredRegions?: string[];
}

interface AvailabilityException {
  date: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

class AvailabilityService {
  /**
   * Set general availability for ambassador
   */
  async setGeneralAvailability(
    ambassadorId: string, 
    slots: AvailabilitySlot[]
  ): Promise<void> {
    // Clear existing availability
    await db.query(
      'DELETE FROM ambassador_general_availability WHERE ambassador_id = $1',
      [ambassadorId]
    );

    // Insert new slots
    for (const slot of slots) {
      await db.query(
        `INSERT INTO ambassador_general_availability 
         (ambassador_id, day_of_week, start_time, end_time, preferred_regions)
         VALUES ($1, $2, $3, $4, $5)`,
        [ambassadorId, slot.dayOfWeek, slot.startTime, slot.endTime, slot.preferredRegions]
      );
    }

    logger.info({ ambassadorId, slotCount: slots.length }, 'General availability updated');
  }

  /**
   * Get general availability for ambassador
   */
  async getGeneralAvailability(ambassadorId: string): Promise<AvailabilitySlot[]> {
    const rows = await db.queryMany<{
      day_of_week: number;
      start_time: string;
      end_time: string;
      preferred_regions: string[];
    }>(
      `SELECT day_of_week, start_time, end_time, preferred_regions
       FROM ambassador_general_availability
       WHERE ambassador_id = $1 AND is_active = true
       ORDER BY day_of_week, start_time`,
      [ambassadorId]
    );

    return rows.map(r => ({
      dayOfWeek: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      preferredRegions: r.preferred_regions,
    }));
  }

  /**
   * Add availability exception
   */
  async addException(ambassadorId: string, exception: AvailabilityException): Promise<void> {
    await db.query(
      `INSERT INTO ambassador_availability_exceptions
       (ambassador_id, exception_date, all_day, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ambassador_id, exception_date, start_time) 
       DO UPDATE SET all_day = $3, end_time = $5, reason = $6`,
      [
        ambassadorId,
        exception.date,
        exception.allDay ?? true,
        exception.startTime,
        exception.endTime,
        exception.reason,
      ]
    );

    logger.info({ ambassadorId, date: exception.date }, 'Availability exception added');
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
      all_day: boolean;
      start_time: string;
      end_time: string;
      reason: string;
    }>(
      `SELECT exception_date, all_day, start_time, end_time, reason
       FROM ambassador_availability_exceptions
       WHERE ambassador_id = $1 ${dateCondition}
       ORDER BY exception_date`,
      params
    );

    return rows.map(r => ({
      date: r.exception_date.toISOString().split('T')[0],
      allDay: r.all_day,
      startTime: r.start_time,
      endTime: r.end_time,
      reason: r.reason,
    }));
  }

  /**
   * Check if ambassador is available on date
   */
  async isAvailable(ambassadorId: string, date: string): Promise<boolean> {
    // Check exceptions first
    const exception = await db.queryOne(
      `SELECT id FROM ambassador_availability_exceptions
       WHERE ambassador_id = $1 AND exception_date = $2 AND all_day = true`,
      [ambassadorId, date]
    );
    if (exception) return false;

    // Check general availability
    const dayOfWeek = new Date(date).getDay();
    const availability = await db.queryOne(
      `SELECT id FROM ambassador_general_availability
       WHERE ambassador_id = $1 AND day_of_week = $2 AND is_active = true`,
      [ambassadorId, dayOfWeek]
    );

    return !!availability;
  }

  /**
   * Get available ambassadors for date
   */
  async getAvailableAmbassadors(date: string, region?: string): Promise<{
    id: string;
    name: string;
    skillLevel: string;
  }[]> {
    const dayOfWeek = new Date(date).getDay();

    const rows = await db.queryMany<{
      id: string;
      first_name: string;
      last_name: string;
      skill_level: string;
    }>(
      `SELECT DISTINCT a.id, a.first_name, a.last_name, a.skill_level
       FROM ambassadors a
       JOIN ambassador_general_availability aga ON aga.ambassador_id = a.id
       WHERE a.status = 'active'
       AND aga.day_of_week = $1
       AND aga.is_active = true
       AND a.id NOT IN (
         SELECT ambassador_id FROM ambassador_availability_exceptions
         WHERE exception_date = $2 AND all_day = true
       )
       ${region ? "AND $3 = ANY(aga.preferred_regions)" : ''}
       ORDER BY a.first_name, a.last_name`,
      region ? [dayOfWeek, date, region] : [dayOfWeek, date]
    );

    return rows.map(r => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      skillLevel: r.skill_level,
    }));
  }

  /**
   * Get availability heatmap data
   */
  async getHeatmap(fromDate: string, toDate: string): Promise<{
    date: string;
    availableCount: number;
  }[]> {
    const rows = await db.queryMany<{ date: Date; count: string }>(
      `WITH dates AS (
         SELECT generate_series($1::date, $2::date, '1 day'::interval)::date as date
       )
       SELECT d.date, COUNT(DISTINCT a.id) as count
       FROM dates d
       CROSS JOIN ambassadors a
       JOIN ambassador_general_availability aga ON aga.ambassador_id = a.id
       WHERE a.status = 'active'
       AND aga.day_of_week = EXTRACT(DOW FROM d.date)
       AND aga.is_active = true
       AND a.id NOT IN (
         SELECT ambassador_id FROM ambassador_availability_exceptions
         WHERE exception_date = d.date AND all_day = true
       )
       GROUP BY d.date
       ORDER BY d.date`,
      [fromDate, toDate]
    );

    return rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      availableCount: parseInt(r.count),
    }));
  }
}

export const availabilityService = new AvailabilityService();
