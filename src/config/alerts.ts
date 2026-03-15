export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertState = 'firing' | 'resolved';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metricKey:
    | 'request.errorRatePercent'
    | 'request.p99LatencyMs'
    | 'database.errorRatePercent'
    | 'system.memory.heapUsedPercent';
  comparator: 'gt' | 'gte' | 'lt' | 'lte';
  threshold: number;
  severity: AlertSeverity;
  cooldownMs: number;
}

export interface AlertThresholdConfig {
  requestErrorRatePercent: number;
  requestP99LatencyMs: number;
  databaseErrorRatePercent: number;
  heapUsedPercent: number;
}

export const alertThresholds: AlertThresholdConfig = {
  requestErrorRatePercent: 5,
  requestP99LatencyMs: 2000,
  databaseErrorRatePercent: 3,
  heapUsedPercent: 85,
};

export const alertRules: AlertRule[] = [
  {
    id: 'http_error_rate_high',
    name: 'HTTP Error Rate High',
    description: '5xx request error rate exceeds the allowed threshold',
    metricKey: 'request.errorRatePercent',
    comparator: 'gt',
    threshold: alertThresholds.requestErrorRatePercent,
    severity: 'critical',
    cooldownMs: 5 * 60 * 1000,
  },
  {
    id: 'http_latency_p99_high',
    name: 'HTTP P99 Latency High',
    description: 'P99 request latency exceeds 2 seconds',
    metricKey: 'request.p99LatencyMs',
    comparator: 'gt',
    threshold: alertThresholds.requestP99LatencyMs,
    severity: 'warning',
    cooldownMs: 5 * 60 * 1000,
  },
  {
    id: 'db_error_rate_high',
    name: 'Database Error Rate High',
    description: 'Database query error rate exceeds expected threshold',
    metricKey: 'database.errorRatePercent',
    comparator: 'gt',
    threshold: alertThresholds.databaseErrorRatePercent,
    severity: 'critical',
    cooldownMs: 5 * 60 * 1000,
  },
  {
    id: 'memory_heap_high',
    name: 'Heap Usage High',
    description: 'Node.js heap utilization is above healthy range',
    metricKey: 'system.memory.heapUsedPercent',
    comparator: 'gt',
    threshold: alertThresholds.heapUsedPercent,
    severity: 'warning',
    cooldownMs: 10 * 60 * 1000,
  },
];
