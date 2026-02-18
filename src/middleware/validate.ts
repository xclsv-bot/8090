import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, z } from 'zod';

/**
 * Create a validation middleware for request body
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.flatten(),
        },
      });
    }

    // Replace body with parsed/transformed data
    request.body = result.data;
  };
}

/**
 * Create a validation middleware for query parameters
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: result.error.flatten(),
        },
      });
    }

    request.query = result.data;
  };
}

/**
 * Create a validation middleware for URL parameters
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const result = schema.safeParse(request.params);

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid URL parameters',
          details: result.error.flatten(),
        },
      });
    }

    request.params = result.data;
  };
}

// Common validation schemas
export const commonSchemas = {
  id: z.object({
    id: z.string().uuid(),
  }),

  pagination: z.object({
    page: z.string().optional().default('1').transform(Number),
    limit: z.string().optional().default('20').transform(Number),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),

  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};
