import { getPoolStats } from '../db/connection-pool.js';

export interface HttpMetricInput {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

export interface DbQueryMetricInput {
  operation: string;
  durationMs: number;
  success: boolean;
}

interface HistogramSnapshot {
  buckets: Record<string, number>;
  count: number;
  sum: number;
}

export interface MetricsSnapshot {
  generatedAt: string;
  uptimeSeconds: number;
  requests: {
    total: number;
    errors: number;
    errorRatePercent: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    statusCodes: Record<string, number>;
    latencyHistogram: HistogramSnapshot;
  };
  database: {
    queryCount: number;
    queryErrors: number;
    errorRatePercent: number;
    avgQueryLatencyMs: number;
    latencyHistogram: HistogramSnapshot;
    pool: ReturnType<typeof getPoolStats>;
  };
  system: {
    cpuUserSeconds: number;
    cpuSystemSeconds: number;
    memory: {
      rssBytes: number;
      heapTotalBytes: number;
      heapUsedBytes: number;
      externalBytes: number;
      arrayBuffersBytes: number;
      heapUsedPercent: number;
    };
  };
}

class Histogram {
  private readonly bounds: number[];
  private readonly counts: number[];
  private totalCount = 0;
  private totalSum = 0;

  constructor(bounds: number[]) {
    this.bounds = bounds;
    this.counts = new Array(bounds.length + 1).fill(0);
  }

  observe(value: number): void {
    const sanitized = Number.isFinite(value) ? Math.max(value, 0) : 0;
    this.totalCount += 1;
    this.totalSum += sanitized;

    for (let idx = 0; idx < this.bounds.length; idx += 1) {
      if (sanitized <= this.bounds[idx]) {
        this.counts[idx] += 1;
        return;
      }
    }

    this.counts[this.counts.length - 1] += 1;
  }

  snapshot(): HistogramSnapshot {
    const buckets: Record<string, number> = {};

    this.bounds.forEach((bound, idx) => {
      buckets[`le_${bound}`] = this.counts[idx];
    });

    buckets.le_inf = this.counts[this.counts.length - 1];

    return {
      buckets,
      count: this.totalCount,
      sum: this.totalSum,
    };
  }
}

export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly startedCpuUsage = process.cpuUsage();

  private requestCount = 0;
  private requestErrors = 0;
  private requestLatencySumMs = 0;
  private readonly requestLatencyWindow: number[] = [];
  private readonly requestLatencyHistogram = new Histogram([50, 100, 250, 500, 1000, 2000, 5000]);
  private readonly statusCodeCounts = new Map<string, number>();

  private dbQueryCount = 0;
  private dbQueryErrors = 0;
  private dbQueryLatencySumMs = 0;
  private readonly dbLatencyHistogram = new Histogram([5, 10, 25, 50, 100, 250, 500, 1000]);

  private static readonly LATENCY_WINDOW_MAX = 10_000;

