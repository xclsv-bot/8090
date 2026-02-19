/**
 * Export Type Definitions
 * WO-75: Analytics Reporting and Export Functionality
 */

// ============================================
// ENUMS
// ============================================

export type ExportFormat = 'csv' | 'excel' | 'pdf';

export type ReportType =
  | 'signups'
  | 'event_performance'
  | 'ambassador_productivity'
  | 'financial'
  | 'validation'
  | 'operator_performance'
  | 'weekly_digest'
  | 'kpi_summary'
  | 'custom';

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type TemplateType =
  | 'executive_summary'
  | 'operational_report'
  | 'financial_report'
  | 'performance_review'
  | 'custom';

export type DeliveryMethod = 'download' | 'email' | 'scheduled';

export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'table';

// ============================================
// CORE INTERFACES
// ============================================

/**
 * Export Job - Track export requests
 */
export interface ExportJob {
  id: string;
  
  // Request details
  reportType: ReportType;
  format: ExportFormat;
  filters: ExportFilters;
  templateId?: string;
  
  // Processing
  status: ExportStatus;
  progress: number;
  
  // Result
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  
  // Delivery
  deliveryMethod: DeliveryMethod;
  deliveryEmail?: string;
  deliveredAt?: Date;
  
  // User context
  requestedBy: string;
  requestedByEmail?: string;
  
  // Error handling
  errorMessage?: string;
  retryCount: number;
  
  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

/**
 * Export Filters - Common filter parameters
 */
export interface ExportFilters {
  fromDate: string;
  toDate: string;
  
  // Optional filters
  region?: string;
  operatorId?: number;
  eventId?: string;
  ambassadorId?: string;
  status?: string;
  
  // Pagination for large exports
  limit?: number;
  offset?: number;
  
  // Custom fields to include
  includeFields?: string[];
  excludeFields?: string[];
  
  // Sorting
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Report Template - Customizable report templates
 */
export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  templateType: TemplateType;
  
  // Configuration
  reportTypes: ReportType[];
  defaultFilters?: Partial<ExportFilters>;
  sections: ReportSection[];
  
  // Styling
  headerConfig?: HeaderConfig;
  footerConfig?: FooterConfig;
  chartConfigs?: ChartConfig[];
  
