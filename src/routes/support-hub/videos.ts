/**
 * Training Video Routes
 * WO-57: Support Hub API and Backend Services
 * Phase 12: Support Hub Foundation
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { trainingVideoService } from '../../services/supportHubService.js';
import { authenticate, requireRole, optionalAuth } from '../../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../../middleware/validate.js';
import type {
  VideoCategory,
  VideoStatus,
  CreateVideoInput,
  UpdateVideoInput,
  UpdateTrainingProgressInput,
  TrainingProgressStatus,
} from '../../types/support-hub.js';

// Validation schemas
const videoCategorySchema = z.enum([
  'onboarding', 'product_training', 'sales_techniques',
  'compliance', 'advanced_skills', 'announcements'
]);

const videoStatusSchema = z.enum(['draft', 'processing', 'published', 'archived']);

const progressStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);

const createVideoSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  videoUrl: z.string().url(),
  videoKey: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  durationSeconds: z.number().int().positive(),
  fileSizeBytes: z.number().int().positive().optional(),
  videoFormat: z.string().optional(),
  resolution: z.string().optional(),
  transcript: z.string().optional(),
  transcriptVtt: z.string().optional(),
  category: videoCategorySchema,
  tags: z.array(z.string()).optional(),
  status: videoStatusSchema.optional(),
  isRequired: z.boolean().optional(),
  requiredForSkillLevels: z.array(z.string()).optional(),
  prerequisiteVideoIds: z.array(z.string().uuid()).optional(),
  sortOrder: z.number().int().optional(),
  chapterNumber: z.number().int().optional(),
});

const updateVideoSchema = createVideoSchema.partial();

const searchVideosSchema = z.object({
  category: videoCategorySchema.optional(),
  status: videoStatusSchema.optional(),
  tags: z.string().optional().transform(v => v ? v.split(',') : undefined),
  isRequired: z.string().optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  search: z.string().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

const updateProgressSchema = z.object({
  watchDurationSeconds: z.number().int().min(0).optional(),
  lastPositionSeconds: z.number().int().min(0).optional(),
  watchPercentage: z.number().min(0).max(100).optional(),
  status: progressStatusSchema.optional(),
  quizScore: z.number().min(0).max(100).optional(),
  quizPassed: z.boolean().optional(),
});

const progressFiltersSchema = z.object({
  status: progressStatusSchema.optional(),
  completedOnly: z.string().optional().transform(v => v === 'true'),
});

export async function videoRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /videos - List/search videos
   */
  fastify.get('/', {
    preHandler: [optionalAuth, validateQuery(searchVideosSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof searchVideosSchema>;
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    // Non-admins can only see published videos
    const filters = {
      ...query,
      status: isAdmin ? query.status : 'published' as VideoStatus,
    };

    const result = await trainingVideoService.searchVideos(
      filters,
      query.page,
      query.limit
    );

    return {
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  });

  /**
   * GET /videos/stats - Get training statistics (admin only)
   */
  fastify.get('/stats', {
    preHandler: [authenticate, requireRole('admin', 'manager')],
  }, async () => {
    const stats = await trainingVideoService.getStats();
    return { success: true, data: stats };
  });

  /**
   * GET /videos/required - Get required training videos
   */
  fastify.get('/required', {
    preHandler: [authenticate],
  }, async () => {
    const result = await trainingVideoService.searchVideos(
      { status: 'published', isRequired: true },
      1,
      100
    );
    return { success: true, data: result.items };
  });

  /**
   * GET /videos/category/:category - Get videos by category
   */
  fastify.get('/category/:category', {
    preHandler: [optionalAuth, validateParams(z.object({ category: videoCategorySchema }))],
  }, async (request) => {
    const { category } = request.params as { category: VideoCategory };
    const videos = await trainingVideoService.getVideosByCategory(category);
    return { success: true, data: videos };
  });

  /**
   * GET /videos/:id - Get video by ID
   */
  fastify.get('/:id', {
    preHandler: [optionalAuth, validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const video = await trainingVideoService.getVideoById(id);

    if (!video) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    // Non-admins can only see published videos
    if (!isAdmin && video.status !== 'published') {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    // Increment view count for published videos
    if (video.status === 'published') {
      await trainingVideoService.incrementViewCount(id);
    }

    return { success: true, data: video };
  });

  /**
   * POST /videos - Create new video (admin only)
   */
  fastify.post('/', {
    preHandler: [authenticate, requireRole('admin', 'manager'), validateBody(createVideoSchema)],
  }, async (request, reply) => {
    const input = request.body as CreateVideoInput;
    const video = await trainingVideoService.createVideo(input, request.user?.id);

    return reply.status(201).send({
      success: true,
      data: video,
    });
  });

  /**
   * PUT /videos/:id - Update video (admin only)
   */
  fastify.put('/:id', {
    preHandler: [
      authenticate,
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(updateVideoSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as UpdateVideoInput;

    const video = await trainingVideoService.updateVideo(id, input);

    if (!video) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    return { success: true, data: video };
  });

  /**
   * PATCH /videos/:id/publish - Publish video (admin only)
   */
  fastify.patch('/:id/publish', {
    preHandler: [authenticate, requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const video = await trainingVideoService.updateVideo(id, { status: 'published' });

    if (!video) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    return { success: true, data: video };
  });

  /**
   * DELETE /videos/:id - Delete video (admin only)
   */
  fastify.delete('/:id', {
    preHandler: [authenticate, requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const deleted = await trainingVideoService.deleteVideo(id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    return { success: true, data: { deleted: true } };
  });

  // ========================================
  // PROGRESS TRACKING ROUTES
  // ========================================

  /**
   * GET /videos/progress/me - Get current user's training progress
   */
  fastify.get('/progress/me', {
    preHandler: [authenticate, validateQuery(progressFiltersSchema)],
  }, async (request) => {
    const ambassadorId = request.user!.id;
    const filters = request.query as z.infer<typeof progressFiltersSchema>;

    const progress = await trainingVideoService.getProgressForAmbassador(ambassadorId, filters);
    return { success: true, data: progress };
  });

  /**
   * GET /videos/progress/me/status - Get current user's training status summary
   */
  fastify.get('/progress/me/status', {
    preHandler: [authenticate],
  }, async (request) => {
    const ambassadorId = request.user!.id;
    const status = await trainingVideoService.getAmbassadorTrainingStatus(ambassadorId);
    return { success: true, data: status };
  });

  /**
   * GET /videos/progress/:ambassadorId - Get ambassador's training progress (admin)
   */
  fastify.get('/progress/:ambassadorId', {
    preHandler: [
      authenticate,
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
      validateQuery(progressFiltersSchema),
    ],
  }, async (request) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const filters = request.query as z.infer<typeof progressFiltersSchema>;

    const progress = await trainingVideoService.getProgressForAmbassador(ambassadorId, filters);
    return { success: true, data: progress };
  });

  /**
   * GET /videos/progress/:ambassadorId/status - Get ambassador's training status (admin)
   */
  fastify.get('/progress/:ambassadorId/status', {
    preHandler: [
      authenticate,
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
    ],
  }, async (request) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const status = await trainingVideoService.getAmbassadorTrainingStatus(ambassadorId);
    return { success: true, data: status };
  });

  /**
   * GET /videos/:id/progress - Get current user's progress for specific video
   */
  fastify.get('/:id/progress', {
    preHandler: [authenticate, validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id: videoId } = request.params as { id: string };
    const ambassadorId = request.user!.id;

    const progress = await trainingVideoService.getOrCreateProgress(ambassadorId, videoId);
    return { success: true, data: progress };
  });

  /**
   * PUT /videos/:id/progress - Update progress for specific video
   */
  fastify.put('/:id/progress', {
    preHandler: [authenticate, validateParams(commonSchemas.id), validateBody(updateProgressSchema)],
  }, async (request, reply) => {
    const { id: videoId } = request.params as { id: string };
    const input = request.body as UpdateTrainingProgressInput;
    const ambassadorId = request.user!.id;

    // Verify video exists
    const video = await trainingVideoService.getVideoById(videoId);
    if (!video) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    const progress = await trainingVideoService.updateProgress(ambassadorId, videoId, input);
    return { success: true, data: progress };
  });

  /**
   * POST /videos/:id/complete - Mark video as completed
   */
  fastify.post('/:id/complete', {
    preHandler: [authenticate, validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id: videoId } = request.params as { id: string };
    const ambassadorId = request.user!.id;

    // Verify video exists
    const video = await trainingVideoService.getVideoById(videoId);
    if (!video) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    const progress = await trainingVideoService.updateProgress(ambassadorId, videoId, {
      status: 'completed',
      watchPercentage: 100,
      watchDurationSeconds: video.durationSeconds,
    });

    return { success: true, data: progress };
  });
}
