/**
 * Support Hub Routes Index
 * WO-57: Support Hub API and Backend Services
 * WO-58: Support Hub Real-time Messaging System
 * Phase 12: Support Hub Foundation
 * 
 * Aggregates all Support Hub routes:
 * - /articles - Knowledge base article endpoints
 * - /videos - Training video endpoints
 * - /tickets - Support ticket endpoints
 * - /messages - Direct messaging endpoints
 * - /search - Cross-content search endpoint
 * - /ws - WebSocket endpoint for real-time features
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { articleRoutes } from './articles.js';
import { videoRoutes } from './videos.js';
import { ticketRoutes } from './tickets.js';
import { messageRoutes } from './messages.js';
import { supportHubWebsocketRoutes } from './websocket.js';
import { 
  searchService, 
  knowledgeBaseService, 
  trainingVideoService, 
  supportTicketService 
} from '../../services/supportHubService.js';
import { supportHubRealtimeService } from '../../services/supportHubRealtimeService.js';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validate.js';

// Search validation schema
const searchSchema = z.object({
  q: z.string().min(1).max(200),
  types: z.string().optional().transform(v => {
    if (!v) return ['article', 'video', 'ticket'] as const;
    return v.split(',').filter(t => ['article', 'video', 'ticket'].includes(t)) as ('article' | 'video' | 'ticket')[];
  }),
  limit: z.string().optional().default('10').transform(Number),
});

export async function supportHubRoutes(fastify: FastifyInstance): Promise<void> {
  // Register sub-routes
  await fastify.register(articleRoutes, { prefix: '/articles' });
  await fastify.register(videoRoutes, { prefix: '/videos' });
  await fastify.register(ticketRoutes, { prefix: '/tickets' });
  await fastify.register(messageRoutes, { prefix: '/messages' });
  
  // Register WebSocket routes for real-time features (WO-58)
  await fastify.register(supportHubWebsocketRoutes);

  /**
   * GET /support-hub/search - Search across all support hub content
   */
  fastify.get('/search', {
    preHandler: [optionalAuth, validateQuery(searchSchema)],
  }, async (request) => {
    const { q, types, limit } = request.query as {
      q: string;
      types: ('article' | 'video' | 'ticket')[];
      limit: number;
    };

    const results = await searchService.searchAll(q, { types, limit });

    return {
      success: true,
      data: {
        query: q,
        results,
        counts: {
          articles: results.articles.length,
          videos: results.videos.length,
          tickets: results.tickets.length,
          total: results.articles.length + results.videos.length + results.tickets.length,
        },
      },
    };
  });

  /**
   * GET /support-hub/stats - Get overall support hub statistics
   * Returns combined stats from all modules
   */
  fastify.get('/stats', {
    preHandler: [authenticate],
  }, async (request) => {
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    // Base stats for all users
    const [articleStats, videoStats] = await Promise.all([
      knowledgeBaseService.getStats(),
      trainingVideoService.getStats(),
    ]);

    // Ticket stats only for admins
    let ticketStats = null;
    if (isAdmin) {
      ticketStats = await supportTicketService.getStats();
    }

    return {
      success: true,
      data: {
        knowledgeBase: articleStats,
        training: videoStats,
        support: ticketStats,
      },
    };
  });

  /**
   * GET /support-hub/categories - Get all available categories
   */
  fastify.get('/categories', async () => {
    return {
      success: true,
      data: {
        articleCategories: [
          { value: 'getting_started', label: 'Getting Started' },
          { value: 'signups', label: 'Signups' },
          { value: 'events', label: 'Events' },
          { value: 'payroll', label: 'Payroll' },
          { value: 'troubleshooting', label: 'Troubleshooting' },
          { value: 'policies', label: 'Policies' },
          { value: 'best_practices', label: 'Best Practices' },
          { value: 'faq', label: 'FAQ' },
        ],
        videoCategories: [
          { value: 'onboarding', label: 'Onboarding' },
          { value: 'product_training', label: 'Product Training' },
          { value: 'sales_techniques', label: 'Sales Techniques' },
          { value: 'compliance', label: 'Compliance' },
          { value: 'advanced_skills', label: 'Advanced Skills' },
          { value: 'announcements', label: 'Announcements' },
        ],
        ticketCategories: [
          { value: 'general_inquiry', label: 'General Inquiry' },
          { value: 'technical_issue', label: 'Technical Issue' },
          { value: 'payroll_question', label: 'Payroll Question' },
          { value: 'event_problem', label: 'Event Problem' },
          { value: 'signup_issue', label: 'Signup Issue' },
          { value: 'account_access', label: 'Account Access' },
          { value: 'feedback', label: 'Feedback' },
          { value: 'other', label: 'Other' },
        ],
        ticketPriorities: [
          { value: 'low', label: 'Low', color: '#6B7280' },
          { value: 'normal', label: 'Normal', color: '#3B82F6' },
          { value: 'high', label: 'High', color: '#F59E0B' },
          { value: 'urgent', label: 'Urgent', color: '#EF4444' },
        ],
        ticketStatuses: [
          { value: 'open', label: 'Open', color: '#10B981' },
          { value: 'in_progress', label: 'In Progress', color: '#3B82F6' },
          { value: 'waiting_on_user', label: 'Waiting on User', color: '#F59E0B' },
          { value: 'waiting_on_admin', label: 'Waiting on Admin', color: '#8B5CF6' },
          { value: 'resolved', label: 'Resolved', color: '#6B7280' },
          { value: 'closed', label: 'Closed', color: '#374151' },
        ],
      },
    };
  });

  /**
   * GET /support-hub/dashboard - Get dashboard data for ambassador
   * Returns personalized summary including training progress, open tickets, etc.
   */
  fastify.get('/dashboard', {
    preHandler: [authenticate],
  }, async (request) => {
    const ambassadorId = request.user!.id;
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    // Get training status
    const trainingStatus = await trainingVideoService.getAmbassadorTrainingStatus(ambassadorId);

    // Get user's open tickets
    const openTickets = await supportTicketService.getTicketsForAmbassador(
      ambassadorId,
      ['open', 'in_progress', 'waiting_on_admin']
    );

    // Get featured articles
    const featuredArticles = await knowledgeBaseService.searchArticles(
      { status: 'published', isFeatured: true },
      1,
      5
    );

    // Get required incomplete videos
    const incompleteTraining = await trainingVideoService.getProgressForAmbassador(
      ambassadorId,
      { status: 'in_progress' }
    );

    // Get online admins for presence indicators (WO-58)
    const onlineAdmins = supportHubRealtimeService.getOnlineAdmins();

    const dashboard: Record<string, unknown> = {
      training: {
        status: trainingStatus,
        incompleteCount: incompleteTraining.length,
      },
      tickets: {
        open: openTickets.length,
        items: openTickets.slice(0, 5),
      },
      featuredArticles: featuredArticles.items,
      realtime: {
        onlineAdmins,
        adminCount: onlineAdmins.length,
      },
    };

    // Admin-specific dashboard data
    if (isAdmin) {
      const [ticketStats, ticketsAtRisk] = await Promise.all([
        supportTicketService.getStats(),
        supportTicketService.searchTickets({ slaAtRisk: true }, 1, 10),
      ]);

      dashboard.adminStats = {
        tickets: ticketStats,
        atRiskTickets: ticketsAtRisk.items,
      };
    }

    return {
      success: true,
      data: dashboard,
    };
  });
}
