/**
 * Knowledge Base Article Routes
 * WO-57: Support Hub API and Backend Services
 * Phase 12: Support Hub Foundation
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { knowledgeBaseService } from '../../services/supportHubService.js';
import { authenticate, requireRole, optionalAuth } from '../../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../../middleware/validate.js';
import type { 
  ArticleCategory, 
  ArticleStatus,
  CreateArticleInput,
  UpdateArticleInput,
} from '../../types/support-hub.js';

// Validation schemas
const articleCategorySchema = z.enum([
  'getting_started', 'signups', 'events', 'payroll',
  'troubleshooting', 'policies', 'best_practices', 'faq'
]);

const articleStatusSchema = z.enum(['draft', 'published', 'archived']);

const createArticleSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).optional(),
  content: z.string().min(1),
  excerpt: z.string().max(500).optional(),
  category: articleCategorySchema,
  tags: z.array(z.string()).optional(),
  relatedArticleIds: z.array(z.string().uuid()).optional(),
  status: articleStatusSchema.optional(),
  metaTitle: z.string().max(100).optional(),
  metaDescription: z.string().max(200).optional(),
  searchKeywords: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

const updateArticleSchema = createArticleSchema.partial();

const searchArticlesSchema = z.object({
  category: articleCategorySchema.optional(),
  status: articleStatusSchema.optional(),
  tags: z.string().optional().transform(v => v ? v.split(',') : undefined),
  search: z.string().optional(),
  isFeatured: z.string().optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  isPinned: z.string().optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

const feedbackSchema = z.object({
  isHelpful: z.boolean(),
  feedbackText: z.string().max(1000).optional(),
});

export async function articleRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /articles - List/search articles (public for published, admin sees all)
   */
  fastify.get('/', {
    preHandler: [optionalAuth, validateQuery(searchArticlesSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof searchArticlesSchema>;
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    // Non-admins can only see published articles
    const filters = {
      ...query,
      status: isAdmin ? query.status : 'published' as ArticleStatus,
    };

    const result = await knowledgeBaseService.searchArticles(
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
   * GET /articles/stats - Get knowledge base statistics (admin only)
   */
  fastify.get('/stats', {
    preHandler: [authenticate, requireRole('admin', 'manager')],
  }, async () => {
    const stats = await knowledgeBaseService.getStats();
    return { success: true, data: stats };
  });

  /**
   * GET /articles/featured - Get featured articles
   */
  fastify.get('/featured', {
    preHandler: [optionalAuth],
  }, async () => {
    const result = await knowledgeBaseService.searchArticles(
      { status: 'published', isFeatured: true },
      1,
      10
    );
    return { success: true, data: result.items };
  });

  /**
   * GET /articles/category/:category - Get articles by category
   */
  fastify.get('/category/:category', {
    preHandler: [optionalAuth, validateParams(z.object({ category: articleCategorySchema }))],
  }, async (request) => {
    const { category } = request.params as { category: ArticleCategory };
    
    const result = await knowledgeBaseService.searchArticles(
      { category, status: 'published' },
      1,
      50
    );

    return { success: true, data: result.items };
  });

  /**
   * GET /articles/:id - Get article by ID
   */
  fastify.get('/:id', {
    preHandler: [optionalAuth, validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const article = await knowledgeBaseService.getArticleById(id);

    if (!article) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    // Non-admins can only see published articles
    if (!isAdmin && article.status !== 'published') {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    // Increment view count for published articles
    if (article.status === 'published') {
      await knowledgeBaseService.incrementViewCount(id);
    }

    return { success: true, data: article };
  });

  /**
   * GET /articles/slug/:slug - Get article by slug
   */
  fastify.get('/slug/:slug', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const article = await knowledgeBaseService.getArticleBySlug(slug);

    if (!article || (!isAdmin && article.status !== 'published')) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    // Increment view count
    if (article.status === 'published') {
      await knowledgeBaseService.incrementViewCount(article.id);
    }

    return { success: true, data: article };
  });

  /**
   * GET /articles/:id/related - Get related articles
   */
  fastify.get('/:id/related', {
    preHandler: [optionalAuth, validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const related = await knowledgeBaseService.getRelatedArticles(id, 5);
    return { success: true, data: related };
  });

  /**
   * POST /articles - Create new article (admin only)
   */
  fastify.post('/', {
    preHandler: [authenticate, requireRole('admin', 'manager'), validateBody(createArticleSchema)],
  }, async (request, reply) => {
    const input = request.body as CreateArticleInput;

    // Check for duplicate slug if provided
    if (input.slug) {
      const existing = await knowledgeBaseService.getArticleBySlug(input.slug);
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: { code: 'CONFLICT', message: 'Article with this slug already exists' },
        });
      }
    }

    const article = await knowledgeBaseService.createArticle(input, request.user?.id);

    return reply.status(201).send({
      success: true,
      data: article,
    });
  });

  /**
   * PUT /articles/:id - Update article (admin only)
   */
  fastify.put('/:id', {
    preHandler: [
      authenticate,
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(updateArticleSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as UpdateArticleInput;

    const article = await knowledgeBaseService.updateArticle(id, input, request.user?.id);

    if (!article) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    return { success: true, data: article };
  });

  /**
   * PATCH /articles/:id/publish - Publish article (admin only)
   */
  fastify.patch('/:id/publish', {
    preHandler: [authenticate, requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const article = await knowledgeBaseService.updateArticle(id, { status: 'published' }, request.user?.id);

    if (!article) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    return { success: true, data: article };
  });

  /**
   * PATCH /articles/:id/archive - Archive article (admin only)
   */
  fastify.patch('/:id/archive', {
    preHandler: [authenticate, requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const article = await knowledgeBaseService.updateArticle(id, { status: 'archived' }, request.user?.id);

    if (!article) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    return { success: true, data: article };
  });

  /**
   * DELETE /articles/:id - Delete article (admin only)
   */
  fastify.delete('/:id', {
    preHandler: [authenticate, requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const deleted = await knowledgeBaseService.deleteArticle(id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    return { success: true, data: { deleted: true } };
  });

  /**
   * POST /articles/:id/feedback - Submit article feedback
   */
  fastify.post('/:id/feedback', {
    preHandler: [optionalAuth, validateParams(commonSchemas.id), validateBody(feedbackSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as { isHelpful: boolean; feedbackText?: string };

    const article = await knowledgeBaseService.getArticleById(id);
    if (!article || article.status !== 'published') {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    }

    const feedback = await knowledgeBaseService.submitFeedback(
      { articleId: id, ...input },
      request.user?.id
    );

    return reply.status(201).send({
      success: true,
      data: feedback,
    });
  });
}
