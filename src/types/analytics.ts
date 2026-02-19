/**
 * Analytics & Reporting Type Definitions
 * WO-71: Analytics Data Models and Snapshot Infrastructure
 * Phase 11 Foundation
 */

// ============================================
// ENUMS
// ============================================

export type KPICategory = 
  | 'signups' 
  | 'events' 
  | 'ambassadors' 
  | 'financial' 
  | 'operations' 
  | 'quality' 
  | 'engagement' 
  | 'custom';

export type KPIAlertSeverity = 'info' | 'warning' | 'critical';

export type KPIAlertStatus = 'active' | 'acknowledged' | 'resolved' | 'snoozed';

export type ThresholdCondition = 
  | 'greater_than' 
  | 'less_than' 
  | 'greater_than_or_equal' 
  | 'less_than_or_equal' 
  | 'equals' 
  | 'not_equals'
  | 'percent_change_above' 
  | 'percent_change_below';

export type MetricAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'median' | 'p95' | 'p99';

export type SnapshotStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type AuditAction = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'view' 
  | 'export'
  | 'threshold_breach' 
  | 'alert_triggered' 
  | 'snapshot_created';

export type AggregationPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type WidgetType = 'number' | 'chart' | 'gauge' | 'trend' | 'table' | 'heatmap';

// ============================================
// CORE INTERFACES
// ============================================

/**
 * Daily Metrics Snapshot - Pre-computed daily analytics
 */
export interface DailyMetricsSnapshot {
  id: string;
  snapshotDate: Date | string;  // Can be Date or ISO string from DB
  snapshotStatus: SnapshotStatus;
  
  // Signup Metrics
  totalSignups: number;
  validatedSignups: number;
  rejectedSignups: number;
  pendingSignups: number;
  validationRate: number;
  duplicateRate: number;
  avgSignupProcessingTimeMs: number;
  
  // Event Metrics
  totalEvents: number;
  activeEvents: number;
  completedEvents: number;
  cancelledEvents: number;
  avgSignupsPerEvent: number;
  topPerformingEventId?: string;
  
  // Ambassador Metrics
  activeAmbassadors: number;
  newAmbassadors: number;
  checkedInAmbassadors: number;
  avgSignupsPerAmbassador: number;
  topPerformerId?: string;
  ambassadorUtilizationRate: number;
  
  // Financial Metrics
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  avgRevenuePerSignup: number;
  payrollCost: number;
  
  // Quality Metrics
  dataQualityScore: number;
  extractionSuccessRate: number;
  apiErrorRate: number;
  
  // Engagement Metrics
  portalActiveUsers: number;
  apiRequestsCount: number;
  avgResponseTimeMs: number;
  
  // Regional Breakdown
  metricsByRegion: Record<string, RegionMetrics>;
  metricsByOperator: Record<number, OperatorMetrics>;
  metricsBySkillLevel: Record<string, SkillLevelMetrics>;
  
  // Raw data for drill-down
  detailedMetrics: DetailedMetrics;
  
  // Processing metadata
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  processingDurationMs?: number;
  errorMessage?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * KPI Threshold - Configurable alert thresholds
 */
export interface KPIThreshold {
  id: string;
  
  // KPI Identification
  kpiName: string;
  kpiCategory: KPICategory;
  displayName: string;
  description?: string;
  
  // Threshold Configuration
  thresholdCondition: ThresholdCondition;
  thresholdValue: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  
  // Target/Baseline
  targetValue?: number;
  baselineValue?: number;
  unit?: string;
  
  // Alert Configuration
  alertSeverity: KPIAlertSeverity;
  alertEnabled: boolean;
  alertCooldownMinutes: number;
  lastAlertAt?: Date;
  
  // Notification Settings
  notificationChannels: NotificationChannel[];
  notificationRecipients?: NotificationRecipient[];
  
  // Aggregation Configuration
  aggregationType: MetricAggregation;
  aggregationPeriod: AggregationPeriod;
  
  // Scope (optional filtering)
  region?: string;
  operatorId?: number;
  eventId?: string;
  
