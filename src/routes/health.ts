import { type FastifyInstance, type FastifyReply } from 'fastify';
import { Socket } from 'node:net';
import { env } from '../config/env.js';
import { checkDatabaseHealth, getPoolStats } from '../db/connection-pool.js';
import { metricsService } from '../services/metricsService.js';
import { alertService } from '../services/alertService.js';

const VERSION = process.env.npm_package_version || '1.0.0';
const HEALTH_TIMEOUT_MS = 2_000;

type ServiceState = 'up' | 'down';

interface ServiceCheckResult {
  status: ServiceState;
  latencyMs: number;
  message?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
}

async function checkDatabase(timeoutMs = HEALTH_TIMEOUT_MS): Promise<ServiceCheckResult> {
  const startedAt = Date.now();

  try {
    const healthy = await withTimeout(
      checkDatabaseHealth(timeoutMs),
      timeoutMs,
      'Database health check timeout'
    );

    return {
      status: healthy ? 'up' : 'down',
      latencyMs: Date.now() - startedAt,
      message: healthy ? undefined : 'Database health check failed',
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Unknown database health error',
    };
  }
}

function parseRedisConnection(redisUrl: string): { host: string; port: number; password?: string } {
  const parsedUrl = new URL(redisUrl);
  return {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || '6379'),
    password: parsedUrl.password || undefined,
  };
}

async function checkRedis(timeoutMs = HEALTH_TIMEOUT_MS): Promise<ServiceCheckResult> {
  const startedAt = Date.now();

  try {
    const redisConnection = parseRedisConnection(env.REDIS_URL);

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const socket = new Socket();
        socket.setNoDelay(true);
        let hasAuthenticated = !redisConnection.password;
        let buffer = '';

        const finish = (error?: Error) => {
          socket.removeAllListeners();
          socket.destroy();

          if (error) {
            reject(error);
            return;
          }

          resolve();
        };

        socket.once('error', (error) => {
          finish(error);
        });

        socket.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const responses = buffer.split('\r\n');
          buffer = responses.pop() ?? '';

          for (const response of responses) {
            if (!response) {
              continue;
            }

            if (!hasAuthenticated && response.startsWith('+OK')) {
              hasAuthenticated = true;
              continue;
            }

            if (response.startsWith('+PONG')) {
              finish();
              return;
            }

            if (response.startsWith('-')) {
              finish(new Error(`Redis error response: ${response}`));
              return;
            }
          }
        });

        socket.connect(redisConnection.port, redisConnection.host, () => {
          if (redisConnection.password) {
            const authPayload = `*2\\r\\n$4\\r\\nAUTH\\r\\n$${redisConnection.password.length}\\r\\n${redisConnection.password}\\r\\n`;
            socket.write(authPayload);
          }

          socket.write('*1\\r\\n$4\\r\\nPING\\r\\n');
        });
      }),
      timeoutMs,
      'Redis health check timeout'
    );

    return {
      status: 'up',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Unknown redis health error',
    };
  }
}

function sendUnavailable(reply: FastifyReply, message: string, details?: Record<string, unknown>) {
  return reply.status(503).send({
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message,
      details,
    },
  });
}

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  const getSystemStats = () => {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    return {
      memory: {
        rssBytes: memory.rss,
        heapTotalBytes: memory.heapTotal,
        heapUsedBytes: memory.heapUsed,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers,
      },
      cpu: {
        userMicroseconds: cpu.user,
        systemMicroseconds: cpu.system,
      },
      uptimeSeconds: process.uptime(),
    };
  };

  fastify.get('/health', async (_request, reply) => {
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);

    const status = database.status === 'up' && redis.status === 'up' ? 'healthy' : 'degraded';
    const poolStats = getPoolStats();

    if (status !== 'healthy') {
      reply.status(503);
    }

    return {
      success: true,
      data: {
        status,
        timestamp: new Date().toISOString(),
        version: VERSION,
        environment: env.NODE_ENV,
        services: {
          database,
          redis,
        },
        system: getSystemStats(),
        databasePool: {
          max: poolStats.max,
          total: poolStats.totalCount,
          idle: poolStats.idleCount,
          waiting: poolStats.waitingCount,
          totalConnectionsCreated: poolStats.totalConnectionsCreated,
          totalConnectionsRemoved: poolStats.totalConnectionsRemoved,
          totalPoolErrors: poolStats.totalPoolErrors,
        },
      },
    };
  });

  fastify.get('/health/metrics', async (request, reply) => {
    const acceptHeader = request.headers.accept;
    const wantsPrometheus = typeof acceptHeader === 'string' && acceptHeader.includes('text/plain');

    if (wantsPrometheus) {
      reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
      return reply.send(metricsService.toPrometheusFormat());
    }

    return {
      success: true,
      data: {
        metrics: metricsService.getSnapshot(),
        activeAlerts: alertService.getActiveAlerts(),
        alertHistory: alertService.getHistory(25),
      },
    };
  });

  fastify.get('/health/ready', async (_request, reply) => {
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);

    const ready = database.status === 'up' && redis.status === 'up';

    if (!ready) {
      return sendUnavailable(reply, 'Service is not ready to receive traffic', {
        database,
        redis,
      });
    }

    return {
      success: true,
      data: {
        ready: true,
        timestamp: new Date().toISOString(),
        version: VERSION,
      },
    };
  });

  fastify.get('/health/live', async () => {
    return {
      success: true,
      data: {
        alive: true,
        timestamp: new Date().toISOString(),
        version: VERSION,
      },
    };
  });

  // Backward-compatible aliases
  fastify.get('/ready', async (_request, reply) => {
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const ready = database.status === 'up' && redis.status === 'up';

    if (!ready) {
      return sendUnavailable(reply, 'Service is not ready to receive traffic', {
        database,
        redis,
      });
    }

    return {
      success: true,
      data: {
        ready: true,
        timestamp: new Date().toISOString(),
        version: VERSION,
      },
    };
  });

  fastify.get('/live', async () => {
    return {
      success: true,
      data: {
        alive: true,
        timestamp: new Date().toISOString(),
        version: VERSION,
      },
    };
  });
}
