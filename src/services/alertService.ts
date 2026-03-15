import { randomUUID } from 'node:crypto';
import { alertRules, type AlertRule, type AlertSeverity, type AlertState } from '../config/alerts.js';
import type { MetricsSnapshot } from './metricsService.js';
import { logger } from '../utils/logger.js';

export interface AlertRecord {
  id: string;
  ruleId: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  state: AlertState;
  metricValue: number;
  threshold: number;
  comparator: AlertRule['comparator'];
  triggeredAt: string;
  resolvedAt?: string;
  notificationChannels: string[];
}

function compareValue(value: number, threshold: number, comparator: AlertRule['comparator']): boolean {
  switch (comparator) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    default:
      return false;
  }
}

function getMetricValue(snapshot: MetricsSnapshot, metricKey: AlertRule['metricKey']): number {
  switch (metricKey) {
    case 'request.errorRatePercent':
      return snapshot.requests.errorRatePercent;
    case 'request.p99LatencyMs':
      return snapshot.requests.p99LatencyMs;
    case 'database.errorRatePercent':
      return snapshot.database.errorRatePercent;
    case 'system.memory.heapUsedPercent':
      return snapshot.system.memory.heapUsedPercent;
    default:
      return 0;
  }
}

class AlertService {
  private readonly activeAlerts = new Map<string, AlertRecord>();
  private readonly history: AlertRecord[] = [];
  private readonly lastTriggeredAt = new Map<string, number>();
  private readonly evaluationIntervalMs = 15_000;
  private lastEvaluationAt = 0;

  evaluate(snapshot: MetricsSnapshot): AlertRecord[] {
    const now = Date.now();

    if (now - this.lastEvaluationAt < this.evaluationIntervalMs) {
      return [];
    }

    this.lastEvaluationAt = now;

    const changes: AlertRecord[] = [];

    for (const rule of alertRules) {
      const metricValue = getMetricValue(snapshot, rule.metricKey);
      const breached = compareValue(metricValue, rule.threshold, rule.comparator);
      const currentlyActive = this.activeAlerts.get(rule.id);

      if (breached) {
        if (currentlyActive) {
          continue;
        }

        const lastTriggeredAt = this.lastTriggeredAt.get(rule.id);
        if (lastTriggeredAt && now - lastTriggeredAt < rule.cooldownMs) {
          continue;
        }

        const alert: AlertRecord = {
          id: randomUUID(),
          ruleId: rule.id,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          state: 'firing',
          metricValue,
          threshold: rule.threshold,
          comparator: rule.comparator,
          triggeredAt: new Date(now).toISOString(),
          notificationChannels: ['webhook', 'email'],
        };

        this.activeAlerts.set(rule.id, alert);
        this.history.unshift(alert);
        this.lastTriggeredAt.set(rule.id, now);
        this.dispatchNotification(alert);
        changes.push(alert);
        continue;
      }

      if (!breached && currentlyActive) {
        const resolved: AlertRecord = {
          ...currentlyActive,
          state: 'resolved',
          metricValue,
          resolvedAt: new Date(now).toISOString(),
        };

        this.activeAlerts.delete(rule.id);
        this.history.unshift(resolved);
        this.dispatchNotification(resolved);
        changes.push(resolved);
      }
    }

    return changes;
  }

  getActiveAlerts(): AlertRecord[] {
    return [...this.activeAlerts.values()];
  }

  getHistory(limit = 100): AlertRecord[] {
    return this.history.slice(0, limit);
  }

  private dispatchNotification(alert: AlertRecord): void {
    const payload = {
      alertId: alert.id,
      ruleId: alert.ruleId,
      severity: alert.severity,
      state: alert.state,
      metricValue: alert.metricValue,
      threshold: alert.threshold,
      triggeredAt: alert.triggeredAt,
      resolvedAt: alert.resolvedAt,
      channels: alert.notificationChannels,
    };

    if (alert.state === 'firing') {
      logger.warn({ alert: payload }, 'Alert firing (notification placeholder)');
      return;
    }

    logger.info({ alert: payload }, 'Alert resolved (notification placeholder)');
  }
}

export const alertService = new AlertService();