  // Metadata
  isActive: boolean;
  isSystemKpi: boolean;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Threshold Version - Historical record of threshold changes
 * WO-74: Threshold versioning for audit and rollback
 */
export interface ThresholdVersion {
  id: string;
  thresholdId: string;
  versionNumber: number;
  
  // Snapshot of threshold state
  kpiName: string;
  kpiCategory: KPICategory;
  displayName: string;
  description?: string;
  
  // Threshold values
  thresholdCondition: ThresholdCondition;
  thresholdValue: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  targetValue?: number;
  
  // Alert configuration
  alertSeverity: KPIAlertSeverity;
  alertEnabled: boolean;
  alertCooldownMinutes?: number;
  
  // Notification settings
  notificationChannels: NotificationChannel[];
  notificationRecipients?: NotificationRecipient[];
  
  // Effective dating
  effectiveFrom: Date;
  effectiveTo?: Date;
  isCurrent: boolean;
  
  // Change tracking
  changeReason?: string;
  changedBy?: string;
  changedByEmail?: string;
  changeType: 'create' | 'update' | 'activate' | 'deactivate' | 'INSERT' | 'UPDATE';
  
  // Full state for rollback
  fullState?: Record<string, unknown>;
  
  createdAt: Date;
}

/**
 * KPI Alert - Generated when thresholds are breached
 */
export interface KPIAlert {
  id: string;
  
  // Reference to threshold
  thresholdId: string;
  
  // Alert Details
  kpiName: string;
  kpiCategory: KPICategory;
  alertSeverity: KPIAlertSeverity;
  alertStatus: KPIAlertStatus;
  
  // Values at time of alert
  currentValue: number;
  thresholdValue: number;
  thresholdCondition: ThresholdCondition;
  deviationPercent?: number;
  
  // Context
  alertMessage: string;
  alertContext?: AlertContext;
  snapshotDate?: Date;
  snapshotId?: string;
  
  // Resolution
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  
  // Snooze
  snoozedUntil?: Date;
  snoozedBy?: string;
  
  // Notification tracking
  notificationsSent: SentNotification[];
  lastNotificationAt?: Date;
  notificationCount: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Analytics Audit Log - Track all analytics operations
 */
export interface AnalyticsAuditLog {
  id: string;
  
  // Actor
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  
  // Action
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  resourceName?: string;
  
  // Details
  actionDetails?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  
  // Request context
  requestId?: string;
  apiEndpoint?: string;
  httpMethod?: string;
  
  // Outcome
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
  
  // Timestamp
  createdAt: Date;
}

// ============================================
// SUPPORTING INTERFACES
// ============================================

/**
 * KPI Definition
 */
export interface KPI {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: KPICategory;
  
  // Configuration
  calculationQuery?: string;
  calculationFunction?: string;
  unit?: string;
  formatPattern?: string;
  
  // Display
  dashboardPosition?: number;
  widgetType: WidgetType;
  chartConfig?: ChartConfig;
  
  // Status
  isActive: boolean;
  isFeatured: boolean;
  
  // Current value (calculated)
  currentValue?: number;
  trend?: TrendDirection;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * KPI Historical Value
 */
export interface KPIHistoricalValue {
  id: string;
  kpiName: string;
  valueDate: Date;
  value: number;
  valueContext?: Record<string, unknown>;
  snapshotId?: string;
  createdAt: Date;
}

/**
 * Metric Calculation Job
 */
export interface MetricCalculationJob {
  id: string;
  jobType: JobType;
  jobName: string;
  
  // Schedule
  cronExpression?: string;
  nextRunAt?: Date;
  lastRunAt?: Date;
  
  // Status
  isEnabled: boolean;
  isRunning: boolean;
  lastStatus?: string;
  lastError?: string;
  
  // Configuration
  config?: JobConfig;
  
