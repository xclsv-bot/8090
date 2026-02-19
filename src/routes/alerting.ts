/**
 * Alerting Routes
 * WO-74: KPI Management and Alerting System
 * API endpoints for threshold management, alerts, and digest generation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { kpiAlertService } from '../services/kpiAlertService.js';
import { weeklyDigestService } from '../services/weeklyDigestService.js';
import { analyticsAuditService } from '../services/analyticsAuditService.js';
import { logger } from '../utils/logger.js';
import type {
  CreateKPIThresholdInput,
  UpdateKPIThresholdInput,
  AlertQueryParams,
  KPIAlertSeverity,
  KPIAlertStatus,
  KPICategory,
} from '../types/analytics.js';

// ============================================
// REQUEST SCHEMAS
// ============================================

interface ThresholdParams {
  id: string;
}

interface AlertParams {
  alertId: string;
}

interface CreateThresholdBody extends CreateKPIThresholdInput {}

interface UpdateThresholdBody extends UpdateKPIThresholdInput {}

interface AlertQuerystring {
  status?: KPIAlertStatus;
  severity?: KPIAlertSeverity;
  kpiCategory?: KPICategory;
  kpiName?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

interface AcknowledgeAlertBody {
  notes?: string;
}

interface ResolveAlertBody {
  resolutionNotes: string;
}

interface SnoozeAlertBody {
  durationMinutes: number;
}

interface DigestQuerystring {
  format?: 'json' | 'text' | 'html';
  date?: string;
}

interface CheckThresholdsBody {
  metrics: Record<string, number>;
  snapshotId?: string;
  snapshotDate?: string;
}

// ============================================
// ROUTES
// ============================================

export async function alertingRoutes(fastify: FastifyInstance): Promise<void> {
  // Extract audit context from request
  const getAuditContext = (request: FastifyRequest) => ({
    userId: (request as any).user?.id,
    userEmail: (request as any).user?.email,
    userRole: (request as any).user?.role,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: request.id,
    apiEndpoint: request.url,
    httpMethod: request.method,
  });

  // ============================================
  // THRESHOLD MANAGEMENT
  // ============================================

  /**
   * GET /thresholds - List all thresholds
   */
  fastify.get<{
    Querystring: { activeOnly?: boolean };
  }>('/thresholds', async (request, reply) => {
    const activeOnly = request.query.activeOnly !== false;
    const thresholds = await kpiAlertService.getThresholds(activeOnly);

    // Audit log
    await analyticsAuditService.log(
      'view',
      'threshold',
      undefined,
      getAuditContext(request),
      { resourceName: 'All Thresholds', actionDetails: { activeOnly, count: thresholds.length } }
    );

    return reply.send({
      success: true,
      data: thresholds,
      meta: { count: thresholds.length },
    });
  });

  /**
   * GET /thresholds/:id - Get single threshold
   */
  fastify.get<{
    Params: ThresholdParams;
  }>('/thresholds/:id', async (request, reply) => {
    const threshold = await kpiAlertService.getThreshold(request.params.id);

    if (!threshold) {
      return reply.code(404).send({
        success: false,
        error: 'Threshold not found',
      });
    }

    // Audit log
    await analyticsAuditService.log(
      'view',
      'threshold',
      threshold.id,
      getAuditContext(request),
      { resourceName: threshold.displayName }
    );

    return reply.send({
      success: true,
      data: threshold,
    });
  });

  /**
   * POST /thresholds - Create new threshold
   */
  fastify.post<{
    Body: CreateThresholdBody;
  }>('/thresholds', async (request, reply) => {
    const startTime = Date.now();

    try {
      const threshold = await kpiAlertService.createThreshold(request.body);

      // Audit log
      await analyticsAuditService.log(
        'create',
        'threshold',
        threshold.id,
        getAuditContext(request),
        {
          resourceName: threshold.displayName,
          newState: request.body as unknown as Record<string, unknown>,
          durationMs: Date.now() - startTime,
        }
      );

      logger.info({ thresholdId: threshold.id, kpiName: threshold.kpiName }, 'Threshold created via API');

      return reply.code(201).send({
        success: true,
        data: threshold,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await analyticsAuditService.log(
        'create',
        'threshold',
        undefined,
        getAuditContext(request),
        {
          resourceName: request.body.displayName,
          success: false,
          errorMessage,
          durationMs: Date.now() - startTime,
        }
      );

      throw error;
    }
  });

  /**
   * PATCH /thresholds/:id - Update threshold
   */
  fastify.patch<{
    Params: ThresholdParams;
    Body: UpdateThresholdBody;
  }>('/thresholds/:id', async (request, reply) => {
    const startTime = Date.now();

    // Get previous state for audit
    const previousThreshold = await kpiAlertService.getThreshold(request.params.id);
    if (!previousThreshold) {
      return reply.code(404).send({
        success: false,
        error: 'Threshold not found',
      });
    }

    const threshold = await kpiAlertService.updateThreshold(request.params.id, request.body);

    // Audit log with previous state
    await analyticsAuditService.logThresholdChange(
      threshold.id,
      threshold.kpiName,
      previousThreshold as unknown as Record<string, unknown>,
      threshold as unknown as Record<string, unknown>,
      getAuditContext(request)
    );

    logger.info({ thresholdId: threshold.id, changes: Object.keys(request.body) }, 'Threshold updated via API');

    return reply.send({
      success: true,
      data: threshold,
    });
  });

  /**
   * DELETE /thresholds/:id - Delete threshold
   */
  fastify.delete<{
    Params: ThresholdParams;
  }>('/thresholds/:id', async (request, reply) => {
    const threshold = await kpiAlertService.getThreshold(request.params.id);
    if (!threshold) {
      return reply.code(404).send({
        success: false,
        error: 'Threshold not found',
      });
    }

    await kpiAlertService.deleteThreshold(request.params.id);

    // Audit log
    await analyticsAuditService.log(
      'delete',
      'threshold',
      request.params.id,
      getAuditContext(request),
      {
        resourceName: threshold.displayName,
        previousState: threshold as unknown as Record<string, unknown>,
      }
    );

    logger.info({ thresholdId: request.params.id }, 'Threshold deleted via API');

    return reply.send({
      success: true,
      message: 'Threshold deleted successfully',
    });
  });

  /**
   * POST /thresholds/:id/activate - Activate threshold
   */
  fastify.post<{
    Params: ThresholdParams;
  }>('/thresholds/:id/activate', async (request, reply) => {
    const threshold = await kpiAlertService.updateThreshold(request.params.id, { isActive: true });

    await analyticsAuditService.log(
      'update',
      'threshold',
      threshold.id,
      getAuditContext(request),
      { resourceName: threshold.displayName, actionDetails: { action: 'activate' } }
    );

    return reply.send({
      success: true,
      data: threshold,
      message: 'Threshold activated',
    });
  });

  /**
   * POST /thresholds/:id/deactivate - Deactivate threshold
   */
  fastify.post<{
    Params: ThresholdParams;
  }>('/thresholds/:id/deactivate', async (request, reply) => {
    const threshold = await kpiAlertService.updateThreshold(request.params.id, { isActive: false });

    await analyticsAuditService.log(
      'update',
      'threshold',
      threshold.id,
      getAuditContext(request),
      { resourceName: threshold.displayName, actionDetails: { action: 'deactivate' } }
    );

    return reply.send({
      success: true,
      data: threshold,
      message: 'Threshold deactivated',
    });
  });

  // ============================================
  // ALERT MANAGEMENT
  // ============================================

  /**
   * GET /alerts - List alerts with filtering
   */
  fastify.get<{
    Querystring: AlertQuerystring;
  }>('/alerts', async (request, reply) => {
    const params: AlertQueryParams = {
      status: request.query.status,
      severity: request.query.severity,
      kpiCategory: request.query.kpiCategory,
      kpiName: request.query.kpiName,
      fromDate: request.query.fromDate,
      toDate: request.query.toDate,
      limit: request.query.limit || 50,
      offset: request.query.offset || 0,
    };

    const { alerts, total } = await kpiAlertService.getAlerts(params);

    return reply.send({
      success: true,
      data: alerts,
      meta: {
        total,
        limit: params.limit,
        offset: params.offset,
        hasMore: (params.offset || 0) + alerts.length < total,
      },
    });
  });

  /**
   * GET /alerts/active - Get active alerts only
   */
  fastify.get('/alerts/active', async (request, reply) => {
    const alerts = await kpiAlertService.getActiveAlerts();

    return reply.send({
      success: true,
      data: alerts,
      meta: { count: alerts.length },
    });
  });

  /**
   * GET /alerts/summary - Get alert summary statistics
   */
  fastify.get('/alerts/summary', async (request, reply) => {
    const active = await kpiAlertService.getActiveAlerts();
    
    const summary = {
      total: active.length,
      bySeverity: {
        critical: active.filter(a => a.alertSeverity === 'critical').length,
        warning: active.filter(a => a.alertSeverity === 'warning').length,
        info: active.filter(a => a.alertSeverity === 'info').length,
      },
      byCategory: {} as Record<string, number>,
      unacknowledged: active.filter(a => !a.acknowledgedAt).length,
      oldestUnresolved: active.length > 0 ? active[active.length - 1].createdAt : null,
    };

    // Count by category
    for (const alert of active) {
      summary.byCategory[alert.kpiCategory] = (summary.byCategory[alert.kpiCategory] || 0) + 1;
    }

    return reply.send({
      success: true,
      data: summary,
    });
  });

  /**
   * POST /alerts/:alertId/acknowledge - Acknowledge an alert
   */
  fastify.post<{
    Params: AlertParams;
    Body: AcknowledgeAlertBody;
  }>('/alerts/:alertId/acknowledge', async (request, reply) => {
    const userId = (request as any).user?.id || 'system';

    const alert = await kpiAlertService.acknowledgeAlert(
      request.params.alertId,
      userId,
      request.body.notes
    );

    await analyticsAuditService.log(
      'update',
      'alert',
      alert.id,
      getAuditContext(request),
      {
        resourceName: alert.kpiName,
        actionDetails: { action: 'acknowledge', notes: request.body.notes },
      }
    );

    return reply.send({
      success: true,
      data: alert,
      message: 'Alert acknowledged',
    });
  });

  /**
   * POST /alerts/:alertId/resolve - Resolve an alert
   */
  fastify.post<{
    Params: AlertParams;
    Body: ResolveAlertBody;
  }>('/alerts/:alertId/resolve', async (request, reply) => {
    const userId = (request as any).user?.id || 'system';

    if (!request.body.resolutionNotes) {
      return reply.code(400).send({
        success: false,
        error: 'Resolution notes are required',
      });
    }

    const alert = await kpiAlertService.resolveAlert(
      request.params.alertId,
      userId,
      request.body.resolutionNotes
    );

    await analyticsAuditService.log(
      'update',
      'alert',
      alert.id,
      getAuditContext(request),
      {
        resourceName: alert.kpiName,
        actionDetails: { action: 'resolve', resolutionNotes: request.body.resolutionNotes },
      }
    );

    return reply.send({
      success: true,
      data: alert,
      message: 'Alert resolved',
    });
  });

  /**
   * POST /alerts/:alertId/snooze - Snooze an alert
   */
  fastify.post<{
    Params: AlertParams;
    Body: SnoozeAlertBody;
  }>('/alerts/:alertId/snooze', async (request, reply) => {
    const userId = (request as any).user?.id || 'system';

    if (!request.body.durationMinutes || request.body.durationMinutes < 1) {
      return reply.code(400).send({
        success: false,
        error: 'Valid snooze duration is required',
      });
    }

    const alert = await kpiAlertService.snoozeAlert(
      request.params.alertId,
      userId,
      request.body.durationMinutes
    );

    await analyticsAuditService.log(
      'update',
      'alert',
      alert.id,
      getAuditContext(request),
      {
        resourceName: alert.kpiName,
        actionDetails: { action: 'snooze', durationMinutes: request.body.durationMinutes },
      }
    );

    return reply.send({
      success: true,
      data: alert,
      message: `Alert snoozed for ${request.body.durationMinutes} minutes`,
    });
  });

  /**
   * POST /alerts/reactivate-snoozed - Reactivate snoozed alerts past their time
   */
  fastify.post('/alerts/reactivate-snoozed', async (request, reply) => {
    const count = await kpiAlertService.reactivateSnoozedAlerts();

    return reply.send({
      success: true,
      data: { reactivatedCount: count },
      message: `${count} snoozed alerts reactivated`,
    });
  });

  /**
   * POST /alerts/check - Check thresholds against provided metrics
   */
  fastify.post<{
    Body: CheckThresholdsBody;
  }>('/alerts/check', async (request, reply) => {
    const snapshotDate = request.body.snapshotDate 
      ? new Date(request.body.snapshotDate)
      : undefined;

    const alerts = await kpiAlertService.checkThresholds(
      request.body.metrics,
      request.body.snapshotId,
      snapshotDate
    );

    // Log each triggered alert
    for (const alert of alerts) {
      await analyticsAuditService.logAlertTriggered(
        alert.id,
        alert.kpiName,
        alert.alertSeverity,
        getAuditContext(request)
      );
    }

    return reply.send({
      success: true,
      data: alerts,
      meta: {
        checkedMetrics: Object.keys(request.body.metrics).length,
        alertsGenerated: alerts.length,
      },
    });
  });

  // ============================================
  // WEEKLY DIGEST
  // ============================================

  /**
   * GET /digest/weekly - Generate weekly digest
   */
  fastify.get<{
    Querystring: DigestQuerystring;
  }>('/digest/weekly', async (request, reply) => {
    const forDate = request.query.date ? new Date(request.query.date) : undefined;
    const format = request.query.format || 'json';

    const digest = await weeklyDigestService.generateDigest(forDate);

    // Audit log
    await analyticsAuditService.log(
      'view',
      'report',
      undefined,
      getAuditContext(request),
      { resourceName: 'Weekly Digest', actionDetails: { format, forDate: forDate?.toISOString() } }
    );

    switch (format) {
      case 'text':
        reply.type('text/plain');
        return reply.send(weeklyDigestService.formatAsText(digest));

      case 'html':
        reply.type('text/html');
        return reply.send(weeklyDigestService.formatAsHtml(digest));

      default:
        return reply.send({
          success: true,
          data: digest,
        });
    }
  });

  /**
   * POST /digest/preview - Preview digest content
   */
  fastify.post<{
    Body: { date?: string };
  }>('/digest/preview', async (request, reply) => {
    const forDate = request.body.date ? new Date(request.body.date) : undefined;
    const digest = await weeklyDigestService.generateDigest(forDate);

    return reply.send({
      success: true,
      data: {
        json: digest,
        text: weeklyDigestService.formatAsText(digest),
        html: weeklyDigestService.formatAsHtml(digest),
      },
    });
  });

  // ============================================
  // THRESHOLD VERSIONING (WO-74)
  // ============================================

  /**
   * GET /thresholds/:id/versions - Get version history
   */
  fastify.get<{
    Params: ThresholdParams;
  }>('/thresholds/:id/versions', async (request, reply) => {
    const versions = await kpiAlertService.getThresholdVersions(request.params.id);

    return reply.send({
      success: true,
      data: versions,
      meta: { count: versions.length },
    });
  });

  /**
   * GET /thresholds/:id/versions/:version - Get specific version
   */
  fastify.get<{
    Params: { id: string; version: string };
  }>('/thresholds/:id/versions/:version', async (request, reply) => {
    const versionNumber = parseInt(request.params.version);
    const version = await kpiAlertService.getThresholdVersion(request.params.id, versionNumber);

    if (!version) {
      return reply.code(404).send({
        success: false,
        error: 'Version not found',
      });
    }

    return reply.send({
      success: true,
      data: version,
    });
  });

  /**
   * POST /thresholds/:id/rollback - Rollback to a previous version
   */
  fastify.post<{
    Params: ThresholdParams;
    Body: { targetVersion: number; reason?: string };
  }>('/thresholds/:id/rollback', async (request, reply) => {
    const userId = (request as any).user?.id;

    if (!request.body.targetVersion) {
      return reply.code(400).send({
        success: false,
        error: 'Target version is required',
      });
    }

    const threshold = await kpiAlertService.rollbackThreshold(
      request.params.id,
      request.body.targetVersion,
      userId,
      request.body.reason
    );

    // Audit log
    await analyticsAuditService.log(
      'update',
      'threshold',
      threshold.id,
      getAuditContext(request),
      {
        resourceName: threshold.displayName,
        actionDetails: {
          action: 'rollback',
          targetVersion: request.body.targetVersion,
          reason: request.body.reason,
        },
      }
    );

    return reply.send({
      success: true,
      data: threshold,
      message: `Rolled back to version ${request.body.targetVersion}`,
    });
  });

  /**
   * GET /thresholds/:id/versions/compare - Compare two versions
   */
  fastify.get<{
    Params: ThresholdParams;
    Querystring: { version1: string; version2: string };
  }>('/thresholds/:id/versions/compare', async (request, reply) => {
    const v1 = parseInt(request.query.version1);
    const v2 = parseInt(request.query.version2);

    if (!v1 || !v2) {
      return reply.code(400).send({
        success: false,
        error: 'Both version1 and version2 are required',
      });
    }

    const comparison = await kpiAlertService.compareVersions(request.params.id, v1, v2);

    return reply.send({
      success: true,
      data: comparison,
    });
  });

  /**
   * GET /thresholds/:id/at - Get threshold state at a specific time
   */
  fastify.get<{
    Params: ThresholdParams;
    Querystring: { timestamp: string };
  }>('/thresholds/:id/at', async (request, reply) => {
    if (!request.query.timestamp) {
      return reply.code(400).send({
        success: false,
        error: 'Timestamp is required',
      });
    }

    const atTime = new Date(request.query.timestamp);
    const version = await kpiAlertService.getThresholdAtTime(request.params.id, atTime);

    if (!version) {
      return reply.code(404).send({
        success: false,
        error: 'No version found for the specified time',
      });
    }

    return reply.send({
      success: true,
      data: version,
    });
  });
}
