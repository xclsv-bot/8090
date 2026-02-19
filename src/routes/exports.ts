/**
 * Export Routes
 * WO-75: Analytics Reporting and Export Functionality
 * 
 * API endpoints for:
 * - Report exports (CSV, Excel, PDF)
 * - Export templates management
 * - Scheduled exports
 * - Weekly digest subscriptions
 * - Export audit history
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exportService } from '../services/exportService.js';
import { weeklyDigestJob } from '../jobs/weeklyDigestJob.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery, validateBody } from '../middleware/validate.js';
import type { AuthUser } from '../types/index.js';

/**
 * Get authenticated user from request
 */
function getAuthUser(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw new Error('User not authenticated');
  }
  return request.user;
}

// ============================================
// SCHEMAS
// ============================================

const exportFiltersSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  region: z.string().optional(),
  operatorId: z.coerce.number().optional(),
  eventId: z.string().uuid().optional(),
  ambassadorId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(10000).optional(),
  offset: z.coerce.number().min(0).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const exportRequestSchema = z.object({
  reportType: z.enum([
    'signups',
    'event_performance',
    'ambassador_productivity',
    'financial',
    'validation',
    'operator_performance',
    'weekly_digest',
    'kpi_summary',
    'custom',
  ]),
  format: z.enum(['csv', 'excel', 'pdf']),
  filters: exportFiltersSchema,
  templateId: z.string().uuid().optional(),
  deliveryMethod: z.enum(['download', 'email', 'scheduled']).optional(),
  deliveryEmail: z.string().email().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  templateType: z.enum([
    'executive_summary',
    'operational_report',
    'financial_report',
    'performance_review',
    'custom',
  ]),
  reportTypes: z.array(
    z.enum([
      'signups',
      'event_performance',
      'ambassador_productivity',
      'financial',
      'validation',
      'operator_performance',
      'kpi_summary',
    ])
  ),
  defaultFilters: exportFiltersSchema.partial().optional(),
  sections: z.array(
    z.object({
      title: z.string(),
      type: z.enum(['summary', 'table', 'chart', 'text', 'metrics']),
      dataSource: z.string(),
      order: z.number(),
      visible: z.boolean().default(true),
    })
  ),
  headerConfig: z
    .object({
      showLogo: z.boolean().default(true),
      logoUrl: z.string().url().optional(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      showDate: z.boolean().default(true),
      showPeriod: z.boolean().default(true),
    })
    .optional(),
  footerConfig: z
    .object({
      showPageNumbers: z.boolean().default(true),
      showTimestamp: z.boolean().default(true),
      customText: z.string().optional(),
    })
    .optional(),
  isPublic: z.boolean().default(false),
  allowedRoles: z.array(z.string()).optional(),
});

const createScheduledExportSchema = z.object({
  name: z.string().min(1).max(100),
  cronExpression: z.string(),
  timezone: z.string().default('America/New_York'),
  reportType: z.enum([
    'signups',
    'event_performance',
    'ambassador_productivity',
    'financial',
    'validation',
    'operator_performance',
    'kpi_summary',
  ]),
  format: z.enum(['csv', 'excel', 'pdf']),
  templateId: z.string().uuid().optional(),
  filters: exportFiltersSchema,
  recipients: z.array(
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
      role: z.string().optional(),
    })
  ),
  emailSubject: z.string().max(200).optional(),
  emailBody: z.string().max(2000).optional(),
});

const subscribeDigestSchema = z.object({
  email: z.string().email(),
  deliveryDay: z.number().min(0).max(6).optional(),
  deliveryHour: z.number().min(0).max(23).optional(),
  timezone: z.string().optional(),
  includeSections: z.array(z.string()).optional(),
  format: z.enum(['html', 'pdf', 'both']).optional(),
});

const updateDigestPreferencesSchema = z.object({
  deliveryDay: z.number().min(0).max(6).optional(),
  deliveryHour: z.number().min(0).max(23).optional(),
  timezone: z.string().optional(),
  includeSections: z.array(z.string()).optional(),
  format: z.enum(['html', 'pdf', 'both']).optional(),
});

