/**
 * Event Duplication API Routes
 * WO-59: Enhanced Event Duplication API with Bulk Operations
 * 
 * Provides endpoints for single and bulk event duplication with recurrence patterns.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eventDuplicationService } from '../services/eventDuplicationService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const duplicateEventSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
  title: z.string().min(1).max(255).optional(),
});

const bulkDuplicateSchema = z.object({
  recurrencePattern: z.enum(['weekly', 'bi-weekly', 'monthly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
  skipConflicts: z.boolean().optional().default(false),
});

const previewQuerySchema = z.object({
  recurrencePattern: z.enum(['weekly', 'bi-weekly', 'monthly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  skipConflicts: z.string().optional().transform(v => v === 'true'),
});

// ============================================
// ROUTES
// ============================================

export async function eventDuplicationRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /events/:id/duplicate - Duplicate a single event
   * 
   * Creates a copy of the event with a new date. The duplicated event:
   * - Copies all event details except event_id, event_date, start_time, end_time, status
   * - Sets status to 'planned'
   * - Does NOT copy ambassador assignments
   * - Links to source event via parent_event_id
   * 
   * @param id - Source event ID (UUID)
   * @body eventDate - New date for the event (YYYY-MM-DD, required)
   * @body startTime - New start time (HH:MM, optional)
   * @body endTime - New end time (HH:MM, optional)
   * @body title - Optional title override
   * 
   * @returns {object} The newly created event
   */
  fastify.post('/:id/duplicate', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(duplicateEventSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof duplicateEventSchema>;

    const result = await eventDuplicationService.duplicateEvent(
      id,
      input,
      request.user?.id
    );

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 400;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: result.error?.includes('not found') ? 'NOT_FOUND' : 'VALIDATION_ERROR',
          message: result.error,
        },
      });
    }

    return reply.status(201).send({
      success: true,
      data: result.event,
    });
  });

  /**
   * POST /events/:id/duplicate/bulk - Bulk duplicate event with recurrence
   * 
   * Creates multiple copies of an event based on a recurrence pattern within
   * a date range. Supports weekly, bi-weekly, and monthly patterns.
   * 
   * @param id - Source event ID (UUID)
   * @body recurrencePattern - 'weekly', 'bi-weekly', or 'monthly'
   * @body startDate - Start of date range (YYYY-MM-DD)
   * @body endDate - End of date range (YYYY-MM-DD)
   * @body startTime - Override start time for all events (HH:MM)
   * @body endTime - Override end time for all events (HH:MM)
   * @body skipConflicts - Skip dates with existing events at same venue
   * 
   * @returns {object} Summary with created events and any failures
   */
  fastify.post('/:id/duplicate/bulk', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(bulkDuplicateSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof bulkDuplicateSchema>;

    const result = await eventDuplicationService.bulkDuplicateEvent(
      id,
      {
        recurrencePattern: input.recurrencePattern,
        startDate: input.startDate,
        endDate: input.endDate,
        startTime: input.startTime,
        endTime: input.endTime,
        skipConflicts: input.skipConflicts,
      },
      request.user?.id
    );

    // If all failed with validation errors, return 400
    if (result.successCount === 0 && result.failureCount > 0) {
      const firstFailure = result.failures[0];
      if (firstFailure?.code === 'VALIDATION_ERROR') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: firstFailure.reason,
          },
          data: result,
        });
      }
    }

    // Return 201 if any events were created, 200 otherwise
    const statusCode = result.successCount > 0 ? 201 : 200;

    return reply.status(statusCode).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /events/:id/duplicate/preview - Preview bulk duplication dates
   * 
   * Returns the dates that would be generated for a bulk duplication
   * without actually creating any events. Useful for UI preview.
   * 
   * @param id - Source event ID (UUID)
   * @query recurrencePattern - 'weekly', 'bi-weekly', or 'monthly'
   * @query startDate - Start of date range (YYYY-MM-DD)
   * @query endDate - End of date range (YYYY-MM-DD)
   * @query skipConflicts - Check for conflicts at same venue
   * 
   * @returns {object} Preview of dates, conflicts, and past dates
   */
  fastify.get('/:id/duplicate/preview', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateQuery(previewQuerySchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as z.infer<typeof previewQuerySchema>;

    const preview = await eventDuplicationService.previewBulkDuplication(
      id,
      {
        recurrencePattern: query.recurrencePattern,
        startDate: query.startDate,
        endDate: query.endDate,
        skipConflicts: query.skipConflicts,
      }
    );

    return {
      success: true,
      data: {
        totalDates: preview.dates.length,
        dates: preview.dates,
        conflicts: preview.conflicts,
        conflictCount: preview.conflicts.length,
        pastDates: preview.pastDates,
        pastDateCount: preview.pastDates.length,
        validCount: preview.dates.length - preview.conflicts.length,
      },
    };
  });
}