  private observeLatency(window: number[], value: number): void {
    window.push(value);
    if (window.length > MetricsService.LATENCY_WINDOW_MAX) {
      window.shift();
    }
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(index, 0)];
  }

  recordHttpRequest(input: HttpMetricInput): void {
    this.requestCount += 1;
    if (input.statusCode >= 500) {
      this.requestErrors += 1;
    }

    this.requestLatencySumMs += input.durationMs;
    this.observeLatency(this.requestLatencyWindow, input.durationMs);
    this.requestLatencyHistogram.observe(input.durationMs);

    const statusGroup = `${Math.floor(input.statusCode / 100)}xx`;
    this.statusCodeCounts.set(statusGroup, (this.statusCodeCounts.get(statusGroup) ?? 0) + 1);
    this.statusCodeCounts.set(String(input.statusCode), (this.statusCodeCounts.get(String(input.statusCode)) ?? 0) + 1);
  }

  recordDatabaseQuery(input: DbQueryMetricInput): void {
    this.dbQueryCount += 1;
    if (!input.success) {
      this.dbQueryErrors += 1;
    }

    this.dbQueryLatencySumMs += input.durationMs;
    this.dbLatencyHistogram.observe(input.durationMs);
  }

  getSnapshot(): MetricsSnapshot {
    const cpuUsage = process.cpuUsage(this.startedCpuUsage);
    const memoryUsage = process.memoryUsage();

    const requestErrorRate = this.requestCount === 0 ? 0 : (this.requestErrors / this.requestCount) * 100;
    const dbErrorRate = this.dbQueryCount === 0 ? 0 : (this.dbQueryErrors / this.dbQueryCount) * 100;

    const heapUsedPercent = memoryUsage.heapTotal === 0
      ? 0
      : (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds: Math.max(0, (Date.now() - this.startedAt) / 1000),
      requests: {
        total: this.requestCount,
        errors: this.requestErrors,
        errorRatePercent: Number(requestErrorRate.toFixed(2)),
        avgLatencyMs: this.requestCount === 0 ? 0 : Number((this.requestLatencySumMs / this.requestCount).toFixed(2)),
        p50LatencyMs: Number(this.percentile(this.requestLatencyWindow, 50).toFixed(2)),
        p95LatencyMs: Number(this.percentile(this.requestLatencyWindow, 95).toFixed(2)),
        p99LatencyMs: Number(this.percentile(this.requestLatencyWindow, 99).toFixed(2)),
        statusCodes: Object.fromEntries(this.statusCodeCounts.entries()),
        latencyHistogram: this.requestLatencyHistogram.snapshot(),
      },
      database: {
        queryCount: this.dbQueryCount,
        queryErrors: this.dbQueryErrors,
        errorRatePercent: Number(dbErrorRate.toFixed(2)),
        avgQueryLatencyMs: this.dbQueryCount === 0 ? 0 : Number((this.dbQueryLatencySumMs / this.dbQueryCount).toFixed(2)),
        latencyHistogram: this.dbLatencyHistogram.snapshot(),
        pool: getPoolStats(),
      },
      system: {
        cpuUserSeconds: Number((cpuUsage.user / 1_000_000).toFixed(3)),
        cpuSystemSeconds: Number((cpuUsage.system / 1_000_000).toFixed(3)),
        memory: {
          rssBytes: memoryUsage.rss,
          heapTotalBytes: memoryUsage.heapTotal,
          heapUsedBytes: memoryUsage.heapUsed,
          externalBytes: memoryUsage.external,
          arrayBuffersBytes: memoryUsage.arrayBuffers,
          heapUsedPercent: Number(heapUsedPercent.toFixed(2)),
        },
      },
    };
  }

  toPrometheusFormat(): string {
    const snapshot = this.getSnapshot();

    const lines: string[] = [];

    lines.push('# HELP app_requests_total Total HTTP requests observed');
    lines.push('# TYPE app_requests_total counter');
    lines.push(`app_requests_total ${snapshot.requests.total}`);

    lines.push('# HELP app_request_errors_total Total HTTP 5xx responses observed');
    lines.push('# TYPE app_request_errors_total counter');
    lines.push(`app_request_errors_total ${snapshot.requests.errors}`);

    lines.push('# HELP app_request_error_rate_percent Request error rate percent');
    lines.push('# TYPE app_request_error_rate_percent gauge');
    lines.push(`app_request_error_rate_percent ${snapshot.requests.errorRatePercent}`);

    lines.push('# HELP app_request_latency_ms HTTP request latency summary');
    lines.push('# TYPE app_request_latency_ms gauge');
    lines.push(`app_request_latency_ms{quantile="0.50"} ${snapshot.requests.p50LatencyMs}`);
    lines.push(`app_request_latency_ms{quantile="0.95"} ${snapshot.requests.p95LatencyMs}`);
    lines.push(`app_request_latency_ms{quantile="0.99"} ${snapshot.requests.p99LatencyMs}`);

    lines.push('# HELP app_db_queries_total Total database queries observed');
    lines.push('# TYPE app_db_queries_total counter');
    lines.push(`app_db_queries_total ${snapshot.database.queryCount}`);

    lines.push('# HELP app_db_query_errors_total Total database query failures observed');
    lines.push('# TYPE app_db_query_errors_total counter');
    lines.push(`app_db_query_errors_total ${snapshot.database.queryErrors}`);

    lines.push('# HELP process_memory_heap_used_bytes Heap used memory in bytes');
    lines.push('# TYPE process_memory_heap_used_bytes gauge');
    lines.push(`process_memory_heap_used_bytes ${snapshot.system.memory.heapUsedBytes}`);

    lines.push('# HELP process_memory_heap_total_bytes Heap total memory in bytes');
    lines.push('# TYPE process_memory_heap_total_bytes gauge');
    lines.push(`process_memory_heap_total_bytes ${snapshot.system.memory.heapTotalBytes}`);

    lines.push('# HELP process_cpu_user_seconds_total CPU user seconds since process start');
    lines.push('# TYPE process_cpu_user_seconds_total counter');
    lines.push(`process_cpu_user_seconds_total ${snapshot.system.cpuUserSeconds}`);

    lines.push('# HELP process_cpu_system_seconds_total CPU system seconds since process start');
    lines.push('# TYPE process_cpu_system_seconds_total counter');
    lines.push(`process_cpu_system_seconds_total ${snapshot.system.cpuSystemSeconds}`);

    return `${lines.join('\n')}\n`;
  }
}

export const metricsService = new MetricsService();
