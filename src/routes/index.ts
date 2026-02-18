import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { websocketRoutes } from './websocket.js';
import { ambassadorRoutes } from './ambassadors.js';
import { eventRoutes } from './events.js';
import { assignmentRoutes } from './assignments.js';
import { availabilityRoutes } from './availability.js';
import { chatRoutes } from './chat.js';
import { cpaRoutes } from './cpa.js';

/**
 * Register all routes
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check routes (no prefix)
  await fastify.register(healthRoutes);

  // WebSocket routes
  await fastify.register(websocketRoutes);

  // API v1 routes
  await fastify.register(ambassadorRoutes, { prefix: '/api/v1/ambassadors' });
  await fastify.register(eventRoutes, { prefix: '/api/v1/events' });
  await fastify.register(assignmentRoutes, { prefix: '/api/v1/assignments' });
  await fastify.register(availabilityRoutes, { prefix: '/api/v1/availability' });
  await fastify.register(chatRoutes, { prefix: '/api/v1/chat' });
  await fastify.register(cpaRoutes, { prefix: '/api/v1/cpa' });

  // Root endpoint
  fastify.get('/', async () => {
    return {
      success: true,
      data: {
        name: 'XCLSV Core Platform',
        version: process.env.npm_package_version || '1.0.0',
        documentation: '/documentation',
        websocket: '/ws',
      },
    };
  });
}
