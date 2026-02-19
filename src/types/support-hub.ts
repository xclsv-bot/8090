/**
 * Support Hub Types
 * WO-56: Support Hub Data Models
 * Phase 12: Support Hub Foundation
 */

// ============================================
// ENUMS
// ============================================

export type ArticleStatus = 'draft' | 'published' | 'archived';

export type ArticleCategory = 
  | 'getting_started'
  | 'signups'
  | 'events'
  | 'payroll'
  | 'troubleshooting'
  | 'policies'
  | 'best_practices'
  | 'faq';

export type VideoCategory = 
  | 'onboarding'
  | 'product_training'
  | 'sales_techniques'
  | 'compliance'
  | 'advanced_skills'
  | 'announcements';

export type VideoStatus = 'draft' | 'processing' | 'published' | 'archived';

export type TrainingProgressStatus = 'not_started' | 'in_progress' | 'completed';

export type TicketStatus = 
  | 'open'
  | 'in_progress'
  | 'waiting_on_user'
  | 'waiting_on_admin'
  | 'resolved'
  | 'closed';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketCategory = 
  | 'general_inquiry'
  | 'technical_issue'
  | 'payroll_question'
  | 'event_problem'
  | 'signup_issue'
  | 'account_access'
  | 'feedback'
  | 'other';

export type MessageSenderType = 'ambassador' | 'admin' | 'system';

// ============================================
// KNOWLEDGE BASE MODELS
// ============================================

export interface KnowledgeBaseArticle {
  id: string;
  
  // Content
  title: string;
  slug: string;
  content: string;  // Markdown content
  excerpt?: string;
  
  // Organization
  category: ArticleCategory;
  tags: string[];
  relatedArticleIds: string[];
  
  // Publishing
  status: ArticleStatus;
  publishedAt?: Date;
  
  // Authorship
  authorId?: string;
  lastEditedBy?: string;
  
  // Engagement Metrics
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  
  // SEO & Search
  metaTitle?: string;
  metaDescription?: string;
  searchKeywords?: string[];
  
  // Ordering
  sortOrder: number;
  isFeatured: boolean;
  isPinned: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticleFeedback {
  id: string;
  articleId: string;
  ambassadorId?: string;
  isHelpful: boolean;
  feedbackText?: string;
  createdAt: Date;
}

// ============================================
// TRAINING VIDEO MODELS
// ============================================

export interface TrainingVideo {
  id: string;
  
  // Content
  title: string;
  description?: string;
  
  // Video File
  videoUrl: string;  // S3 URL
  videoKey?: string;  // S3 key
  thumbnailUrl?: string;
  
  // Video Metadata
  durationSeconds: number;
  fileSizeBytes?: number;
  videoFormat?: string;
  resolution?: string;
  
  // Transcript
  transcript?: string;
  transcriptVtt?: string;  // WebVTT for captions
  
  // Organization
  category: VideoCategory;
  tags: string[];
  
  // Publishing
  status: VideoStatus;
  publishedAt?: Date;
  
  // Requirements
  isRequired: boolean;
  requiredForSkillLevels?: string[];
  prerequisiteVideoIds: string[];
  
  // Authorship
  createdBy?: string;
  
  // Ordering
  sortOrder: number;
  chapterNumber?: number;
  
