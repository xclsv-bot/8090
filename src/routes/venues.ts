/**
 * Venues API Routes
 * Simple CRUD for venue management
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../services/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  region: z.string().min(1).max(100),
  address: z.string().optional(),
  pocName: z.string().optional(),
  pocRole: z.string().optional(),
  dealTerms: z.string().optional(),
  rewards: z.string().optional(),
  partnerType: z.string().optional(),
});

export async function venueRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /venues - List all venues
   */
  fastify.get('/', async (request) => {
    const { region, status } = request.query as { region?: string; status?: string };
    
    let query = 'SELECT * FROM venues WHERE 1=1';
    const params: any[] = [];
    
    if (region) {
      params.push(region);
      query += ` AND region = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    
    query += ' ORDER BY region, name';
    
    const venues = await db.queryMany(query, params);
    return { success: true, data: venues };
  });

  /**
   * GET /venues/:id/history - Get historical event data for a venue
   * Returns past events at this venue with signup counts and aggregate stats
   */
  fastify.get('/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // Get venue name
    const venue = await db.queryOne<{ name: string; region: string }>(
      'SELECT name, region FROM venues WHERE id = $1',
      [id]
    );
    
    if (!venue) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Venue not found' },
      });
    }
    
    // Get past events at this venue with signup counts
    const events = await db.queryMany<{
      id: string;
      title: string;
      event_date: string;
      status: string;
      signup_count: string;
      validated_count: string;
    }>(
      `SELECT 
        e.id,
        e.title,
        e.event_date,
        e.status,
        COUNT(s.id) as signup_count,
        COUNT(CASE WHEN s.validation_status = 'validated' THEN 1 END) as validated_count
       FROM events e
       LEFT JOIN signups s ON s.event_id = e.id
       WHERE LOWER(e.venue) = LOWER($1)
       GROUP BY e.id, e.title, e.event_date, e.status
       ORDER BY e.event_date DESC
       LIMIT 10`,
      [venue.name]
    );
    
    // Calculate aggregate stats
    const stats = await db.queryOne<{
      total_events: string;
      total_signups: string;
      avg_signups: string;
      best_event_signups: string;
    }>(
      `SELECT 
        COUNT(DISTINCT e.id) as total_events,
        COUNT(s.id) as total_signups,
        ROUND(AVG(signup_count), 1) as avg_signups,
        MAX(signup_count) as best_event_signups
       FROM events e
       LEFT JOIN (
         SELECT event_id, COUNT(*) as signup_count
         FROM signups
         GROUP BY event_id
       ) s ON s.event_id = e.id
       WHERE LOWER(e.venue) = LOWER($1)`,
      [venue.name]
    );
    
    return {
      success: true,
      data: {
        venue: venue.name,
        region: venue.region,
        stats: {
          totalEvents: parseInt(stats?.total_events || '0'),
          totalSignups: parseInt(stats?.total_signups || '0'),
          avgSignups: parseFloat(stats?.avg_signups || '0'),
          bestEventSignups: parseInt(stats?.best_event_signups || '0'),
        },
        recentEvents: events.map(e => ({
          id: e.id,
          title: e.title,
          eventDate: e.event_date,
          status: e.status,
          signupCount: parseInt(e.signup_count),
          validatedCount: parseInt(e.validated_count),
        })),
      },
    };
  });

  /**
   * POST /venues - Create new venue
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createVenueSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createVenueSchema>;
    
    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO venues (name, region, address, poc_name, poc_role, deal_terms, rewards, partner_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active')
       RETURNING id`,
      [body.name, body.region, body.address, body.pocName, body.pocRole, body.dealTerms, body.rewards, body.partnerType]
    );
    
    return reply.status(201).send({ success: true, data: result });
  });
}
