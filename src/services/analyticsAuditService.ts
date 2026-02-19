/**
 * Analytics Audit Service
 * WO-71: Analytics Audit Log Infrastructure
 * Tracks all analytics operations for compliance and debugging
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  AnalyticsAuditLog,
  AuditAction,
  AuditResourceType,
  AuditLogQueryParams,
} from '../types/analytics.js';

interface AuditContext {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  apiEndpoint?: string;
  httpMethod?: string;
}

class AnalyticsAuditService {
  // ============================================
  // LOGGING OPERATIONS
  // ============================================

  /**
   * Log an analytics operation
   */
  async log(
    action: AuditAction,
    resourceType: AuditResourceType,
    resourceId: string | undefined,
    context: AuditContext,
    details?: {
      resourceName?: string;
      actionDetails?: Record<string, unknown>;
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
      durationMs?: number;
    }
  ): Promise<AnalyticsAuditLog> {
    const result = await db.queryOne<AnalyticsAuditLog>(
      `INSERT INTO analytics_audit_logs (
        user_id, user_email, user_role, ip_address, user_agent,
        action, resource_type, resource_id, resource_name,
        action_details, previous_state, new_state,
        request_id, api_endpoint, http_method,
        success, error_message, duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        context.userId,
        context.userEmail,
        context.userRole,
        context.ipAddress,
        context.userAgent,
        action,
        resourceType,
        resourceId,
        details?.resourceName,
        details?.actionDetails ? JSON.stringify(details.actionDetails) : null,
        details?.previousState ? JSON.stringify(details.previousState) : null,
        details?.newState ? JSON.stringify(details.newState) : null,
        context.requestId,
        context.apiEndpoint,
        context.httpMethod,
        details?.success ?? true,
        details?.errorMessage,
        details?.durationMs,
      ]
    );

    // Also log to application logger for immediate visibility
    const logData = {
      auditId: result?.id,
      action,
      resourceType,
      resourceId,
      userId: context.userId,
      success: details?.success ?? true,
    };

    if (details?.success === false) {
      logger.warn(logData, `Analytics audit: ${action} ${resourceType} failed`);
    } else {
      logger.info(logData, `Analytics audit: ${action} ${resourceType}`);
    }

    return this.mapAuditLogFromDb(result!);
  }

  /**
   * Log a snapshot creation
   */
  async logSnapshotCreated(
    snapshotId: string,
    snapshotDate: string,
    durationMs: number,
    context: AuditContext
  ): Promise<AnalyticsAuditLog> {
    return this.log('snapshot_created', 'snapshot', snapshotId, context, {
      resourceName: `Daily Snapshot ${snapshotDate}`,
      actionDetails: { snapshotDate },
      durationMs,
      success: true,
    });
  }

  /**
   * Log a threshold breach
   */
  async logThresholdBreach(
    thresholdId: string,
    kpiName: string,
    currentValue: number,
    thresholdValue: number,
    context: AuditContext
  ): Promise<AnalyticsAuditLog> {
    return this.log('threshold_breach', 'threshold', thresholdId, context, {
      resourceName: kpiName,
      actionDetails: { currentValue, thresholdValue, kpiName },
      success: true,
    });
  }

  /**
   * Log an alert triggered
   */
  async logAlertTriggered(
    alertId: string,
    kpiName: string,
    severity: string,
    context: AuditContext
  ): Promise<AnalyticsAuditLog> {
    return this.log('alert_triggered', 'alert', alertId, context, {
      resourceName: kpiName,
      actionDetails: { severity, kpiName },
      success: true,
    });
  }

  /**
   * Log a report export
   */
  async logReportExport(
    reportType: string,
    format: string,
    dateRange: { from: string; to: string },
    context: AuditContext
  ): Promise<AnalyticsAuditLog> {
    return this.log('export', 'report', undefined, context, {
      resourceName: `${reportType} Report`,
      actionDetails: { reportType, format, ...dateRange },
      success: true,
    });
  }

  /**
   * Log a KPI threshold change
   */
  async logThresholdChange(
    thresholdId: string,
    kpiName: string,
    previousState: Record<string, unknown>,
    newState: Record<string, unknown>,
    context: AuditContext
  ): Promise<AnalyticsAuditLog> {
    return this.log('update', 'threshold', thresholdId, context, {
      resourceName: kpiName,
      previousState,
      newState,
      success: true,
    });
  }

  /**
   * Log a dashboard view
   */
  async logDashboardView(
    dashboardType: string,
    filters: Record<string, unknown>,
    context: AuditContext
  ): Promise<AnalyticsAuditLog> {
    return this.log('view', 'dashboard', undefined, context, {
      resourceName: dashboardType,
      actionDetails: { filters },
      success: true,
    });
  }

  // ============================================
  // QUERY OPERATIONS
  // ============================================

  /**
   * Get audit logs with filtering
   */
  async getLogs(params: AuditLogQueryParams): Promise<{ logs: AnalyticsAuditLog[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(params.userId);
    }
    if (params.action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(params.action);
    }
    if (params.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      values.push(params.resourceType);
    }
    if (params.resourceId) {
      conditions.push(`resource_id = $${paramIndex++}`);
      values.push(params.resourceId);
    }
    if (params.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(params.fromDate);
    }
    if (params.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(params.toDate);
    }
    if (params.success !== undefined) {
      conditions.push(`success = $${paramIndex++}`);
      values.push(params.success);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [logsResult, countResult] = await Promise.all([
      db.queryMany<AnalyticsAuditLog>(
        `SELECT * FROM analytics_audit_logs ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit || 50, params.offset || 0]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM analytics_audit_logs ${whereClause}`,
        values
      ),
    ]);

    return {
      logs: logsResult.map(this.mapAuditLogFromDb),
      total: parseInt(countResult?.count || '0'),
    };
  }

  /**
   * Get recent audit activity for a user
   */
  async getUserActivity(userId: string, limit: number = 20): Promise<AnalyticsAuditLog[]> {
    const results = await db.queryMany<AnalyticsAuditLog>(
      `SELECT * FROM analytics_audit_logs 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return results.map(this.mapAuditLogFromDb);
  }

  /**
   * Get recent activity for a resource
   */
  async getResourceActivity(
    resourceType: AuditResourceType,
    resourceId: string,
    limit: number = 20
  ): Promise<AnalyticsAuditLog[]> {
    const results = await db.queryMany<AnalyticsAuditLog>(
      `SELECT * FROM analytics_audit_logs 
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY created_at DESC 
       LIMIT $3`,
      [resourceType, resourceId, limit]
    );
    return results.map(this.mapAuditLogFromDb);
  }

  /**
   * Get failed operations
   */
  async getFailedOperations(
    fromDate: string,
    toDate: string,
    limit: number = 50
  ): Promise<AnalyticsAuditLog[]> {
    const results = await db.queryMany<AnalyticsAuditLog>(
      `SELECT * FROM analytics_audit_logs 
       WHERE success = false AND created_at BETWEEN $1 AND $2
       ORDER BY created_at DESC 
       LIMIT $3`,
      [fromDate, toDate, limit]
    );
    return results.map(this.mapAuditLogFromDb);
  }

  /**
   * Get audit summary statistics
   */
  async getAuditSummary(fromDate: string, toDate: string): Promise<{
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    byAction: Record<string, number>;
    byResourceType: Record<string, number>;
    uniqueUsers: number;
    avgDurationMs: number;
  }> {
    const result = await db.queryOne<{
      total: string;
      successful: string;
      failed: string;
      unique_users: string;
      avg_duration: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as successful,
        COUNT(*) FILTER (WHERE success = false) as failed,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration
       FROM analytics_audit_logs 
       WHERE created_at BETWEEN $1 AND $2`,
      [fromDate, toDate]
    );

    const [byAction, byResourceType] = await Promise.all([
      db.queryMany<{ action: string; count: string }>(
        `SELECT action, COUNT(*) as count 
         FROM analytics_audit_logs 
         WHERE created_at BETWEEN $1 AND $2
         GROUP BY action`,
        [fromDate, toDate]
      ),
      db.queryMany<{ resource_type: string; count: string }>(
        `SELECT resource_type, COUNT(*) as count 
         FROM analytics_audit_logs 
         WHERE created_at BETWEEN $1 AND $2
         GROUP BY resource_type`,
        [fromDate, toDate]
      ),
    ]);

    return {
      totalOperations: parseInt(result?.total || '0'),
      successfulOperations: parseInt(result?.successful || '0'),
      failedOperations: parseInt(result?.failed || '0'),
      byAction: Object.fromEntries(byAction.map((r) => [r.action, parseInt(r.count)])),
      byResourceType: Object.fromEntries(byResourceType.map((r) => [r.resource_type, parseInt(r.count)])),
      uniqueUsers: parseInt(result?.unique_users || '0'),
      avgDurationMs: parseFloat(result?.avg_duration || '0'),
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private mapAuditLogFromDb(row: any): AnalyticsAuditLog {
    return {
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      userRole: row.user_role,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      resourceName: row.resource_name,
      actionDetails: typeof row.action_details === 'string'
        ? JSON.parse(row.action_details)
        : row.action_details,
      previousState: typeof row.previous_state === 'string'
        ? JSON.parse(row.previous_state)
        : row.previous_state,
      newState: typeof row.new_state === 'string'
        ? JSON.parse(row.new_state)
        : row.new_state,
      requestId: row.request_id,
      apiEndpoint: row.api_endpoint,
      httpMethod: row.http_method,
      success: row.success,
      errorMessage: row.error_message,
      durationMs: row.duration_ms ? parseInt(row.duration_ms) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

export const analyticsAuditService = new AnalyticsAuditService();
