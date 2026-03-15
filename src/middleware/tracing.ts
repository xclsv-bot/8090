import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_ID_HEADER = 'x-trace-id';

export interface TraceSpan {
  id: string;
  name: string;
  parentSpanId?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  attributes?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
  };
}

export interface TraceContext {
  correlationId: string;
  traceId: string;
  requestId?: string;
  startedAt: number;
  spans: TraceSpan[];
}

const traceStore = new AsyncLocalStorage<TraceContext>();

function getHeaderValue(request: FastifyRequest, headerName: string): string | undefined {
  const value = request.headers[headerName];

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim().length > 0) {
    return value[0].trim();
  }

  return undefined;
}

export function initializeTraceContext(request: FastifyRequest, reply: FastifyReply): TraceContext {
  const correlationId =
    getHeaderValue(request, CORRELATION_ID_HEADER) ||
    getHeaderValue(request, REQUEST_ID_HEADER) ||
    randomUUID();

  const traceId = getHeaderValue(request, TRACE_ID_HEADER) || randomUUID();

  const context: TraceContext = {
    correlationId,
    traceId,
    requestId: request.id,
    startedAt: Date.now(),
    spans: [],
  };

  traceStore.enterWith(context);

  reply.header('x-correlation-id', correlationId);
  reply.header('x-trace-id', traceId);

  return context;
}

export function getTraceContext(): TraceContext | undefined {
  return traceStore.getStore();
}

export function getCorrelationId(): string | undefined {
  return getTraceContext()?.correlationId;
}

export function startSpan(name: string, attributes?: Record<string, unknown>): TraceSpan {
  const context = getTraceContext();

  const span: TraceSpan = {
    id: randomUUID(),
    name,
    parentSpanId: context?.spans[context.spans.length - 1]?.id,
    startedAt: Date.now(),
    attributes,
  };

  context?.spans.push(span);
  return span;
}

export function finishSpan(span: TraceSpan, error?: unknown): TraceSpan {
  span.finishedAt = Date.now();
  span.durationMs = span.finishedAt - span.startedAt;

  if (error) {
    span.error = {
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined,
    };
  }

  return span;
}

export async function withSpan<T>(
  name: string,
  operation: () => Promise<T> | T,
  attributes?: Record<string, unknown>
): Promise<T> {
  const span = startSpan(name, attributes);

  try {
    const result = await operation();
    finishSpan(span);
    return result;
  } catch (error) {
    finishSpan(span, error);
    throw error;
  }
}

export function registerTracingHooks(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    initializeTraceContext(request, reply);
  });
}
