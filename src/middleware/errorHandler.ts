import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

/**
 * Global error handler for Fastify
 */
export function errorHandler(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // Log the error
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        code: 'code' in error ? error.code : undefined,
      },
      request: {
        method: request.method,
        url: request.url,
        userId: request.user?.id,
      },
    },
    'Request error'
  );

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.flatten(),
      },
    });
    return;
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.validation,
      },
    });
    return;
  }

  // Handle known app errors
  if ('statusCode' in error && error.statusCode) {
    reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message,
        details: env.NODE_ENV === 'development' ? error.details : undefined,
      },
    });
    return;
  }

  // Handle unknown errors
  reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message,
      details: env.NODE_ENV === 'development' ? error.stack : undefined,
    },
  });
}

/**
 * Create a custom application error
 */
export function createError(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

// Common error factories
export const errors = {
  notFound: (resource: string) =>
    createError(404, 'NOT_FOUND', `${resource} not found`),
  
  badRequest: (message: string, details?: unknown) =>
    createError(400, 'BAD_REQUEST', message, details),
  
  unauthorized: (message = 'Authentication required') =>
    createError(401, 'UNAUTHORIZED', message),
  
  forbidden: (message = 'Access denied') =>
    createError(403, 'FORBIDDEN', message),
  
  conflict: (message: string) =>
    createError(409, 'CONFLICT', message),
  
  internal: (message = 'Internal server error') =>
    createError(500, 'INTERNAL_ERROR', message),
};
