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