// ============================================
// ROUTES
// ============================================

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ============================================
  // EXPORT ENDPOINTS
  // ============================================

  /**
   * POST /exports - Create a new export
   * AC-AR-009.1: Provide export action from any analytics view
   * AC-AR-009.2: Support CSV, Excel, PDF formats
   * AC-AR-009.6: Generate file and provide download link
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(exportRequestSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof exportRequestSchema>;
    const user = getAuthUser(request);

    const result = await exportService.export(
      body.reportType,
      body.format,
      body.filters,
      {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        ipAddress: request.ip,
      },
      body.templateId
    );

    // Set appropriate headers for download
    reply.header('Content-Type', result.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${result.fileName}"`);

    return result.content;
  });

  /**
   * GET /exports/:reportType - Quick export with query parameters
   * AC-AR-009.3: Include all data respecting active filters
   */
  fastify.get<{
    Params: { reportType: string };
    Querystring: {
      format: string;
      from: string;
      to: string;
      region?: string;
      operatorId?: number;
      eventId?: string;
      ambassadorId?: string;
      status?: string;
    };
  }>('/:reportType', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(z.object({
      format: z.enum(['csv', 'excel', 'pdf']).default('csv'),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      region: z.string().optional(),
      operatorId: z.coerce.number().optional(),
      eventId: z.string().optional(),
      ambassadorId: z.string().optional(),
      status: z.string().optional(),
    }))],
  }, async (request, reply) => {
    const { reportType } = request.params;
    const query = request.query;
    const user = getAuthUser(request);

    const filters = {
      fromDate: query.from,
      toDate: query.to,
      region: query.region,
      operatorId: query.operatorId,
      eventId: query.eventId,
      ambassadorId: query.ambassadorId,
      status: query.status,
    };

    const result = await exportService.export(
      reportType as any,
      query.format as any,
      filters,
      {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        ipAddress: request.ip,
      }
    );

    reply.header('Content-Type', result.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${result.fileName}"`);

    return result.content;
  });

  /**
   * GET /exports/history - Get export audit history
   */
  fastify.get('/history', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { limit } = request.query as { limit?: number };
    const user = getAuthUser(request);

    // Admins see all, managers see their own
    const userId = user.role === 'admin' ? undefined : user.id;

    const history = await exportService.getExportHistory(userId, limit);
    return { success: true, data: history };
  });

  /**
   * GET /exports/stats - Get export statistics
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin'), validateQuery(z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const stats = await exportService.getExportStats(from, to);
    return { success: true, data: stats };
  });

  // ============================================
  // TEMPLATE ENDPOINTS
  // ============================================

  /**
   * GET /exports/templates - List report templates
   */
  fastify.get('/templates', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const user = getAuthUser(request);
    const templates = await exportService.listTemplates(user.role);
    return { success: true, data: templates };
  });

  /**
   * GET /exports/templates/:id - Get template by ID
   */
  fastify.get<{ Params: { id: string } }>('/templates/:id', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request, reply) => {
    const { id } = request.params;
    const template = await exportService.getTemplate(id);

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    return { success: true, data: template };
  });

  /**
   * POST /exports/templates - Create a new template
   */
  fastify.post('/templates', {
    preHandler: [requireRole('admin'), validateBody(createTemplateSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createTemplateSchema>;
    const user = getAuthUser(request);

    const template = await exportService.createTemplate(
      {
        name: body.name,
        description: body.description,
        templateType: body.templateType,
        reportTypes: body.reportTypes,
        defaultFilters: body.defaultFilters,
        sections: body.sections.map((s, i) => ({
          id: `section-${i}`,
          ...s,
          dataSource: s.dataSource as any,
        })),
        headerConfig: body.headerConfig,
        footerConfig: body.footerConfig,
        isPublic: body.isPublic,
        allowedRoles: body.allowedRoles,
      },
      user.id
    );

    return reply.status(201).send({ success: true, data: template });
  });

  // ============================================
  // SCHEDULED EXPORT ENDPOINTS
  // ============================================

  /**
   * GET /exports/scheduled - List scheduled exports
   */
  fastify.get('/scheduled', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const user = getAuthUser(request);
    const userId = user.role === 'admin' ? undefined : user.id;
    const scheduled = await exportService.listScheduledExports(userId);
    return { success: true, data: scheduled };
  });

  /**
   * POST /exports/scheduled - Create a scheduled export
   */
  fastify.post('/scheduled', {
    preHandler: [requireRole('admin'), validateBody(createScheduledExportSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createScheduledExportSchema>;
    const user = getAuthUser(request);

    const scheduled = await exportService.createScheduledExport(
      {
        name: body.name,
        cronExpression: body.cronExpression,
        timezone: body.timezone,
        isActive: true,
        reportType: body.reportType,
        format: body.format,
        templateId: body.templateId,
        filters: body.filters,
        recipients: body.recipients,
        emailSubject: body.emailSubject,
        emailBody: body.emailBody,
        createdBy: user.id,
      },
      user.id
    );

    return reply.status(201).send({ success: true, data: scheduled });
  });

  // ============================================
  // WEEKLY DIGEST ENDPOINTS
  // ============================================

  /**
   * GET /exports/digest/subscription - Get user's digest subscription
   */
  fastify.get('/digest/subscription', async (request) => {
    const user = getAuthUser(request);
    const subscription = await weeklyDigestJob.getSubscriptionStatus(user.id);
    return { success: true, data: subscription };
  });

  /**
   * POST /exports/digest/subscribe - Subscribe to weekly digest
   */
  fastify.post('/digest/subscribe', {
    preHandler: [validateBody(subscribeDigestSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof subscribeDigestSchema>;
    const user = getAuthUser(request);

    const subscription = await weeklyDigestJob.subscribeToDigest({
      userId: user.id,
      email: body.email,
      deliveryDay: body.deliveryDay,
      deliveryHour: body.deliveryHour,
      timezone: body.timezone,
      includeSections: body.includeSections,
      format: body.format,
    });

    return reply.status(201).send({ success: true, data: subscription });
  });

  /**
   * PUT /exports/digest/preferences - Update digest preferences
   */
  fastify.put('/digest/preferences', {
    preHandler: [validateBody(updateDigestPreferencesSchema)],
  }, async (request) => {
    const body = request.body as z.infer<typeof updateDigestPreferencesSchema>;
    const user = getAuthUser(request);

    const subscription = await weeklyDigestJob.updateSubscriptionPreferences(user.id, body);
    return { success: true, data: subscription };
  });

  /**
   * DELETE /exports/digest/subscription - Unsubscribe from digest
   */
  fastify.delete('/digest/subscription', async (request) => {
    const user = getAuthUser(request);
    await weeklyDigestJob.unsubscribeFromDigest(user.id);
    return { success: true, data: { unsubscribed: true } };
  });

  /**
   * GET /exports/digest/preview - Preview weekly digest
   */
  fastify.get('/digest/preview', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const preview = await weeklyDigestJob.previewDigest();
    return { success: true, data: preview };
  });

  /**
   * POST /exports/digest/send - Manually send digest to email
   */
  fastify.post('/digest/send', {
    preHandler: [requireRole('admin'), validateBody(z.object({
      email: z.string().email(),
      format: z.enum(['html', 'pdf', 'both']).optional(),
    }))],
  }, async (request) => {
    const { email, format } = request.body as { email: string; format?: 'html' | 'pdf' | 'both' };
    const result = await weeklyDigestJob.sendDigestToEmail(email, format);
    return { success: true, data: result };
  });

  /**
   * GET /exports/digest/subscribers - List all digest subscribers (admin only)
   */
  fastify.get('/digest/subscribers', {
    preHandler: [requireRole('admin')],
  }, async () => {
    const subscribers = await weeklyDigestJob.getActiveSubscribers();
    return { success: true, data: subscribers };
  });

  /**
   * POST /exports/digest/run - Manually trigger digest job (admin only)
   */
  fastify.post('/digest/run', {
    preHandler: [requireRole('admin')],
  }, async () => {
    const result = await weeklyDigestJob.runWeeklyDigestJob();
    return { success: true, data: result };
  });
}
