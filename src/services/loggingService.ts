import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger.js';
import { getTraceContext } from '../middleware/tracing.js';
import { metricsService } from './metricsService.js';

const REDACTION_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
  'ssn',
  'creditCard',
]);

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};

    for (const [key, innerValue] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTION_KEYS.has(normalizeKey(key))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactValue(innerValue);
      }
    }

    return redacted;
  }

  return value;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    if ('code' in error) {
      serialized.code = (error as { code?: unknown }).code;
    }

    if ('statusCode' in error) {
      serialized.statusCode = (error as { statusCode?: unknown }).statusCode;
    }

    return serialized;
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    raw: redactValue(error),
  };
}

function buildRequestContext(request: FastifyRequest): Record<string, unknown> {
  const traceContext = getTraceContext();

  return {
    request: {
      id: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: request.user?.id,
    },
    trace: {
      correlationId: traceContext?.correlationId,
      traceId: traceContext?.traceId,
    },
  };
}

export class LoggingService {
  log(level: LogLevel, context: Record<string, unknown>, message: string): void {
    const safeContext = redactValue(context) as Record<string, unknown>;
    logger[level](safeContext, message);
  }

  logRequestStart(request: FastifyRequest): void {
    this.log('info', buildRequestContext(request), 'Incoming request');
  }

  logRequestEnd(request: FastifyRequest, reply: FastifyReply): void {
    const durationMs = reply.elapsedTime;

    this.log(
      'info',
      {
        ...buildRequestContext(request),
        response: {
          statusCode: reply.statusCode,
          durationMs,
        },
      },
      'Request completed'
    );

    metricsService.recordHttpRequest({
      method: request.method,
      route: request.routeOptions.url || request.url,
      statusCode: reply.statusCode,
      durationMs,
    });
  }

  logRequestError(request: FastifyRequest, error: unknown): void {
    this.log(
      'error',
      {
        ...buildRequestContext(request),
        error: serializeError(error),
      },
      'Request error'
    );
  }

  registerRequestLogging(app: FastifyInstance): void {
    app.addHook('onRequest', async (request) => {
      this.logRequestStart(request);
    });

    app.addHook('onResponse', async (request, reply) => {
      this.logRequestEnd(request, reply);
    });
  }
}

export const loggingService = new LoggingService();
export { redactValue as redactSensitiveData };