  // Stats
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgDurationMs?: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Real-time Metrics Cache Entry
 */
export interface RealtimeMetricsCacheEntry {
  id: string;
  metricKey: string;
  metricValue: number;
  metricContext?: Record<string, unknown>;
  calculatedAt: Date;
  expiresAt: Date;
  ttlSeconds: number;
}

/**
 * Data Retention Policy
 */
export interface DataRetentionPolicy {
  id: string;
  tableName: string;
  retentionDays: number;
  archiveEnabled: boolean;
  archiveTableName?: string;
  lastCleanupAt?: Date;
  rowsDeleted: number;
  rowsArchived: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// NESTED / HELPER TYPES
// ============================================

export interface RegionMetrics {
  region: string;
  signups: number;
  events: number;
  revenue: number;
  activeAmbassadors: number;
}

export interface OperatorMetrics {
  operatorId: number;
  operatorName: string;
  signups: number;
  revenue: number;
  validationRate: number;
}

export interface SkillLevelMetrics {
  skillLevel: string;
  ambassadorCount: number;
  avgSignups: number;
  totalSignups: number;
}

export interface DetailedMetrics {
  signupsByHour?: Record<number, number>;
  topAmbassadors?: TopPerformer[];
  topEvents?: TopEvent[];
  signupsByOperator?: Record<number, number>;
  recentAlerts?: AlertSummary[];
}

export interface TopPerformer {
  id: string;
  name: string;
  signups: number;
  validationRate: number;
}

export interface TopEvent {
  id: string;
  title: string;
  signups: number;
  revenue: number;
}

export interface AlertSummary {
  id: string;
  kpiName: string;
  severity: KPIAlertSeverity;
  message: string;
  createdAt: Date;
}

export type NotificationChannel = 'email' | 'slack' | 'webhook' | 'sms' | 'push';

export interface NotificationRecipient {
  type: 'user' | 'email' | 'channel';
  value: string;
  name?: string;
}

export interface AlertContext {
  previousValue?: number;
  percentChange?: number;
  timeWindow?: string;
  affectedEntities?: string[];
  relatedMetrics?: Record<string, number>;
}

export interface SentNotification {
  channel: NotificationChannel;
  sentAt: Date;
  recipient: string;
  success: boolean;
  errorMessage?: string;
}

export type AuditResourceType = 
  | 'snapshot' 
  | 'kpi' 
  | 'alert' 
  | 'report' 
  | 'dashboard' 
  | 'threshold'
  | 'retention_policy'
  | 'calculation_job';

export type TrendDirection = 'up' | 'down' | 'stable';

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'area' | 'scatter';
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
}

export type JobType = 'daily_snapshot' | 'hourly_metrics' | 'realtime_kpi' | 'data_retention' | 'alert_check';

export interface JobConfig {
  timezone?: string;
  kpis?: string[];
  ttlSeconds?: number;
  batchSize?: number;
  retryCount?: number;
}

// ============================================
// DTOs - CREATE / UPDATE
// ============================================

export interface CreateDailySnapshotInput {
  snapshotDate: string;  // ISO date string
}

export interface CreateKPIThresholdInput {
  kpiName: string;
  kpiCategory: KPICategory;
  displayName: string;
  description?: string;
  thresholdCondition: ThresholdCondition;
  thresholdValue: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  targetValue?: number;
  unit?: string;
  alertSeverity?: KPIAlertSeverity;
  alertEnabled?: boolean;
  alertCooldownMinutes?: number;
  notificationChannels?: NotificationChannel[];
  notificationRecipients?: NotificationRecipient[];
  aggregationType?: MetricAggregation;
  aggregationPeriod?: AggregationPeriod;
  region?: string;
  operatorId?: number;
  eventId?: string;
}

export interface UpdateKPIThresholdInput {
  displayName?: string;
  description?: string;
  thresholdCondition?: ThresholdCondition;
  thresholdValue?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  targetValue?: number;
  unit?: string;
  alertSeverity?: KPIAlertSeverity;
  alertEnabled?: boolean;
  alertCooldownMinutes?: number;
  notificationChannels?: NotificationChannel[];
  notificationRecipients?: NotificationRecipient[];
  isActive?: boolean;
}

export interface AcknowledgeAlertInput {
  alertId: string;
  acknowledgedBy: string;
  notes?: string;
}

export interface ResolveAlertInput {
  alertId: string;
  resolvedBy: string;
  resolutionNotes: string;
}

export interface SnoozeAlertInput {
  alertId: string;
  snoozedBy: string;
  snoozedUntilMinutes: number;
}

export interface CreateRetentionPolicyInput {
  tableName: string;
  retentionDays: number;
  archiveEnabled?: boolean;
  archiveTableName?: string;
}

// ============================================
// QUERY / FILTER TYPES
// ============================================

export interface SnapshotQueryParams {
  fromDate: string;
  toDate: string;
  status?: SnapshotStatus;
  limit?: number;
  offset?: number;
}

export interface AlertQueryParams {
  status?: KPIAlertStatus;
  severity?: KPIAlertSeverity;
  kpiCategory?: KPICategory;
  kpiName?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogQueryParams {
  userId?: string;
  action?: AuditAction;
  resourceType?: AuditResourceType;
  resourceId?: string;
  fromDate?: string;
  toDate?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface KPIHistoryQueryParams {
  kpiName: string;
  fromDate: string;
  toDate: string;
  aggregation?: MetricAggregation;
}

// ============================================
// RESPONSE TYPES
// ============================================

export interface SnapshotComparisonResult {
  current: DailyMetricsSnapshot;
  previous: DailyMetricsSnapshot;
  changes: MetricChanges;
}

export interface MetricChanges {
  signups: ChangeMetric;
  revenue: ChangeMetric;
  validationRate: ChangeMetric;
  activeAmbassadors: ChangeMetric;
  activeEvents: ChangeMetric;
  [key: string]: ChangeMetric;
}

export interface ChangeMetric {
  current: number;
  previous: number;
  absoluteChange: number;
  percentChange: number;
  trend: TrendDirection;
}

export interface DashboardSummary {
  kpis: KPIWithValue[];
  activeAlerts: KPIAlert[];
  recentSnapshots: DailyMetricsSnapshot[];
  trends: TrendSummary;
}

export interface KPIWithValue extends KPI {
  currentValue: number;
  targetValue?: number;
  percentOfTarget?: number;
  trend: TrendDirection;
  lastUpdated: Date;
}

export interface TrendSummary {
  signups: TrendData[];
  revenue: TrendData[];
  ambassadors: TrendData[];
  events: TrendData[];
}

export interface TrendData {
  date: string;
  value: number;
}

// ============================================
// REAL-TIME METRIC TYPES
// ============================================

export interface RealtimeMetric {
  key: string;
  value: number;
  unit: string;
  calculatedAt: Date;
  ttlSeconds: number;
  source: 'cache' | 'calculated';
}

export interface RealtimeDashboardData {
  signupsToday: RealtimeMetric;
  signupsThisHour: RealtimeMetric;
  activeEvents: RealtimeMetric;
  activeAmbassadors: RealtimeMetric;
  validationRate: RealtimeMetric;
  pendingSignups: RealtimeMetric;
  lastUpdated: Date;
}

// ============================================
// CALCULATION TYPES
// ============================================

export interface MetricCalculationContext {
  date: Date;
  startOfDay: Date;
  endOfDay: Date;
  previousDay: Date;
  startOfWeek: Date;
  startOfMonth: Date;
}

export interface CalculatedMetrics {
  signups: SignupMetrics;
  events: EventMetrics;
  ambassadors: AmbassadorMetrics;
  financial: FinancialMetrics;
  quality: QualityMetrics;
}

export interface SignupMetrics {
  total: number;
  validated: number;
  rejected: number;
  pending: number;
  validationRate: number;
  duplicateRate: number;
  avgProcessingTimeMs: number;
}

export interface EventMetrics {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  avgSignupsPerEvent: number;
}

export interface AmbassadorMetrics {
  active: number;
  new: number;
  checkedIn: number;
  avgSignups: number;
  utilizationRate: number;
}

export interface FinancialMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
  profitMargin: number;
  avgRevenuePerSignup: number;
  payrollCost: number;
}

export interface QualityMetrics {
  dataQualityScore: number;
  extractionSuccessRate: number;
  apiErrorRate: number;
}
