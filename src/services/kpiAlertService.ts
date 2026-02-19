/**
 * KPI Alert Service
 * WO-71: KPI Threshold Management and Alert Infrastructure
 * WO-74: Enhanced with Versioning and Alerting Management
 * Handles threshold configuration, breach detection, and alert management
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  KPIThreshold,
  KPIAlert,
  KPIAlertSeverity,
  KPIAlertStatus,
  ThresholdCondition,
  KPICategory,
  CreateKPIThresholdInput,
  UpdateKPIThresholdInput,
  AlertQueryParams,
  AlertContext,
  SentNotification,
  NotificationChannel,
  ThresholdVersion,
} from '../types/analytics.js';

class KPIAlertService {
  // ============================================
  // THRESHOLD MANAGEMENT
  // ============================================

  /**
   * Create a new KPI threshold
   */
  async createThreshold(input: CreateKPIThresholdInput): Promise<KPIThreshold> {
    const result = await db.queryOne<KPIThreshold>(
      `INSERT INTO kpi_thresholds (
        kpi_name, kpi_category, display_name, description,
        threshold_condition, threshold_value, warning_threshold, critical_threshold,
        target_value, unit, alert_severity, alert_enabled, alert_cooldown_minutes,
        notification_channels, notification_recipients,
        aggregation_type, aggregation_period,
        region, operator_id, event_id,
        current_version, version_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 1, 1
      ) RETURNING *`,
      [
        input.kpiName,
        input.kpiCategory,
        input.displayName,
        input.description,
        input.thresholdCondition,
        input.thresholdValue,
        input.warningThreshold,
        input.criticalThreshold,
        input.targetValue,
        input.unit,
        input.alertSeverity || 'warning',
        input.alertEnabled ?? true,
        input.alertCooldownMinutes || 60,
        JSON.stringify(input.notificationChannels || ['email', 'slack']),
        JSON.stringify(input.notificationRecipients || []),
        input.aggregationType || 'sum',
        input.aggregationPeriod || 'daily',
        input.region,
        input.operatorId,
        input.eventId,
      ]
    );

    const threshold = this.mapThresholdFromDb(result!);
    
    // Create initial version record
    await this.createVersionRecord(threshold, 'INSERT');

    logger.info({ thresholdId: result?.id, kpiName: input.kpiName }, 'KPI threshold created');
    return threshold;
  }
  
  /**
   * Create a version record for a threshold
   */
  private async createVersionRecord(threshold: KPIThreshold, changeType: string, changeReason?: string, changedBy?: string): Promise<void> {
    const versionNumber = threshold.createdAt === threshold.updatedAt ? 1 : (await this.getNextVersionNumber(threshold.id));
    
    // Mark previous versions as not current
    await db.query(
      `UPDATE kpi_threshold_versions SET is_current = false, effective_to = NOW() WHERE threshold_id = $1 AND is_current = true`,
      [threshold.id]
    );
    
    // Insert new version
    await db.query(
      `INSERT INTO kpi_threshold_versions (
        threshold_id, version_number,
        kpi_name, kpi_category, display_name, description,
        threshold_condition, threshold_value, warning_threshold, critical_threshold, target_value,
        alert_severity, alert_enabled, alert_cooldown_minutes,
        notification_channels, notification_recipients,
        is_current, change_type, change_reason, changed_by, full_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17, $18, $19, $20)`,
      [
        threshold.id, versionNumber,
        threshold.kpiName, threshold.kpiCategory, threshold.displayName, threshold.description,
        threshold.thresholdCondition, threshold.thresholdValue, threshold.warningThreshold, threshold.criticalThreshold, threshold.targetValue,
        threshold.alertSeverity, threshold.alertEnabled, threshold.alertCooldownMinutes,
        JSON.stringify(threshold.notificationChannels), JSON.stringify(threshold.notificationRecipients),
        changeType, changeReason, changedBy, JSON.stringify(threshold)
      ]
    );
    
    // Update version count on main table
    await db.query(
      `UPDATE kpi_thresholds SET current_version = $2, version_count = $2 WHERE id = $1`,
      [threshold.id, versionNumber]
    );
  }
  
  /**
   * Get next version number for a threshold
   */
  private async getNextVersionNumber(thresholdId: string): Promise<number> {
    const result = await db.queryOne<{ max_version: string }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as max_version FROM kpi_threshold_versions WHERE threshold_id = $1`,
      [thresholdId]
    );
    return parseInt(result?.max_version || '1');
  }

  /**
   * Update an existing KPI threshold
   */
  async updateThreshold(id: string, input: UpdateKPIThresholdInput): Promise<KPIThreshold> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(input.displayName);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.thresholdCondition !== undefined) {
      updates.push(`threshold_condition = $${paramIndex++}`);
      values.push(input.thresholdCondition);
    }
    if (input.thresholdValue !== undefined) {
      updates.push(`threshold_value = $${paramIndex++}`);
      values.push(input.thresholdValue);
    }
    if (input.warningThreshold !== undefined) {
      updates.push(`warning_threshold = $${paramIndex++}`);
      values.push(input.warningThreshold);
    }
    if (input.criticalThreshold !== undefined) {
      updates.push(`critical_threshold = $${paramIndex++}`);
      values.push(input.criticalThreshold);
    }
    if (input.targetValue !== undefined) {
      updates.push(`target_value = $${paramIndex++}`);
      values.push(input.targetValue);
    }
    if (input.unit !== undefined) {
      updates.push(`unit = $${paramIndex++}`);
      values.push(input.unit);
    }
    if (input.alertSeverity !== undefined) {
      updates.push(`alert_severity = $${paramIndex++}`);
      values.push(input.alertSeverity);
    }
    if (input.alertEnabled !== undefined) {
      updates.push(`alert_enabled = $${paramIndex++}`);
      values.push(input.alertEnabled);
    }
    if (input.alertCooldownMinutes !== undefined) {
      updates.push(`alert_cooldown_minutes = $${paramIndex++}`);
      values.push(input.alertCooldownMinutes);
    }
    if (input.notificationChannels !== undefined) {
      updates.push(`notification_channels = $${paramIndex++}`);
      values.push(JSON.stringify(input.notificationChannels));
    }
    if (input.notificationRecipients !== undefined) {
      updates.push(`notification_recipients = $${paramIndex++}`);
      values.push(JSON.stringify(input.notificationRecipients));
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }

    values.push(id);

    const result = await db.queryOne<KPIThreshold>(
      `UPDATE kpi_thresholds SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!result) {
      throw new Error(`Threshold ${id} not found`);
    }

    const threshold = this.mapThresholdFromDb(result);
    
    // Create version record for the update
    await this.createVersionRecord(threshold, 'UPDATE');

    logger.info({ thresholdId: id }, 'KPI threshold updated');
    return threshold;
  }

  /**
   * Get all thresholds
   */
  async getThresholds(activeOnly: boolean = true): Promise<KPIThreshold[]> {
    const query = activeOnly
      ? `SELECT * FROM kpi_thresholds WHERE is_active = true ORDER BY kpi_category, kpi_name`
      : `SELECT * FROM kpi_thresholds ORDER BY kpi_category, kpi_name`;
    
    const results = await db.queryMany<KPIThreshold>(query);
    return results.map(this.mapThresholdFromDb);
  }

  /**
   * Get threshold by ID
   */
  async getThreshold(id: string): Promise<KPIThreshold | null> {
    const result = await db.queryOne<KPIThreshold>(
      `SELECT * FROM kpi_thresholds WHERE id = $1`,
      [id]
    );
    return result ? this.mapThresholdFromDb(result) : null;
  }

  /**
   * Get thresholds by KPI name
   */
  async getThresholdsByKpi(kpiName: string): Promise<KPIThreshold[]> {
    const results = await db.queryMany<KPIThreshold>(
      `SELECT * FROM kpi_thresholds WHERE kpi_name = $1 AND is_active = true`,
      [kpiName]
    );
    return results.map(this.mapThresholdFromDb);
  }

  /**
   * Delete a threshold
   */
  async deleteThreshold(id: string): Promise<void> {
    await db.query(`DELETE FROM kpi_thresholds WHERE id = $1`, [id]);
    logger.info({ thresholdId: id }, 'KPI threshold deleted');
  }

  // ============================================
  // ALERT MANAGEMENT
  // ============================================

  /**
   * Check all thresholds and create alerts if breached
   */
  async checkThresholds(metrics: Record<string, number>, snapshotId?: string, snapshotDate?: Date): Promise<KPIAlert[]> {
    const thresholds = await this.getThresholds(true);
    const alerts: KPIAlert[] = [];

    for (const threshold of thresholds) {
      if (!threshold.alertEnabled) continue;

      const currentValue = metrics[threshold.kpiName];
      if (currentValue === undefined) continue;

      // Check cooldown
      if (threshold.lastAlertAt) {
        const cooldownMs = threshold.alertCooldownMinutes * 60 * 1000;
        if (Date.now() - threshold.lastAlertAt.getTime() < cooldownMs) {
          continue;
        }
      }

      const isBreached = this.isThresholdBreached(
        currentValue,
        threshold.thresholdValue,
        threshold.thresholdCondition
      );

      if (isBreached) {
        const alert = await this.createAlert(threshold, currentValue, snapshotId, snapshotDate);
        alerts.push(alert);

        // Update last alert time
        await db.query(
          `UPDATE kpi_thresholds SET last_alert_at = NOW() WHERE id = $1`,
          [threshold.id]
        );
      }
    }

    if (alerts.length > 0) {
      logger.info({ alertCount: alerts.length }, 'KPI alerts generated');
    }

    return alerts;
  }

  /**
   * Create an alert for a breached threshold
   */
  async createAlert(
    threshold: KPIThreshold,
    currentValue: number,
    snapshotId?: string,
    snapshotDate?: Date
  ): Promise<KPIAlert> {
    const deviationPercent = threshold.thresholdValue !== 0
      ? ((currentValue - threshold.thresholdValue) / threshold.thresholdValue) * 100
      : 0;

    // Determine severity based on which threshold was breached
    let severity: KPIAlertSeverity = threshold.alertSeverity;
    if (threshold.criticalThreshold !== undefined) {
      const isCritical = this.isThresholdBreached(
        currentValue,
        threshold.criticalThreshold,
        threshold.thresholdCondition
      );
      if (isCritical) severity = 'critical';
    }

    const alertMessage = this.generateAlertMessage(threshold, currentValue, severity);

    const result = await db.queryOne<KPIAlert>(
      `INSERT INTO kpi_alerts (
        threshold_id, kpi_name, kpi_category, alert_severity, alert_status,
        current_value, threshold_value, threshold_condition, deviation_percent,
        alert_message, alert_context, snapshot_date, snapshot_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        threshold.id,
        threshold.kpiName,
        threshold.kpiCategory,
        severity,
        'active',
        currentValue,
        threshold.thresholdValue,
        threshold.thresholdCondition,
        deviationPercent,
        alertMessage,
        JSON.stringify({
          thresholdDisplayName: threshold.displayName,
          targetValue: threshold.targetValue,
          unit: threshold.unit,
        }),
        snapshotDate?.toISOString().split('T')[0],
        snapshotId,
      ]
    );

    logger.warn(
      { alertId: result?.id, kpiName: threshold.kpiName, severity, currentValue },
      'KPI alert created'
    );

    return this.mapAlertFromDb(result!);
  }

  /**
   * Get alerts with filtering
   */
  async getAlerts(params: AlertQueryParams): Promise<{ alerts: KPIAlert[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.status) {
      conditions.push(`alert_status = $${paramIndex++}`);
      values.push(params.status);
    }
    if (params.severity) {
      conditions.push(`alert_severity = $${paramIndex++}`);
      values.push(params.severity);
    }
    if (params.kpiCategory) {
      conditions.push(`kpi_category = $${paramIndex++}`);
      values.push(params.kpiCategory);
    }
    if (params.kpiName) {
      conditions.push(`kpi_name = $${paramIndex++}`);
      values.push(params.kpiName);
    }
    if (params.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(params.fromDate);
    }
    if (params.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(params.toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [alertsResult, countResult] = await Promise.all([
      db.queryMany<KPIAlert>(
        `SELECT * FROM kpi_alerts ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit || 50, params.offset || 0]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM kpi_alerts ${whereClause}`,
        values
      ),
    ]);

    return {
      alerts: alertsResult.map(this.mapAlertFromDb),
      total: parseInt(countResult?.count || '0'),
    };
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<KPIAlert[]> {
    const results = await db.queryMany<KPIAlert>(
      `SELECT * FROM kpi_alerts WHERE alert_status = 'active' ORDER BY alert_severity DESC, created_at DESC`
    );
    return results.map(this.mapAlertFromDb);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string, notes?: string): Promise<KPIAlert> {
    const result = await db.queryOne<KPIAlert>(
      `UPDATE kpi_alerts SET 
        alert_status = 'acknowledged',
        acknowledged_by = $2,
        acknowledged_at = NOW(),
        resolution_notes = COALESCE(resolution_notes, '') || $3,
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [alertId, userId, notes ? `\nAcknowledged: ${notes}` : '']
    );

    if (!result) {
      throw new Error(`Alert ${alertId} not found`);
    }

    logger.info({ alertId, userId }, 'Alert acknowledged');
    return this.mapAlertFromDb(result);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, resolutionNotes: string): Promise<KPIAlert> {
    const result = await db.queryOne<KPIAlert>(
      `UPDATE kpi_alerts SET 
        alert_status = 'resolved',
        resolved_by = $2,
        resolved_at = NOW(),
        resolution_notes = COALESCE(resolution_notes, '') || $3,
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [alertId, userId, `\nResolved: ${resolutionNotes}`]
    );

    if (!result) {
      throw new Error(`Alert ${alertId} not found`);
    }

    logger.info({ alertId, userId }, 'Alert resolved');
    return this.mapAlertFromDb(result);
  }

  /**
   * Snooze an alert
   */
  async snoozeAlert(alertId: string, userId: string, snoozeDurationMinutes: number): Promise<KPIAlert> {
    const snoozedUntil = new Date(Date.now() + snoozeDurationMinutes * 60 * 1000);

    const result = await db.queryOne<KPIAlert>(
      `UPDATE kpi_alerts SET 
        alert_status = 'snoozed',
        snoozed_by = $2,
        snoozed_until = $3,
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [alertId, userId, snoozedUntil.toISOString()]
    );

    if (!result) {
      throw new Error(`Alert ${alertId} not found`);
    }

    logger.info({ alertId, userId, snoozedUntil }, 'Alert snoozed');
    return this.mapAlertFromDb(result);
  }

  /**
   * Reactivate snoozed alerts that have passed their snooze time
   */
  async reactivateSnoozedAlerts(): Promise<number> {
    const result = await db.query(
      `UPDATE kpi_alerts SET 
        alert_status = 'active',
        snoozed_until = NULL,
        updated_at = NOW()
       WHERE alert_status = 'snoozed' AND snoozed_until < NOW()`
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info({ reactivatedCount: count }, 'Snoozed alerts reactivated');
    }
    return count;
  }

  /**
   * Record a notification sent for an alert
   */
  async recordNotification(
    alertId: string,
    channel: NotificationChannel,
    recipient: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const notification: SentNotification = {
      channel,
      sentAt: new Date(),
      recipient,
      success,
      errorMessage,
    };

    await db.query(
      `UPDATE kpi_alerts SET 
        notifications_sent = notifications_sent || $2::jsonb,
        last_notification_at = NOW(),
        notification_count = notification_count + 1,
        updated_at = NOW()
       WHERE id = $1`,
      [alertId, JSON.stringify([notification])]
    );
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private isThresholdBreached(
    currentValue: number,
    thresholdValue: number,
    condition: ThresholdCondition
  ): boolean {
    switch (condition) {
      case 'greater_than':
        return currentValue > thresholdValue;
      case 'less_than':
        return currentValue < thresholdValue;
      case 'greater_than_or_equal':
        return currentValue >= thresholdValue;
      case 'less_than_or_equal':
        return currentValue <= thresholdValue;
      case 'equals':
        return currentValue === thresholdValue;
      case 'not_equals':
        return currentValue !== thresholdValue;
      case 'percent_change_above':
        return Math.abs(currentValue) > thresholdValue;
      case 'percent_change_below':
        return Math.abs(currentValue) < thresholdValue;
      default:
        return false;
    }
  }

  private generateAlertMessage(
    threshold: KPIThreshold,
    currentValue: number,
    severity: KPIAlertSeverity
  ): string {
    const unit = threshold.unit || '';
    const condition = this.humanizeCondition(threshold.thresholdCondition);
    
    return `[${severity.toUpperCase()}] ${threshold.displayName}: Current value (${currentValue}${unit}) ${condition} threshold (${threshold.thresholdValue}${unit})`;
  }

  private humanizeCondition(condition: ThresholdCondition): string {
    const map: Record<ThresholdCondition, string> = {
      greater_than: 'exceeded',
      less_than: 'fell below',
      greater_than_or_equal: 'reached or exceeded',
      less_than_or_equal: 'reached or fell below',
      equals: 'equals',
      not_equals: 'differs from',
      percent_change_above: 'changed by more than',
      percent_change_below: 'changed by less than',
    };
    return map[condition] || condition;
  }

  private mapThresholdFromDb(row: any): KPIThreshold {
    return {
      id: row.id,
      kpiName: row.kpi_name,
      kpiCategory: row.kpi_category,
      displayName: row.display_name,
      description: row.description,
      thresholdCondition: row.threshold_condition,
      thresholdValue: parseFloat(row.threshold_value),
      warningThreshold: row.warning_threshold ? parseFloat(row.warning_threshold) : undefined,
      criticalThreshold: row.critical_threshold ? parseFloat(row.critical_threshold) : undefined,
      targetValue: row.target_value ? parseFloat(row.target_value) : undefined,
      baselineValue: row.baseline_value ? parseFloat(row.baseline_value) : undefined,
      unit: row.unit,
      alertSeverity: row.alert_severity,
      alertEnabled: row.alert_enabled,
      alertCooldownMinutes: parseInt(row.alert_cooldown_minutes),
      lastAlertAt: row.last_alert_at ? new Date(row.last_alert_at) : undefined,
      notificationChannels: typeof row.notification_channels === 'string'
        ? JSON.parse(row.notification_channels)
        : row.notification_channels || [],
      notificationRecipients: typeof row.notification_recipients === 'string'
        ? JSON.parse(row.notification_recipients)
        : row.notification_recipients || [],
      aggregationType: row.aggregation_type,
      aggregationPeriod: row.aggregation_period,
      region: row.region,
      operatorId: row.operator_id ? parseInt(row.operator_id) : undefined,
      eventId: row.event_id,
      isActive: row.is_active,
      isSystemKpi: row.is_system_kpi,
      createdBy: row.created_by,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapAlertFromDb(row: any): KPIAlert {
    return {
      id: row.id,
      thresholdId: row.threshold_id,
      kpiName: row.kpi_name,
      kpiCategory: row.kpi_category,
      alertSeverity: row.alert_severity,
      alertStatus: row.alert_status,
      currentValue: parseFloat(row.current_value),
      thresholdValue: parseFloat(row.threshold_value),
      thresholdCondition: row.threshold_condition,
      deviationPercent: row.deviation_percent ? parseFloat(row.deviation_percent) : undefined,
      alertMessage: row.alert_message,
      alertContext: typeof row.alert_context === 'string'
        ? JSON.parse(row.alert_context)
        : row.alert_context,
      snapshotDate: row.snapshot_date ? new Date(row.snapshot_date) : undefined,
      snapshotId: row.snapshot_id,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolutionNotes: row.resolution_notes,
      snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until) : undefined,
      snoozedBy: row.snoozed_by,
      notificationsSent: typeof row.notifications_sent === 'string'
        ? JSON.parse(row.notifications_sent)
        : row.notifications_sent || [],
      lastNotificationAt: row.last_notification_at ? new Date(row.last_notification_at) : undefined,
      notificationCount: parseInt(row.notification_count || '0'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ============================================
  // VERSION MANAGEMENT (WO-74)
  // ============================================

  /**
   * Get version history for a threshold
   */
  async getThresholdVersions(thresholdId: string): Promise<ThresholdVersion[]> {
    const results = await db.queryMany<ThresholdVersion>(
      `SELECT * FROM kpi_threshold_versions 
       WHERE threshold_id = $1 
       ORDER BY version_number DESC`,
      [thresholdId]
    );
    return results.map(this.mapVersionFromDb);
  }

  /**
   * Get a specific version of a threshold
   */
  async getThresholdVersion(thresholdId: string, versionNumber: number): Promise<ThresholdVersion | null> {
    const result = await db.queryOne<ThresholdVersion>(
      `SELECT * FROM kpi_threshold_versions 
       WHERE threshold_id = $1 AND version_number = $2`,
      [thresholdId, versionNumber]
    );
    return result ? this.mapVersionFromDb(result) : null;
  }

  /**
   * Get threshold state at a specific point in time
   */
  async getThresholdAtTime(thresholdId: string, atTime: Date): Promise<ThresholdVersion | null> {
    const result = await db.queryOne<ThresholdVersion>(
      `SELECT * FROM kpi_threshold_versions 
       WHERE threshold_id = $1 
         AND effective_from <= $2 
         AND (effective_to IS NULL OR effective_to > $2)
       ORDER BY version_number DESC
       LIMIT 1`,
      [thresholdId, atTime.toISOString()]
    );
    return result ? this.mapVersionFromDb(result) : null;
  }

  /**
   * Rollback a threshold to a previous version
   */
  async rollbackThreshold(
    thresholdId: string,
    targetVersion: number,
    userId?: string,
    reason?: string
  ): Promise<KPIThreshold> {
    // Get the version to rollback to
    const version = await this.getThresholdVersion(thresholdId, targetVersion);
    if (!version) {
      throw new Error(`Version ${targetVersion} not found for threshold ${thresholdId}`);
    }

    // Update the threshold with versioned values
    const result = await db.queryOne<KPIThreshold>(
      `UPDATE kpi_thresholds SET
        threshold_condition = $2,
        threshold_value = $3,
        warning_threshold = $4,
        critical_threshold = $5,
        target_value = $6,
        alert_severity = $7,
        alert_enabled = $8,
        alert_cooldown_minutes = $9,
        notification_channels = $10,
        notification_recipients = $11,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        thresholdId,
        version.thresholdCondition,
        version.thresholdValue,
        version.warningThreshold,
        version.criticalThreshold,
        version.targetValue,
        version.alertSeverity,
        version.alertEnabled,
        version.alertCooldownMinutes,
        JSON.stringify(version.notificationChannels),
        JSON.stringify(version.notificationRecipients),
      ]
    );

    if (!result) {
      throw new Error(`Threshold ${thresholdId} not found`);
    }

    // Update the change reason in the new version
    await db.query(
      `UPDATE kpi_threshold_versions 
       SET change_reason = $2, changed_by = $3
       WHERE threshold_id = $1 AND is_current = true`,
      [thresholdId, reason || `Rollback to version ${targetVersion}`, userId]
    );

    logger.info({ thresholdId, targetVersion, userId }, 'Threshold rolled back');
    return this.mapThresholdFromDb(result);
  }

  /**
   * Compare two versions of a threshold
   */
  async compareVersions(
    thresholdId: string,
    version1: number,
    version2: number
  ): Promise<{
    version1: ThresholdVersion;
    version2: ThresholdVersion;
    differences: Record<string, { old: unknown; new: unknown }>;
  }> {
    const [v1, v2] = await Promise.all([
      this.getThresholdVersion(thresholdId, version1),
      this.getThresholdVersion(thresholdId, version2),
    ]);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const differences: Record<string, { old: unknown; new: unknown }> = {};
    const keysToCompare = [
      'thresholdValue',
      'warningThreshold',
      'criticalThreshold',
      'targetValue',
      'alertSeverity',
      'alertEnabled',
      'alertCooldownMinutes',
      'thresholdCondition',
    ];

    for (const key of keysToCompare) {
      const oldVal = (v1 as any)[key];
      const newVal = (v2 as any)[key];
      if (oldVal !== newVal) {
        differences[key] = { old: oldVal, new: newVal };
      }
    }

    return { version1: v1, version2: v2, differences };
  }

  private mapVersionFromDb(row: any): ThresholdVersion {
    return {
      id: row.id,
      thresholdId: row.threshold_id,
      versionNumber: parseInt(row.version_number),
      kpiName: row.kpi_name,
      kpiCategory: row.kpi_category,
      displayName: row.display_name,
      description: row.description,
      thresholdCondition: row.threshold_condition,
      thresholdValue: parseFloat(row.threshold_value),
      warningThreshold: row.warning_threshold ? parseFloat(row.warning_threshold) : undefined,
      criticalThreshold: row.critical_threshold ? parseFloat(row.critical_threshold) : undefined,
      targetValue: row.target_value ? parseFloat(row.target_value) : undefined,
      alertSeverity: row.alert_severity,
      alertEnabled: row.alert_enabled,
      alertCooldownMinutes: row.alert_cooldown_minutes ? parseInt(row.alert_cooldown_minutes) : undefined,
      notificationChannels: typeof row.notification_channels === 'string'
        ? JSON.parse(row.notification_channels)
        : row.notification_channels || [],
      notificationRecipients: typeof row.notification_recipients === 'string'
        ? JSON.parse(row.notification_recipients)
        : row.notification_recipients || [],
      effectiveFrom: new Date(row.effective_from),
      effectiveTo: row.effective_to ? new Date(row.effective_to) : undefined,
      isCurrent: row.is_current,
      changeReason: row.change_reason,
      changedBy: row.changed_by,
      changedByEmail: row.changed_by_email,
      changeType: row.change_type,
      fullState: typeof row.full_state === 'string' ? JSON.parse(row.full_state) : row.full_state,
      createdAt: new Date(row.created_at),
    };
  }
}

export const kpiAlertService = new KPIAlertService();
