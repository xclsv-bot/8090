/**
 * Support Hub Service
 * WO-57: Support Hub API and Backend Services
 * Phase 12: Support Hub Foundation
 * 
 * Provides comprehensive backend services for:
 * - Knowledge base articles with search and feedback
 * - Training videos with progress tracking
 * - Support tickets with auto-assignment and SLA
 * - Direct messaging between ambassadors and admins
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import {
  DEFAULT_SLA_CONFIG,
  type KnowledgeBaseArticle,
  type ArticleFeedback,
  type CreateArticleInput,
  type UpdateArticleInput,
  type CreateArticleFeedbackInput,
  type ArticleSearchFilters,
  type ArticleStatus,
  type ArticleCategory,
  type KnowledgeBaseStats,
  type TrainingVideo,
  type AmbassadorTrainingProgress,
  type CreateVideoInput,
  type UpdateVideoInput,
  type UpdateTrainingProgressInput,
  type VideoSearchFilters,
  type TrainingProgressFilters,
  type VideoStatus,
  type VideoCategory,
  type TrainingProgressStatus,
  type TrainingStats,
  type AmbassadorTrainingStatusView,
  type SupportTicket,
  type TicketMessage,
  type ActiveTicketView,
  type CreateTicketInput,
  type UpdateTicketInput,
  type CreateTicketMessageInput,
  type SubmitTicketFeedbackInput,
  type TicketSearchFilters,
  type TicketStatus,
  type TicketPriority,
  type TicketCategory,
  type SupportStats,
} from '../types/support-hub.js';

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `SUP-${year}-${random}`;
}

function calculateSlaDueDate(priority: TicketPriority): Date {
  const slaConfig = DEFAULT_SLA_CONFIG[priority];
  const dueDate = new Date();
  dueDate.setHours(dueDate.getHours() + slaConfig.responseTimeHours);
  return dueDate;
}

// ============================================
// KNOWLEDGE BASE SERVICE
// ============================================

class KnowledgeBaseService {
  /**
   * Create a new article
   */
  async createArticle(input: CreateArticleInput, authorId?: string): Promise<KnowledgeBaseArticle> {
    const slug = input.slug || generateSlug(input.title);
    
    const result = await db.queryOne<KnowledgeBaseArticle>(
      `INSERT INTO knowledge_base_articles (
        title, slug, content, excerpt, category, tags, related_article_ids,
        status, meta_title, meta_description, search_keywords,
        sort_order, is_featured, is_pinned, author_id, last_edited_by,
        published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16)
      RETURNING *`,
      [
        input.title,
        slug,
        input.content,
        input.excerpt,
        input.category,
        input.tags || [],
        input.relatedArticleIds || [],
        input.status || 'draft',
        input.metaTitle,
        input.metaDescription,
        input.searchKeywords || [],
        input.sortOrder || 0,
        input.isFeatured || false,
        input.isPinned || false,
        authorId,
        input.status === 'published' ? new Date() : null,
      ]
    );

    logger.info({ articleId: result?.id, title: input.title }, 'Article created');
    return result!;
  }

  /**
   * Get article by ID
   */
  async getArticleById(id: string): Promise<KnowledgeBaseArticle | null> {
    return db.queryOne<KnowledgeBaseArticle>(
      'SELECT * FROM knowledge_base_articles WHERE id = $1',
      [id]
    );
  }

  /**
   * Get article by slug
   */
  async getArticleBySlug(slug: string): Promise<KnowledgeBaseArticle | null> {
    return db.queryOne<KnowledgeBaseArticle>(
      'SELECT * FROM knowledge_base_articles WHERE slug = $1',
      [slug]
    );
  }

  /**
   * Update an article
   */
  async updateArticle(
    id: string, 
    input: UpdateArticleInput, 
    editorId?: string
  ): Promise<KnowledgeBaseArticle | null> {
    const current = await this.getArticleById(id);
    if (!current) return null;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      slug: 'slug',
      content: 'content',
      excerpt: 'excerpt',
      category: 'category',
      tags: 'tags',
      relatedArticleIds: 'related_article_ids',
      status: 'status',
      metaTitle: 'meta_title',
      metaDescription: 'meta_description',
      searchKeywords: 'search_keywords',
      sortOrder: 'sort_order',
      isFeatured: 'is_featured',
      isPinned: 'is_pinned',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      const value = input[key as keyof UpdateArticleInput];
      if (value !== undefined) {
        fields.push(`${dbField} = $${paramIndex++}`);
        values.push(value);
      }
    }

    // Track if status changed to published
    if (input.status === 'published' && current.status !== 'published') {
      fields.push(`published_at = $${paramIndex++}`);
      values.push(new Date());
    }

    // Update editor
    fields.push(`last_edited_by = $${paramIndex++}`);
    values.push(editorId);

    if (fields.length === 0) return current;

    values.push(id);
    return db.queryOne<KnowledgeBaseArticle>(
      `UPDATE knowledge_base_articles SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }

  /**
   * Delete an article
   */
  async deleteArticle(id: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM knowledge_base_articles WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Search articles with filters and full-text search
   */
  async searchArticles(
    filters: ArticleSearchFilters, 
    page = 1, 
    limit = 20
  ): Promise<{ items: KnowledgeBaseArticle[]; total: number; page: number; limit: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filters.category);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${paramIndex++}`);
      values.push(filters.tags);
    }

    if (filters.isFeatured !== undefined) {
      conditions.push(`is_featured = $${paramIndex++}`);
      values.push(filters.isFeatured);
    }

    if (filters.isPinned !== undefined) {
      conditions.push(`is_pinned = $${paramIndex++}`);
      values.push(filters.isPinned);
    }

    // Full-text search across title, content, and keywords
    if (filters.search) {
      conditions.push(`(
        title ILIKE $${paramIndex} OR
        content ILIKE $${paramIndex} OR
        excerpt ILIKE $${paramIndex} OR
        $${paramIndex}::text = ANY(search_keywords)
      )`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Order by: pinned first, then featured, then by helpfulness score, then recency
    const orderClause = `
      ORDER BY is_pinned DESC, is_featured DESC, 
      (helpful_count - not_helpful_count) DESC, 
      published_at DESC NULLS LAST, created_at DESC
    `;

    const [items, countResult] = await Promise.all([
      db.queryMany<KnowledgeBaseArticle>(
        `SELECT * FROM knowledge_base_articles ${whereClause}
         ${orderClause}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM knowledge_base_articles ${whereClause}`,
        values
      ),
    ]);

    return {
      items,
      total: parseInt(countResult?.count || '0'),
      page,
      limit,
    };
  }

  /**
   * Increment article view count
   */
  async incrementViewCount(articleId: string): Promise<void> {
    await db.query(
      'UPDATE knowledge_base_articles SET view_count = view_count + 1 WHERE id = $1',
      [articleId]
    );
  }

  /**
   * Submit article feedback (helpful/not helpful vote)
   */
  async submitFeedback(
    input: CreateArticleFeedbackInput, 
    ambassadorId?: string
  ): Promise<ArticleFeedback> {
    // Check for existing feedback from this ambassador
    if (ambassadorId) {
      const existing = await db.queryOne<ArticleFeedback>(
        'SELECT * FROM article_feedback WHERE article_id = $1 AND ambassador_id = $2',
        [input.articleId, ambassadorId]
      );

      if (existing) {
        // Update existing feedback
        const result = await db.queryOne<ArticleFeedback>(
          `UPDATE article_feedback 
           SET is_helpful = $1, feedback_text = $2, created_at = NOW()
           WHERE article_id = $3 AND ambassador_id = $4
           RETURNING *`,
          [input.isHelpful, input.feedbackText, input.articleId, ambassadorId]
        );

        // Update article counts based on change
        if (existing.isHelpful !== input.isHelpful) {
          if (input.isHelpful) {
            await db.query(
              `UPDATE knowledge_base_articles 
               SET helpful_count = helpful_count + 1, not_helpful_count = not_helpful_count - 1
               WHERE id = $1`,
              [input.articleId]
            );
          } else {
            await db.query(
              `UPDATE knowledge_base_articles 
               SET helpful_count = helpful_count - 1, not_helpful_count = not_helpful_count + 1
               WHERE id = $1`,
              [input.articleId]
            );
          }
        }

        return result!;
      }
    }

    // Create new feedback
    const result = await db.queryOne<ArticleFeedback>(
      `INSERT INTO article_feedback (article_id, ambassador_id, is_helpful, feedback_text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.articleId, ambassadorId, input.isHelpful, input.feedbackText]
    );

    // Update article counts
    const countField = input.isHelpful ? 'helpful_count' : 'not_helpful_count';
    await db.query(
      `UPDATE knowledge_base_articles SET ${countField} = ${countField} + 1 WHERE id = $1`,
      [input.articleId]
    );

    return result!;
  }

  /**
   * Get knowledge base statistics
   */
  async getStats(): Promise<KnowledgeBaseStats> {
    const stats = await db.queryOne<{
      total_articles: string;
      published_articles: string;
      draft_articles: string;
      total_views: string;
      total_helpful: string;
      total_not_helpful: string;
    }>(
      `SELECT 
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE status = 'published') as published_articles,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_articles,
        COALESCE(SUM(view_count), 0) as total_views,
        COALESCE(SUM(helpful_count), 0) as total_helpful,
        COALESCE(SUM(not_helpful_count), 0) as total_not_helpful
       FROM knowledge_base_articles`
    );

    const topCategories = await db.queryMany<{ category: ArticleCategory; count: string }>(
      `SELECT category, COUNT(*) as count 
       FROM knowledge_base_articles 
       WHERE status = 'published'
       GROUP BY category 
       ORDER BY count DESC 
       LIMIT 5`
    );

    const totalHelpful = parseInt(stats?.total_helpful || '0');
    const totalNotHelpful = parseInt(stats?.total_not_helpful || '0');
    const totalVotes = totalHelpful + totalNotHelpful;

    return {
      totalArticles: parseInt(stats?.total_articles || '0'),
      publishedArticles: parseInt(stats?.published_articles || '0'),
      draftArticles: parseInt(stats?.draft_articles || '0'),
      totalViews: parseInt(stats?.total_views || '0'),
      avgHelpfulRate: totalVotes > 0 ? (totalHelpful / totalVotes) * 100 : 0,
      topCategories: topCategories.map(tc => ({
        category: tc.category,
        count: parseInt(tc.count),
      })),
    };
  }

  /**
   * Get related articles
   */
  async getRelatedArticles(articleId: string, limit = 5): Promise<KnowledgeBaseArticle[]> {
    const article = await this.getArticleById(articleId);
    if (!article) return [];

    // Get articles with matching tags or in same category
    return db.queryMany<KnowledgeBaseArticle>(
      `SELECT * FROM knowledge_base_articles 
       WHERE id != $1 AND status = 'published'
       AND (category = $2 OR tags && $3)
       ORDER BY 
         CASE WHEN category = $2 THEN 1 ELSE 0 END +
         COALESCE(array_length(tags & $3, 1), 0) DESC,
         helpful_count DESC
       LIMIT $4`,
      [articleId, article.category, article.tags, limit]
    );
  }
}

// ============================================
// TRAINING VIDEO SERVICE
// ============================================

class TrainingVideoService {
  /**
   * Create a new training video
   */
  async createVideo(input: CreateVideoInput, createdBy?: string): Promise<TrainingVideo> {
    const result = await db.queryOne<TrainingVideo>(
      `INSERT INTO training_videos (
        title, description, video_url, video_key, thumbnail_url,
        duration_seconds, file_size_bytes, video_format, resolution,
        transcript, transcript_vtt, category, tags, status,
        is_required, required_for_skill_levels, prerequisite_video_ids,
        sort_order, chapter_number, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        input.title,
        input.description,
        input.videoUrl,
        input.videoKey,
        input.thumbnailUrl,
        input.durationSeconds,
        input.fileSizeBytes,
        input.videoFormat,
        input.resolution,
        input.transcript,
        input.transcriptVtt,
        input.category,
        input.tags || [],
        input.status || 'draft',
        input.isRequired || false,
        input.requiredForSkillLevels || [],
        input.prerequisiteVideoIds || [],
        input.sortOrder || 0,
        input.chapterNumber,
        createdBy,
      ]
    );

    logger.info({ videoId: result?.id, title: input.title }, 'Training video created');
    return result!;
  }

  /**
   * Get video by ID
   */
  async getVideoById(id: string): Promise<TrainingVideo | null> {
    return db.queryOne<TrainingVideo>(
      'SELECT * FROM training_videos WHERE id = $1',
      [id]
    );
  }

  /**
   * Update a video
   */
  async updateVideo(id: string, input: UpdateVideoInput): Promise<TrainingVideo | null> {
    const current = await this.getVideoById(id);
    if (!current) return null;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      videoUrl: 'video_url',
      videoKey: 'video_key',
      thumbnailUrl: 'thumbnail_url',
      durationSeconds: 'duration_seconds',
      transcript: 'transcript',
      transcriptVtt: 'transcript_vtt',
      category: 'category',
      tags: 'tags',
      status: 'status',
      isRequired: 'is_required',
      requiredForSkillLevels: 'required_for_skill_levels',
      prerequisiteVideoIds: 'prerequisite_video_ids',
      sortOrder: 'sort_order',
      chapterNumber: 'chapter_number',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      const value = input[key as keyof UpdateVideoInput];
      if (value !== undefined) {
        fields.push(`${dbField} = $${paramIndex++}`);
        values.push(value);
      }
    }

    // Track if status changed to published
    if (input.status === 'published' && current.status !== 'published') {
      fields.push(`published_at = $${paramIndex++}`);
      values.push(new Date());
    }

    if (fields.length === 0) return current;

    values.push(id);
    return db.queryOne<TrainingVideo>(
      `UPDATE training_videos SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }

  /**
   * Delete a video
   */
  async deleteVideo(id: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM training_videos WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Search videos with filters
   */
  async searchVideos(
    filters: VideoSearchFilters, 
    page = 1, 
    limit = 20
  ): Promise<{ items: TrainingVideo[]; total: number; page: number; limit: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filters.category);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${paramIndex++}`);
      values.push(filters.tags);
    }

    if (filters.isRequired !== undefined) {
      conditions.push(`is_required = $${paramIndex++}`);
      values.push(filters.isRequired);
    }

    // Full-text search across title, description, and transcript
    if (filters.search) {
      conditions.push(`(
        title ILIKE $${paramIndex} OR
        description ILIKE $${paramIndex} OR
        transcript ILIKE $${paramIndex}
      )`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.queryMany<TrainingVideo>(
        `SELECT * FROM training_videos ${whereClause}
         ORDER BY is_required DESC, sort_order ASC, chapter_number ASC NULLS LAST, created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM training_videos ${whereClause}`,
        values
      ),
    ]);

    return {
      items,
      total: parseInt(countResult?.count || '0'),
      page,
      limit,
    };
  }

  /**
   * Get videos by category
   */
  async getVideosByCategory(category: VideoCategory): Promise<TrainingVideo[]> {
    return db.queryMany<TrainingVideo>(
      `SELECT * FROM training_videos 
       WHERE category = $1 AND status = 'published'
       ORDER BY sort_order ASC, chapter_number ASC NULLS LAST`,
      [category]
    );
  }

  /**
   * Increment video view count
   */
  async incrementViewCount(videoId: string): Promise<void> {
    await db.query(
      'UPDATE training_videos SET total_views = total_views + 1 WHERE id = $1',
      [videoId]
    );
  }

  /**
   * Get or create training progress for ambassador
   */
  async getOrCreateProgress(
    ambassadorId: string, 
    videoId: string
  ): Promise<AmbassadorTrainingProgress> {
    let progress = await db.queryOne<AmbassadorTrainingProgress>(
      'SELECT * FROM ambassador_training_progress WHERE ambassador_id = $1 AND video_id = $2',
      [ambassadorId, videoId]
    );

    if (!progress) {
      progress = await db.queryOne<AmbassadorTrainingProgress>(
        `INSERT INTO ambassador_training_progress (ambassador_id, video_id, status, started_at)
         VALUES ($1, $2, 'not_started', NOW())
         RETURNING *`,
        [ambassadorId, videoId]
      );
    }

    return progress!;
  }

  /**
   * Update training progress
   */
  async updateProgress(
    ambassadorId: string,
    videoId: string,
    input: UpdateTrainingProgressInput
  ): Promise<AmbassadorTrainingProgress> {
    const progress = await this.getOrCreateProgress(ambassadorId, videoId);
    const video = await this.getVideoById(videoId);

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.watchDurationSeconds !== undefined) {
      fields.push(`watch_duration_seconds = $${paramIndex++}`);
      values.push(input.watchDurationSeconds);
    }

    if (input.lastPositionSeconds !== undefined) {
      fields.push(`last_position_seconds = $${paramIndex++}`);
      values.push(input.lastPositionSeconds);
    }

    if (input.watchPercentage !== undefined) {
      fields.push(`watch_percentage = $${paramIndex++}`);
      values.push(input.watchPercentage);
    }

    // Auto-update status based on watch percentage
    let newStatus = input.status || progress.status;
    const watchPercentage = input.watchPercentage ?? progress.watchPercentage;
    
    if (newStatus === 'not_started' && watchPercentage > 0) {
      newStatus = 'in_progress';
    }
    if (watchPercentage >= 90 && newStatus !== 'completed') {
      newStatus = 'completed';
    }

    if (newStatus !== progress.status) {
      fields.push(`status = $${paramIndex++}`);
      values.push(newStatus);

      if (newStatus === 'in_progress' && !progress.startedAt) {
        fields.push(`started_at = $${paramIndex++}`);
        values.push(new Date());
      }

      if (newStatus === 'completed') {
        fields.push(`completed_at = $${paramIndex++}`);
        values.push(new Date());
        fields.push(`completion_count = completion_count + 1`);

        // Update video completion count
        await db.query(
          'UPDATE training_videos SET total_completions = total_completions + 1 WHERE id = $1',
          [videoId]
        );
      }
    }

    // Update last watched timestamp
    fields.push(`last_watched_at = $${paramIndex++}`);
    values.push(new Date());

    if (input.quizScore !== undefined) {
      fields.push(`quiz_score = $${paramIndex++}`);
      values.push(input.quizScore);
    }

    if (input.quizPassed !== undefined) {
      fields.push(`quiz_passed = $${paramIndex++}`);
      values.push(input.quizPassed);
      if (input.quizPassed !== undefined) {
        fields.push(`quiz_attempts = quiz_attempts + 1`);
      }
    }

    values.push(ambassadorId, videoId);
    const result = await db.queryOne<AmbassadorTrainingProgress>(
      `UPDATE ambassador_training_progress 
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE ambassador_id = $${paramIndex} AND video_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    // Update video's average watch percentage
    await this.updateVideoAvgWatchPercentage(videoId);

    return result!;
  }

  /**
   * Update video's average watch percentage
   */
  private async updateVideoAvgWatchPercentage(videoId: string): Promise<void> {
    await db.query(
      `UPDATE training_videos 
       SET average_watch_percentage = (
         SELECT COALESCE(AVG(watch_percentage), 0) 
         FROM ambassador_training_progress 
         WHERE video_id = $1
       )
       WHERE id = $1`,
      [videoId]
    );
  }

  /**
   * Get training progress for ambassador
   */
  async getProgressForAmbassador(
    ambassadorId: string,
    filters?: TrainingProgressFilters
  ): Promise<AmbassadorTrainingProgress[]> {
    const conditions: string[] = ['ambassador_id = $1'];
    const values: unknown[] = [ambassadorId];
    let paramIndex = 2;

    if (filters?.videoId) {
      conditions.push(`video_id = $${paramIndex++}`);
      values.push(filters.videoId);
    }

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters?.completedOnly) {
      conditions.push(`status = 'completed'`);
    }

    return db.queryMany<AmbassadorTrainingProgress>(
      `SELECT * FROM ambassador_training_progress 
       WHERE ${conditions.join(' AND ')}
       ORDER BY last_watched_at DESC NULLS LAST`,
      values
    );
  }

  /**
   * Get ambassador training status summary
   */
  async getAmbassadorTrainingStatus(ambassadorId: string): Promise<AmbassadorTrainingStatusView> {
    const ambassador = await db.queryOne<{ first_name: string; last_name: string }>(
      'SELECT first_name, last_name FROM ambassadors WHERE id = $1',
      [ambassadorId]
    );

    const stats = await db.queryOne<{
      total_required: string;
      completed_required: string;
      in_progress: string;
    }>(
      `SELECT 
        (SELECT COUNT(*) FROM training_videos WHERE is_required = true AND status = 'published') as total_required,
        COUNT(*) FILTER (WHERE p.status = 'completed') as completed_required,
        COUNT(*) FILTER (WHERE p.status = 'in_progress') as in_progress
       FROM training_videos v
       LEFT JOIN ambassador_training_progress p ON v.id = p.video_id AND p.ambassador_id = $1
       WHERE v.is_required = true AND v.status = 'published'`,
      [ambassadorId]
    );

    const totalRequired = parseInt(stats?.total_required || '0');
    const completedRequired = parseInt(stats?.completed_required || '0');

    return {
      ambassadorId,
      ambassadorName: ambassador ? `${ambassador.first_name} ${ambassador.last_name}` : 'Unknown',
      totalRequiredVideos: totalRequired,
      completedRequiredVideos: completedRequired,
      inProgressVideos: parseInt(stats?.in_progress || '0'),
      completionPercentage: totalRequired > 0 ? (completedRequired / totalRequired) * 100 : 0,
    };
  }

  /**
   * Get training statistics
   */
  async getStats(): Promise<TrainingStats> {
    const stats = await db.queryOne<{
      total_videos: string;
      total_required: string;
      total_watch_time: string;
    }>(
      `SELECT 
        COUNT(*) as total_videos,
        COUNT(*) FILTER (WHERE is_required = true) as total_required,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(watch_duration_seconds), 0) FROM ambassador_training_progress WHERE video_id = training_videos.id)
        ), 0) as total_watch_time
       FROM training_videos WHERE status = 'published'`
    );

    const completionStats = await db.queryOne<{
      fully_trained: string;
      in_progress: string;
      avg_completion: string;
    }>(
      `WITH ambassador_completion AS (
        SELECT 
          p.ambassador_id,
          COUNT(*) FILTER (WHERE p.status = 'completed') as completed,
          (SELECT COUNT(*) FROM training_videos WHERE is_required = true AND status = 'published') as total
        FROM ambassador_training_progress p
        JOIN training_videos v ON p.video_id = v.id
        WHERE v.is_required = true AND v.status = 'published'
        GROUP BY p.ambassador_id
      )
      SELECT 
        COUNT(*) FILTER (WHERE completed >= total) as fully_trained,
        COUNT(*) FILTER (WHERE completed > 0 AND completed < total) as in_progress,
        COALESCE(AVG(completed::float / NULLIF(total, 0) * 100), 0) as avg_completion
       FROM ambassador_completion`
    );

    return {
      totalVideos: parseInt(stats?.total_videos || '0'),
      totalRequiredVideos: parseInt(stats?.total_required || '0'),
      avgCompletionRate: parseFloat(completionStats?.avg_completion || '0'),
      totalWatchTimeHours: parseInt(stats?.total_watch_time || '0') / 3600,
      ambassadorsFullyTrained: parseInt(completionStats?.fully_trained || '0'),
      ambassadorsInProgress: parseInt(completionStats?.in_progress || '0'),
    };
  }
}

// ============================================
// SUPPORT TICKET SERVICE
// ============================================

class SupportTicketService {
  /**
   * Create a new support ticket
   */
  async createTicket(input: CreateTicketInput, ambassadorId?: string): Promise<SupportTicket> {
    const ticketNumber = generateTicketNumber();
    const priority = input.priority || 'normal';
    const slaDueAt = calculateSlaDueDate(priority);

    const result = await db.queryOne<SupportTicket>(
      `INSERT INTO support_tickets (
        ticket_number, subject, description, category, priority,
        tags, ambassador_id, sla_due_at, related_event_id, 
        related_signup_id, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        ticketNumber,
        input.subject,
        input.description,
        input.category || 'general_inquiry',
        priority,
        input.tags || [],
        ambassadorId,
        slaDueAt,
        input.relatedEventId,
        input.relatedSignupId,
        input.source || 'app',
      ]
    );

    // Auto-assign based on category and workload
    await this.autoAssignTicket(result!.id);

    logger.info({ ticketId: result?.id, ticketNumber }, 'Support ticket created');
    return result!;
  }

  /**
   * Get ticket by ID
   */
  async getTicketById(id: string): Promise<SupportTicket | null> {
    return db.queryOne<SupportTicket>(
      'SELECT * FROM support_tickets WHERE id = $1',
      [id]
    );
  }

  /**
   * Get ticket by ticket number
   */
  async getTicketByNumber(ticketNumber: string): Promise<SupportTicket | null> {
    return db.queryOne<SupportTicket>(
      'SELECT * FROM support_tickets WHERE ticket_number = $1',
      [ticketNumber]
    );
  }

  /**
   * Update a ticket
   */
  async updateTicket(id: string, input: UpdateTicketInput): Promise<SupportTicket | null> {
    const current = await this.getTicketById(id);
    if (!current) return null;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      subject: 'subject',
      description: 'description',
      category: 'category',
      priority: 'priority',
      status: 'status',
      tags: 'tags',
      assignedTo: 'assigned_to',
      resolutionNotes: 'resolution_notes',
      relatedArticleIds: 'related_article_ids',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      const value = input[key as keyof UpdateTicketInput];
      if (value !== undefined) {
        fields.push(`${dbField} = $${paramIndex++}`);
        values.push(value);
      }
    }

    // Handle assignment timestamp
    if (input.assignedTo && input.assignedTo !== current.assignedTo) {
      fields.push(`assigned_at = $${paramIndex++}`);
      values.push(new Date());
    }

    // Handle priority change - update SLA
    if (input.priority && input.priority !== current.priority) {
      const newSlaDue = calculateSlaDueDate(input.priority);
      fields.push(`sla_due_at = $${paramIndex++}`);
      values.push(newSlaDue);
    }

    // Handle status changes
    if (input.status && input.status !== current.status) {
      if (input.status === 'resolved') {
        fields.push(`resolved_at = $${paramIndex++}`);
        values.push(new Date());
      }
      if (input.status === 'closed') {
        fields.push(`closed_at = $${paramIndex++}`);
        values.push(new Date());
      }
    }

    if (fields.length === 0) return current;

    values.push(id);
    const result = await db.queryOne<SupportTicket>(
      `UPDATE support_tickets SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    // Check SLA breach
    await this.checkAndUpdateSlaStatus(id);

    return result;
  }

  /**
   * Auto-assign ticket to admin with lowest workload
   */
  private async autoAssignTicket(ticketId: string): Promise<void> {
    // Find admin with fewest open tickets
    const admin = await db.queryOne<{ id: string }>(
      `SELECT u.id
       FROM users u
       WHERE u.role = 'admin'
       ORDER BY (
         SELECT COUNT(*) FROM support_tickets 
         WHERE assigned_to = u.id AND status NOT IN ('resolved', 'closed')
       ) ASC
       LIMIT 1`
    );

    if (admin) {
      await db.query(
        'UPDATE support_tickets SET assigned_to = $1, assigned_at = NOW() WHERE id = $2',
        [admin.id, ticketId]
      );
    }
  }

  /**
   * Check and update SLA breach status
   */
  private async checkAndUpdateSlaStatus(ticketId: string): Promise<void> {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket || ticket.status === 'resolved' || ticket.status === 'closed') return;

    const now = new Date();
    if (ticket.slaDueAt && now > ticket.slaDueAt && !ticket.slaBreached) {
      await db.query(
        'UPDATE support_tickets SET sla_breached = true WHERE id = $1',
        [ticketId]
      );
    }
  }

  /**
   * Search tickets with filters
   */
  async searchTickets(
    filters: TicketSearchFilters,
    page = 1,
    limit = 20
  ): Promise<{ items: ActiveTicketView[]; total: number; page: number; limit: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.ambassadorId) {
      conditions.push(`t.ambassador_id = $${paramIndex++}`);
      values.push(filters.ambassadorId);
    }

    if (filters.assignedTo) {
      conditions.push(`t.assigned_to = $${paramIndex++}`);
      values.push(filters.assignedTo);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`t.status = ANY($${paramIndex++})`);
        values.push(filters.status);
      } else {
        conditions.push(`t.status = $${paramIndex++}`);
        values.push(filters.status);
      }
    }

    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        conditions.push(`t.priority = ANY($${paramIndex++})`);
        values.push(filters.priority);
      } else {
        conditions.push(`t.priority = $${paramIndex++}`);
        values.push(filters.priority);
      }
    }

    if (filters.category) {
      conditions.push(`t.category = $${paramIndex++}`);
      values.push(filters.category);
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`t.tags && $${paramIndex++}`);
      values.push(filters.tags);
    }

    if (filters.search) {
      conditions.push(`(t.subject ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.slaAtRisk) {
      // SLA at risk = within 2 hours of breach or already breached
      conditions.push(`(t.sla_breached = true OR t.sla_due_at < NOW() + INTERVAL '2 hours')`);
    }

    if (filters.createdAfter) {
      conditions.push(`t.created_at >= $${paramIndex++}`);
      values.push(filters.createdAfter);
    }

    if (filters.createdBefore) {
      conditions.push(`t.created_at <= $${paramIndex++}`);
      values.push(filters.createdBefore);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.queryMany<ActiveTicketView>(
        `SELECT 
          t.*,
          a.first_name || ' ' || a.last_name as ambassador_name,
          a.email as ambassador_email,
          CASE 
            WHEN t.sla_breached THEN true
            WHEN t.sla_due_at < NOW() + INTERVAL '2 hours' THEN true
            ELSE false
          END as is_sla_at_risk,
          CASE 
            WHEN t.sla_due_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (t.sla_due_at - NOW())) / 3600
            ELSE NULL
          END as hours_until_sla_breach,
          (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
         FROM support_tickets t
         LEFT JOIN ambassadors a ON t.ambassador_id = a.id
         ${whereClause}
         ORDER BY 
           CASE t.priority 
             WHEN 'urgent' THEN 1 
             WHEN 'high' THEN 2 
             WHEN 'normal' THEN 3 
             ELSE 4 
           END,
           t.sla_due_at ASC NULLS LAST,
           t.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM support_tickets t ${whereClause}`,
        values
      ),
    ]);

    return {
      items,
      total: parseInt(countResult?.count || '0'),
      page,
      limit,
    };
  }

  /**
   * Add message to ticket
   */
  async addMessage(
    input: CreateTicketMessageInput,
    senderId?: string,
    senderType: 'ambassador' | 'admin' | 'system' = 'ambassador'
  ): Promise<TicketMessage> {
    const ticket = await this.getTicketById(input.ticketId);
    if (!ticket) throw new Error('Ticket not found');

    // Get sender name
    let senderName: string | undefined;
    if (senderId) {
      if (senderType === 'ambassador') {
        const ambassador = await db.queryOne<{ first_name: string; last_name: string }>(
          'SELECT first_name, last_name FROM ambassadors WHERE id = $1',
          [senderId]
        );
        senderName = ambassador ? `${ambassador.first_name} ${ambassador.last_name}` : undefined;
      } else {
        const user = await db.queryOne<{ first_name: string; last_name: string }>(
          'SELECT first_name, last_name FROM users WHERE id = $1',
          [senderId]
        );
        senderName = user ? `${user.first_name} ${user.last_name}` : undefined;
      }
    }

    const result = await db.queryOne<TicketMessage>(
      `INSERT INTO ticket_messages (
        ticket_id, content, sender_type, sender_id, sender_name,
        is_internal_note, is_system_message, attachments, reply_to_message_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.ticketId,
        input.content,
        senderType,
        senderId,
        senderName,
        input.isInternalNote || false,
        senderType === 'system',
        JSON.stringify(input.attachments || []),
        input.replyToMessageId,
      ]
    );

    // Record first response time if this is from admin
    if (senderType === 'admin' && !ticket.firstResponseAt) {
      await db.query(
        'UPDATE support_tickets SET first_response_at = NOW() WHERE id = $1',
        [input.ticketId]
      );
    }

    // Update ticket status based on who replied
    const newStatus = senderType === 'admin' ? 'waiting_on_user' : 'waiting_on_admin';
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      await db.query(
        'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2',
        [newStatus, input.ticketId]
      );
    }

    return result!;
  }

  /**
   * Get messages for a ticket
   */
  async getTicketMessages(
    ticketId: string,
    includeInternal = false
  ): Promise<TicketMessage[]> {
    const internalCondition = includeInternal ? '' : 'AND is_internal_note = false';
    
    return db.queryMany<TicketMessage>(
      `SELECT * FROM ticket_messages 
       WHERE ticket_id = $1 ${internalCondition}
       ORDER BY created_at ASC`,
      [ticketId]
    );
  }

  /**
   * Submit satisfaction feedback
   */
  async submitFeedback(input: SubmitTicketFeedbackInput): Promise<SupportTicket | null> {
    return db.queryOne<SupportTicket>(
      `UPDATE support_tickets 
       SET satisfaction_rating = $1, satisfaction_feedback = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [input.satisfactionRating, input.satisfactionFeedback, input.ticketId]
    );
  }

  /**
   * Get support statistics
   */
  async getStats(): Promise<SupportStats> {
    const stats = await db.queryOne<{
      open_tickets: string;
      tickets_at_risk: string;
      avg_response_time: string;
      avg_resolution_time: string;
      avg_satisfaction: string;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) as open_tickets,
        COUNT(*) FILTER (WHERE sla_breached = true OR (sla_due_at < NOW() + INTERVAL '2 hours' AND status NOT IN ('resolved', 'closed'))) as tickets_at_risk,
        COALESCE(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600) FILTER (WHERE first_response_at IS NOT NULL), 0) as avg_response_time,
        COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL), 0) as avg_resolution_time,
        COALESCE(AVG(satisfaction_rating) FILTER (WHERE satisfaction_rating IS NOT NULL), 0) as avg_satisfaction
       FROM support_tickets`
    );

    const byCategory = await db.queryMany<{ category: TicketCategory; count: string }>(
      `SELECT category, COUNT(*) as count 
       FROM support_tickets 
       WHERE status NOT IN ('resolved', 'closed')
       GROUP BY category`
    );

    const byPriority = await db.queryMany<{ priority: TicketPriority; count: string }>(
      `SELECT priority, COUNT(*) as count 
       FROM support_tickets 
       WHERE status NOT IN ('resolved', 'closed')
       GROUP BY priority`
    );

    return {
      openTickets: parseInt(stats?.open_tickets || '0'),
      ticketsAtRisk: parseInt(stats?.tickets_at_risk || '0'),
      avgResponseTimeHours: parseFloat(stats?.avg_response_time || '0'),
      avgResolutionTimeHours: parseFloat(stats?.avg_resolution_time || '0'),
      ticketsByCategory: byCategory.map(tc => ({
        category: tc.category,
        count: parseInt(tc.count),
      })),
      ticketsByPriority: byPriority.map(tp => ({
        priority: tp.priority,
        count: parseInt(tp.count),
      })),
      avgSatisfactionRating: parseFloat(stats?.avg_satisfaction || '0'),
    };
  }

  /**
   * Get tickets for ambassador
   */
  async getTicketsForAmbassador(
    ambassadorId: string,
    status?: TicketStatus | TicketStatus[]
  ): Promise<SupportTicket[]> {
    const statusCondition = status
      ? Array.isArray(status)
        ? `AND status = ANY($2)`
        : `AND status = $2`
      : '';
    const values = status ? [ambassadorId, status] : [ambassadorId];

    return db.queryMany<SupportTicket>(
      `SELECT * FROM support_tickets 
       WHERE ambassador_id = $1 ${statusCondition}
       ORDER BY created_at DESC`,
      values
    );
  }
}

// ============================================
// DIRECT MESSAGING SERVICE
// ============================================

class DirectMessagingService {
  /**
   * Send a direct message
   */
  async sendMessage(
    fromId: string,
    toId: string,
    content: string,
    fromType: 'ambassador' | 'admin'
  ): Promise<{ id: string; conversationId: string; content: string; createdAt: Date }> {
    // Get or create conversation
    const conversation = await this.getOrCreateConversation(fromId, toId, fromType);

    const result = await db.queryOne<{ id: string; content: string; created_at: Date }>(
      `INSERT INTO direct_messages (conversation_id, sender_id, sender_type, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content, created_at`,
      [conversation.id, fromId, fromType, content]
    );

    // Update conversation last message
    await db.query(
      `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
      [content.substring(0, 100), conversation.id]
    );

    return {
      id: result!.id,
      conversationId: conversation.id,
      content: result!.content,
      createdAt: result!.created_at,
    };
  }

  /**
   * Get or create conversation between two users
   */
  private async getOrCreateConversation(
    userId1: string,
    userId2: string,
    user1Type: 'ambassador' | 'admin'
  ): Promise<{ id: string }> {
    // Check for existing conversation
    const existing = await db.queryOne<{ id: string }>(
      `SELECT id FROM conversations 
       WHERE (participant1_id = $1 AND participant2_id = $2)
          OR (participant1_id = $2 AND participant2_id = $1)`,
      [userId1, userId2]
    );

    if (existing) return existing;

    // Create new conversation
    const ambassadorId = user1Type === 'ambassador' ? userId1 : userId2;
    const adminId = user1Type === 'admin' ? userId1 : userId2;

    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO conversations (participant1_id, participant2_id, ambassador_id, admin_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId1, userId2, ambassadorId, adminId]
    );

    return result!;
  }

  /**
   * Get conversations for user
   */
  async getConversations(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{
    items: Array<{
      id: string;
      otherParticipantId: string;
      otherParticipantName: string;
      lastMessageAt: Date;
      lastMessagePreview: string;
      unreadCount: number;
    }>;
    total: number;
  }> {
    const offset = (page - 1) * limit;

    const items = await db.queryMany<{
      id: string;
      other_participant_id: string;
      other_participant_name: string;
      last_message_at: Date;
      last_message_preview: string;
      unread_count: string;
    }>(
      `SELECT 
        c.id,
        CASE 
          WHEN c.participant1_id = $1 THEN c.participant2_id 
          ELSE c.participant1_id 
        END as other_participant_id,
        COALESCE(
          (SELECT first_name || ' ' || last_name FROM ambassadors WHERE id = 
            CASE WHEN c.participant1_id = $1 THEN c.participant2_id ELSE c.participant1_id END),
          (SELECT first_name || ' ' || last_name FROM users WHERE id = 
            CASE WHEN c.participant1_id = $1 THEN c.participant2_id ELSE c.participant1_id END)
        ) as other_participant_name,
        c.last_message_at,
        c.last_message_preview,
        (SELECT COUNT(*) FROM direct_messages dm 
         WHERE dm.conversation_id = c.id 
         AND dm.sender_id != $1 
         AND dm.read_at IS NULL) as unread_count
       FROM conversations c
       WHERE c.participant1_id = $1 OR c.participant2_id = $1
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM conversations 
       WHERE participant1_id = $1 OR participant2_id = $1`,
      [userId]
    );

    return {
      items: items.map(item => ({
        id: item.id,
        otherParticipantId: item.other_participant_id,
        otherParticipantName: item.other_participant_name,
        lastMessageAt: item.last_message_at,
        lastMessagePreview: item.last_message_preview,
        unreadCount: parseInt(item.unread_count),
      })),
      total: parseInt(countResult?.count || '0'),
    };
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(
    conversationId: string,
    page = 1,
    limit = 50
  ): Promise<{
    items: Array<{
      id: string;
      senderId: string;
      senderType: string;
      senderName: string;
      content: string;
      createdAt: Date;
      readAt: Date | null;
    }>;
    total: number;
  }> {
    const offset = (page - 1) * limit;

    const items = await db.queryMany<{
      id: string;
      sender_id: string;
      sender_type: string;
      sender_name: string;
      content: string;
      created_at: Date;
      read_at: Date | null;
    }>(
      `SELECT 
        dm.id,
        dm.sender_id,
        dm.sender_type,
        COALESCE(
          (SELECT first_name || ' ' || last_name FROM ambassadors WHERE id = dm.sender_id),
          (SELECT first_name || ' ' || last_name FROM users WHERE id = dm.sender_id)
        ) as sender_name,
        dm.content,
        dm.created_at,
        dm.read_at
       FROM direct_messages dm
       WHERE dm.conversation_id = $1
       ORDER BY dm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    const countResult = await db.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM direct_messages WHERE conversation_id = $1',
      [conversationId]
    );

    return {
      items: items.map(item => ({
        id: item.id,
        senderId: item.sender_id,
        senderType: item.sender_type,
        senderName: item.sender_name,
        content: item.content,
        createdAt: item.created_at,
        readAt: item.read_at,
      })),
      total: parseInt(countResult?.count || '0'),
    };
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(conversationId: string, readerId: string): Promise<void> {
    await db.query(
      `UPDATE direct_messages 
       SET read_at = NOW() 
       WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [conversationId, readerId]
    );
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM direct_messages dm
       JOIN conversations c ON dm.conversation_id = c.id
       WHERE (c.participant1_id = $1 OR c.participant2_id = $1)
       AND dm.sender_id != $1
       AND dm.read_at IS NULL`,
      [userId]
    );
    return parseInt(result?.count || '0');
  }
}

// ============================================
// FULL-TEXT SEARCH SERVICE
// ============================================

class SearchService {
  /**
   * Search across all support hub content
   */
  async searchAll(
    query: string,
    options?: {
      types?: ('article' | 'video' | 'ticket')[];
      limit?: number;
    }
  ): Promise<{
    articles: KnowledgeBaseArticle[];
    videos: TrainingVideo[];
    tickets: SupportTicket[];
  }> {
    const types = options?.types || ['article', 'video', 'ticket'];
    const limit = options?.limit || 10;
    const searchPattern = `%${query}%`;

    const results: {
      articles: KnowledgeBaseArticle[];
      videos: TrainingVideo[];
      tickets: SupportTicket[];
    } = {
      articles: [],
      videos: [],
      tickets: [],
    };

    if (types.includes('article')) {
      results.articles = await db.queryMany<KnowledgeBaseArticle>(
        `SELECT * FROM knowledge_base_articles
         WHERE status = 'published'
         AND (title ILIKE $1 OR content ILIKE $1 OR excerpt ILIKE $1)
         ORDER BY (helpful_count - not_helpful_count) DESC, view_count DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
    }

    if (types.includes('video')) {
      results.videos = await db.queryMany<TrainingVideo>(
        `SELECT * FROM training_videos
         WHERE status = 'published'
         AND (title ILIKE $1 OR description ILIKE $1 OR transcript ILIKE $1)
         ORDER BY total_views DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
    }

    if (types.includes('ticket')) {
      results.tickets = await db.queryMany<SupportTicket>(
        `SELECT * FROM support_tickets
         WHERE subject ILIKE $1 OR description ILIKE $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
    }

    return results;
  }
}

// ============================================
// EXPORT SERVICES
// ============================================

export const knowledgeBaseService = new KnowledgeBaseService();
export const trainingVideoService = new TrainingVideoService();
export const supportTicketService = new SupportTicketService();
export const directMessagingService = new DirectMessagingService();
export const searchService = new SearchService();