  // Access
  isPublic: boolean;
  createdBy?: string;
  allowedRoles?: string[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Report Section - Individual section within a report
 */
export interface ReportSection {
  id: string;
  title: string;
  type: 'summary' | 'table' | 'chart' | 'text' | 'metrics';
  dataSource: ReportType;
  
  // Configuration
  columns?: ColumnConfig[];
  chartConfig?: ChartConfig;
  metricsConfig?: MetricsConfig;
  textContent?: string;
  
  // Display
  order: number;
  pageBreakBefore?: boolean;
  visible: boolean;
}

/**
 * Export Audit Log - Track all export operations
 */
export interface ExportAuditLog {
  id: string;
  exportJobId?: string;
  
  // Actor
  userId: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  
  // Action
  action: 'request' | 'download' | 'email_sent' | 'schedule_created' | 'failed';
  reportType: ReportType;
  format: ExportFormat;
  
  // Details
  filters: ExportFilters;
  rowCount?: number;
  fileSizeBytes?: number;
  durationMs?: number;
  
  // Result
  success: boolean;
  errorMessage?: string;
  
  // Timestamp
  createdAt: Date;
}

/**
 * Scheduled Export - Recurring export configuration
 */
export interface ScheduledExport {
  id: string;
  name: string;
  
  // Schedule
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  
  // Export config
  reportType: ReportType;
  format: ExportFormat;
  templateId?: string;
  filters: ExportFilters;
  
  // Delivery
  recipients: ExportRecipient[];
  emailSubject?: string;
  emailBody?: string;
  
  // Tracking
  lastRunAt?: Date;
  nextRunAt?: Date;
  lastStatus?: ExportStatus;
  runCount: number;
  failureCount: number;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Weekly Digest Subscription
 */
export interface DigestSubscription {
  id: string;
  userId: string;
  email: string;
  
  // Preferences
  isActive: boolean;
  deliveryDay: number; // 0-6 (Sunday-Saturday)
  deliveryHour: number; // 0-23
  timezone: string;
  
  // Content preferences
  includeSections: string[];
  format: 'html' | 'pdf' | 'both';
  
  // Tracking
  lastDeliveredAt?: Date;
  deliveryCount: number;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// HELPER INTERFACES
// ============================================

export interface ExportRecipient {
  email: string;
  name?: string;
  role?: string;
}

export interface HeaderConfig {
  showLogo: boolean;
  logoUrl?: string;
  title?: string;
  subtitle?: string;
  showDate: boolean;
  showPeriod: boolean;
}

export interface FooterConfig {
  showPageNumbers: boolean;
  showTimestamp: boolean;
  customText?: string;
}

export interface ChartConfig {
  type: ChartType;
  title: string;
  dataKey: string;
  xAxisKey?: string;
  yAxisKey?: string;
  colors?: string[];
  width?: number;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
}

export interface ColumnConfig {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime';
  formatPattern?: string;
}

export interface MetricsConfig {
  metrics: MetricDisplay[];
  layout: 'grid' | 'list' | 'cards';
  columns?: number;
}

export interface MetricDisplay {
  key: string;
  label: string;
  format: 'number' | 'currency' | 'percent';
  showTrend?: boolean;
  trendKey?: string;
}

// ============================================
// DTOs - REQUEST / RESPONSE
// ============================================

export interface CreateExportRequest {
  reportType: ReportType;
  format: ExportFormat;
  filters: ExportFilters;
  templateId?: string;
  deliveryMethod?: DeliveryMethod;
  deliveryEmail?: string;
}

export interface ExportResponse {
  jobId: string;
  status: ExportStatus;
  estimatedTime?: number;
  downloadUrl?: string;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  templateType: TemplateType;
  reportTypes: ReportType[];
  defaultFilters?: Partial<ExportFilters>;
  sections: Omit<ReportSection, 'id'>[];
  headerConfig?: HeaderConfig;
  footerConfig?: FooterConfig;
  isPublic?: boolean;
  allowedRoles?: string[];
}

export interface CreateScheduledExportRequest {
  name: string;
  cronExpression: string;
  timezone: string;
  reportType: ReportType;
  format: ExportFormat;
  templateId?: string;
  filters: ExportFilters;
  recipients: ExportRecipient[];
  emailSubject?: string;
  emailBody?: string;
}

export interface SubscribeDigestRequest {
  email: string;
  deliveryDay?: number;
  deliveryHour?: number;
  timezone?: string;
  includeSections?: string[];
  format?: 'html' | 'pdf' | 'both';
}

// ============================================
// EXPORT DATA STRUCTURES
// ============================================

export interface ExportableSignup {
  id: string;
  createdAt: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerState: string;
  validationStatus: string;
  ambassadorName: string;
  operatorName: string;
  eventTitle?: string;
}

export interface ExportableEvent {
  id: string;
  title: string;
  eventDate: string;
  venue: string;
  region: string;
  status: string;
  signupCount: number;
  ambassadorCount: number;
  expenses: number;
  revenue: number;
  roi: number;
}

export interface ExportableAmbassador {
  id: string;
  name: string;
  email: string;
  skillLevel: string;
  status: string;
  signupCount: number;
  validationRate: number;
  earnings: number;
  eventsWorked: number;
}

export interface ExportableFinancial {
  period: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  margin: number;
  signupCount: number;
  revenuePerSignup: number;
}

// ============================================
// PDF SPECIFIC TYPES
// ============================================

export interface PDFOptions {
  pageSize: 'letter' | 'a4';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  headerHeight?: number;
  footerHeight?: number;
}

export interface PDFChart {
  type: ChartType;
  title: string;
  data: Record<string, unknown>[];
  width: number;
  height: number;
  imageBase64?: string;
}

export interface PDFTable {
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
  headerStyle?: {
    backgroundColor: string;
    textColor: string;
    fontWeight: string;
  };
}
