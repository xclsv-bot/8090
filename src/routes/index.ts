import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';

/**
 * Register all routes
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check routes (no prefix)
  await fastify.register(healthRoutes);

  // API v1 routes will be added here as features are built
  // await fastify.register(userRoutes, { prefix: '/api/v1/users' });
  // await fastify.register(eventRoutes, { prefix: '/api/v1/events' });
  // etc.

  // Root endpoint
  fastify.get('/', async () => {
    return {
      success: true,
      data: {
        name: 'XCLSV Core Platform',
        version: process.env.npm_package_version || '1.0.0',
        documentation: '/documentation',
      },
    };
  });
}
