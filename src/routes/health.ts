import { FastifyInstance } from 'fastify';
import { db } from '../services/database.js';
import { storage } from '../services/storage.js';
import type { HealthCheckResponse } from '../types/index.js';

// Read version from package.json at build time
const VERSION = process.env.npm_package_version || '1.0.0';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Basic health check - always returns OK if server is running
   */
  fastify.get('/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  });

  /**
   * Detailed health check - checks all services
   */
  fastify.get('/health/detailed', async () => {
    const [dbHealthy, storageHealthy] = await Promise.all([
      db.healthCheck(),
      storage.healthCheck(),
    ]);

    const allHealthy = dbHealthy && storageHealthy;
    const status = allHealthy ? 'healthy' : 'degraded';

    const response: HealthCheckResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: VERSION,
      services: {
        database: dbHealthy ? 'up' : 'down',
        storage: storageHealthy ? 'up' : 'down',
        auth: 'up', // Clerk is external, assume up if we're running
      },
    };

    return {
      success: true,
      data: response,
    };
  });

  /**
   * Database health check
   */
  fastify.get('/health/db', async (request, reply) => {
    const healthy = await db.healthCheck();

    if (!healthy) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'DB_UNHEALTHY',
          message: 'Database connection failed',
        },
      });
    }

    return {
      success: true,
      data: {
        status: 'up',
        timestamp: new Date().toISOString(),
      },
    };
  });

  /**
   * Storage health check
   */
  fastify.get('/health/storage', async (request, reply) => {
    const healthy = await storage.healthCheck();

    if (!healthy) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'STORAGE_UNHEALTHY',
          message: 'Storage service connection failed',
        },
      });
    }

    return {
      success: true,
      data: {
        status: 'up',
        timestamp: new Date().toISOString(),
      },
    };
  });

  /**
   * Readiness check for k8s/deployment
   */
  fastify.get('/ready', async (request, reply) => {
    const dbHealthy = await db.healthCheck();

    if (!dbHealthy) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'NOT_READY',
          message: 'Service is not ready',
        },
      });
    }

    return {
      success: true,
      data: { ready: true },
    };
  });

  /**
   * Liveness check for k8s/deployment
   */
  fastify.get('/live', async () => {
    return {
      success: true,
      data: { alive: true },
    };
  });
}