  // Engagement
  totalViews: number;
  totalCompletions: number;
  averageWatchPercentage: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorTrainingProgress {
  id: string;
  
  // References
  ambassadorId: string;
  videoId: string;
  
  // Progress Tracking
  status: TrainingProgressStatus;
  watchDurationSeconds: number;
  lastPositionSeconds: number;
  watchPercentage: number;
  
  // Completion
  completedAt?: Date;
  completionCount: number;
  
  // Engagement
  startedAt?: Date;
  lastWatchedAt?: Date;
  
  // Quiz/Assessment
  quizScore?: number;
  quizPassed?: boolean;
  quizAttempts: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SUPPORT TICKET MODELS
// ============================================

export interface SupportTicket {
  id: string;
  
  // Ticket Number (SUP-2024-001 format)
  ticketNumber: string;
  
  // Subject and Description
  subject: string;
  description: string;
  
  // Categorization
  category: TicketCategory;
  tags: string[];
  
  // Status and Priority
  status: TicketStatus;
  priority: TicketPriority;
  
  // Assignment
  ambassadorId?: string;
  assignedTo?: string;
  assignedAt?: Date;
  
  // SLA Tracking
  slaDueAt?: Date;
  firstResponseAt?: Date;
  slaBreached: boolean;
  
  // Resolution
  resolvedAt?: Date;
  closedAt?: Date;
  resolutionNotes?: string;
  
  // Satisfaction
  satisfactionRating?: number;  // 1-5
  satisfactionFeedback?: string;
  
  // Related Items
  relatedEventId?: string;
  relatedSignupId?: string;
  relatedArticleIds: string[];
  
  // Metadata
  source: string;
  userAgent?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketAttachment {
  url: string;
  filename: string;
  size: number;
  type: string;
}

export interface TicketMessage {
  id: string;
  
  // Parent Ticket
  ticketId: string;
  
  // Message Content
  content: string;
  
  // Sender
  senderType: MessageSenderType;
  senderId?: string;
  senderName?: string;
  
  // Message Type
  isInternalNote: boolean;
  isSystemMessage: boolean;
  
  // Attachments
  attachments: TicketAttachment[];
  
  // Read Status
  readAt?: Date;
  readBy?: string;
  
  // Reply Threading
  replyToMessageId?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// VIEW MODELS
// ============================================

export interface ActiveTicketView extends SupportTicket {
  ambassadorName?: string;
  ambassadorEmail?: string;
  isSlaAtRisk: boolean;
  hoursUntilSlaBreach?: number;
  messageCount: number;
}

export interface AmbassadorTrainingStatusView {
  ambassadorId: string;
  ambassadorName: string;
  totalRequiredVideos: number;
  completedRequiredVideos: number;
  inProgressVideos: number;
  completionPercentage: number;
}

// ============================================
// INPUT TYPES
// ============================================

// Knowledge Base Article Inputs
export interface CreateArticleInput {
  title: string;
  slug?: string;  // Auto-generated if not provided
  content: string;
  excerpt?: string;
  category: ArticleCategory;
  tags?: string[];
  relatedArticleIds?: string[];
  status?: ArticleStatus;
  metaTitle?: string;
  metaDescription?: string;
  searchKeywords?: string[];
  sortOrder?: number;
  isFeatured?: boolean;
  isPinned?: boolean;
}

export interface UpdateArticleInput {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  category?: ArticleCategory;
  tags?: string[];
  relatedArticleIds?: string[];
  status?: ArticleStatus;
  metaTitle?: string;
  metaDescription?: string;
  searchKeywords?: string[];
  sortOrder?: number;
  isFeatured?: boolean;
  isPinned?: boolean;
}

export interface CreateArticleFeedbackInput {
  articleId: string;
  isHelpful: boolean;
  feedbackText?: string;
}

// Training Video Inputs
export interface CreateVideoInput {
  title: string;
  description?: string;
  videoUrl: string;
  videoKey?: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  fileSizeBytes?: number;
  videoFormat?: string;
  resolution?: string;
  transcript?: string;
  transcriptVtt?: string;
  category: VideoCategory;
  tags?: string[];
  status?: VideoStatus;
  isRequired?: boolean;
  requiredForSkillLevels?: string[];
  prerequisiteVideoIds?: string[];
  sortOrder?: number;
  chapterNumber?: number;
}

export interface UpdateVideoInput {
  title?: string;
  description?: string;
  videoUrl?: string;
  videoKey?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  transcript?: string;
  transcriptVtt?: string;
  category?: VideoCategory;
  tags?: string[];
  status?: VideoStatus;
  isRequired?: boolean;
  requiredForSkillLevels?: string[];
  prerequisiteVideoIds?: string[];
  sortOrder?: number;
  chapterNumber?: number;
}

export interface UpdateTrainingProgressInput {
  watchDurationSeconds?: number;
  lastPositionSeconds?: number;
  watchPercentage?: number;
  status?: TrainingProgressStatus;
  quizScore?: number;
  quizPassed?: boolean;
}

// Support Ticket Inputs
export interface CreateTicketInput {
  subject: string;
  description: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  tags?: string[];
  relatedEventId?: string;
  relatedSignupId?: string;
  source?: string;
}

export interface UpdateTicketInput {
  subject?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  tags?: string[];
  assignedTo?: string;
  resolutionNotes?: string;
  relatedArticleIds?: string[];
}

export interface CreateTicketMessageInput {
  ticketId: string;
  content: string;
  isInternalNote?: boolean;
  attachments?: TicketAttachment[];
  replyToMessageId?: string;
}

export interface SubmitTicketFeedbackInput {
  ticketId: string;
  satisfactionRating: number;  // 1-5
  satisfactionFeedback?: string;
}

// ============================================
// QUERY TYPES
// ============================================

export interface ArticleSearchFilters {
  category?: ArticleCategory;
  status?: ArticleStatus;
  tags?: string[];
  search?: string;  // Title/content search
  isFeatured?: boolean;
  isPinned?: boolean;
}

export interface VideoSearchFilters {
  category?: VideoCategory;
  status?: VideoStatus;
  tags?: string[];
  isRequired?: boolean;
  search?: string;
}

export interface TrainingProgressFilters {
  ambassadorId?: string;
  videoId?: string;
  status?: TrainingProgressStatus;
  completedOnly?: boolean;
}

export interface TicketSearchFilters {
  ambassadorId?: string;
  assignedTo?: string;
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  category?: TicketCategory;
  tags?: string[];
  search?: string;  // Subject/description search
  slaAtRisk?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

// ============================================
// SLA CONFIGURATION
// ============================================

export interface SLAConfig {
  priority: TicketPriority;
  responseTimeHours: number;
  resolutionTimeHours?: number;
}

export const DEFAULT_SLA_CONFIG: Record<TicketPriority, SLAConfig> = {
  urgent: { priority: 'urgent', responseTimeHours: 1, resolutionTimeHours: 4 },
  high: { priority: 'high', responseTimeHours: 4, resolutionTimeHours: 24 },
  normal: { priority: 'normal', responseTimeHours: 24, resolutionTimeHours: 72 },
  low: { priority: 'low', responseTimeHours: 72, resolutionTimeHours: 168 },
};

// ============================================
// STATISTICS TYPES
// ============================================

export interface KnowledgeBaseStats {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  totalViews: number;
  avgHelpfulRate: number;
  topCategories: { category: ArticleCategory; count: number }[];
}

export interface TrainingStats {
  totalVideos: number;
  totalRequiredVideos: number;
  avgCompletionRate: number;
  totalWatchTimeHours: number;
  ambassadorsFullyTrained: number;
  ambassadorsInProgress: number;
}

export interface SupportStats {
  openTickets: number;
  ticketsAtRisk: number;
  avgResponseTimeHours: number;
  avgResolutionTimeHours: number;
  ticketsByCategory: { category: TicketCategory; count: number }[];
  ticketsByPriority: { priority: TicketPriority; count: number }[];
  avgSatisfactionRating: number;
}
