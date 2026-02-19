import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { websocketRoutes } from './websocket.js';
import { ambassadorRoutes } from './ambassadors.js';
import { eventRoutes } from './events.js';
import { eventDuplicationRoutes } from './event-duplication.js';
import { assignmentRoutes } from './assignments.js';
import { availabilityRoutes } from './availability.js';
import { chatRoutes } from './chat.js';
import { cpaRoutes } from './cpa.js';
import { signupRoutes } from './signups.js';
import { extractionRoutes } from './extraction.js';
import { customerioRoutes } from './customerio.js';
import { payrollRoutes } from './payroll.js';
import { integrationRoutes } from './integrations.js';
import { financialRoutes } from './financial.js';
import { operatorRoutes } from './operators.js';
import { reportRoutes } from './reports.js';
import { analyticsRoutes } from './analytics.js';
import { performanceRoutes } from './performance.js';
import { dashboardRoutes } from './dashboard.js';
import { leaderboardRoutes } from './leaderboard.js';
import { adminRoutes } from './admin.js';
import { importRoutes } from './admin/imports/index.js';
import { alertingRoutes } from './alerting.js';
import { exportRoutes } from './exports.js';
import { supportHubRoutes } from './support-hub/index.js';
import oauthRoutes from './oauth.js';
import webhookRoutes from './webhooks.js';

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
  await fastify.register(eventDuplicationRoutes, { prefix: '/api/v1/events' });
  await fastify.register(assignmentRoutes, { prefix: '/api/v1/assignments' });
  await fastify.register(availabilityRoutes, { prefix: '/api/v1/availability' });
  await fastify.register(chatRoutes, { prefix: '/api/v1/chat' });
  await fastify.register(cpaRoutes, { prefix: '/api/v1/cpa' });
  await fastify.register(signupRoutes, { prefix: '/api/v1/signups' });
  await fastify.register(extractionRoutes, { prefix: '/api/v1/signups/extraction' });
  await fastify.register(customerioRoutes, { prefix: '/api/v1/signups/customerio' });
  await fastify.register(payrollRoutes, { prefix: '/api/v1/payroll' });
  await fastify.register(integrationRoutes, { prefix: '/api/v1/integrations' });
  await fastify.register(financialRoutes, { prefix: '/api/v1/financial' });
  await fastify.register(operatorRoutes, { prefix: '/api/v1/operators' });
  await fastify.register(reportRoutes, { prefix: '/api/v1/reports' });
  await fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
  await fastify.register(performanceRoutes, { prefix: '/api/v1/performance' });
  await fastify.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await fastify.register(leaderboardRoutes, { prefix: '/api/v1/leaderboard' });
  await fastify.register(adminRoutes, { prefix: '/api/v1/admin' });
  await fastify.register(importRoutes, { prefix: '/api/admin/imports' });
  await fastify.register(alertingRoutes, { prefix: '/api/v1/alerting' });
  await fastify.register(exportRoutes, { prefix: '/api/v1/exports' });
  await fastify.register(supportHubRoutes, { prefix: '/api/v1/support-hub' });
  await fastify.register(oauthRoutes, { prefix: '/api/v1/oauth' });
  await fastify.register(webhookRoutes, { prefix: '/api/v1/webhooks' });

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
