/**
 * Financial Import Routes - WO-82
 * API endpoints for importing historical budget and actuals data
 */

import { FastifyInstance } from 'fastify';
import { 
  importBudgetActuals, 
  getImportStatus, 
  getImportRowDetails,
  listImports,
  recalculateAllPerformanceScores,
  getEventPerformanceScore
} from '../services/financial-import.service.js';
import { getScoringConfiguration } from '../utils/financialScoring.js';
import { pool } from '../config/database.js';

interface RowAccumulator {
  totalBudget: number;
  totalActualCost: number;
  totalProjectedRevenue: number;
  totalActualRevenue: number;
  totalProjectedSignups: number;
  totalActualSignups: number;
}

interface EventRow {
  budget_total: string | null;
  actual_total: string | null;
  projected_revenue: string | null;
  actual_revenue: string | null;
  projected_signups: string | null;
  actual_signups: string | null;
}

export async function financialImportRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/imports/financial/budget-actuals
   * Import budget and actuals data from CSV
   */
  fastify.post('/imports/financial/budget-actuals', {
    schema: {
      description: 'Import budget and actuals data from CSV',
      tags: ['Financial Import'],
      body: {
        type: 'object',
        properties: {
          csvContent: { type: 'string', description: 'CSV content as string' },
          filename: { type: 'string', description: 'Original filename (optional)' },
          year: { type: 'number', description: 'Default year for dates (e.g., 2025)' },
          dryRun: { type: 'boolean', description: 'If true, validate only without saving' }
        },
        required: ['csvContent']
      }
    }
  }, async (request, reply) => {
    const body = request.body as {
      csvContent: string;
      filename?: string;
      year?: number;
      dryRun?: boolean;
    };
    
    try {
      const result = await importBudgetActuals(
        body.csvContent,
        body.filename || 'upload.csv',
        {
          defaultYear: body.year,
          dryRun: body.dryRun,
          importedBy: (request.user as { id?: string })?.id || 'api'
        }
      );
      
      return result;
    } catch (error: unknown) {
      const err = error as Error;
      return reply.code(400).send({
        error: 'Import failed',
        message: err.message
      });
    }
  });

  /**
   * GET /api/v1/imports/financial/:importId
   * Get status of an import job
   */
  fastify.get('/imports/financial/:importId', {
    schema: {
      description: 'Get import job status',
      tags: ['Financial Import'],
      params: {
        type: 'object',
        properties: {
          importId: { type: 'string', format: 'uuid' }
        },
        required: ['importId']
      }
    }
  }, async (request, reply) => {
    const { importId } = request.params as { importId: string };
    
    const status = await getImportStatus(importId);
    
    if (!status) {
      return reply.code(404).send({ error: 'Import not found' });
    }
    
    return status;
  });

  /**
   * GET /api/v1/imports/financial/:importId/rows
   * Get row-by-row details of an import
   */
  fastify.get('/imports/financial/:importId/rows', {
    schema: {
      description: 'Get import row details',
      tags: ['Financial Import'],
      params: {
        type: 'object',
        properties: {
          importId: { type: 'string', format: 'uuid' }
        },
        required: ['importId']
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['success', 'skipped', 'error', 'warning'] },
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 }
        }
      }
    }
  }, async (request) => {
    const { importId } = request.params as { importId: string };
    const { status, limit, offset } = request.query as { status?: string; limit?: number; offset?: number };
    
    const rows = await getImportRowDetails(importId, { status, limit, offset });
    
    return { rows, count: rows.length };
  });

  /**
   * GET /api/v1/imports/financial
   * List recent imports
   */
  fastify.get('/imports/financial', {
    schema: {
      description: 'List recent financial imports',
      tags: ['Financial Import'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          type: { type: 'string', description: 'Filter by import type' }
        }
      }
    }
  }, async (request) => {
    const { limit, type } = request.query as { limit?: number; type?: string };
    
    const imports = await listImports({ limit, importType: type });
    
    return { imports, count: imports.length };
  });

  /**
   * GET /api/v1/events/:eventId/budget
   * Get budget data for a specific event
   */
  fastify.get('/events/:eventId/budget', {
    schema: {
      description: 'Get event budget',
      tags: ['Financial Import'],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string', format: 'uuid' }
        },
        required: ['eventId']
      }
    }
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    
    const result = await pool.query(`
      SELECT eb.*, e.title as event_name, e.event_date as event_date
      FROM event_budgets eb
      JOIN events e ON e.id = eb.event_id
      WHERE eb.event_id = $1
    `, [eventId]);
    
    if (result.rows.length === 0) {
      // Return empty budget data instead of 404 so frontend can create new
      return { success: true, data: null };
    }
    
    return { success: true, data: result.rows[0] };
  });

  /**
   * PUT /api/v1/events/:eventId/budget
   * Create or update budget data for a specific event
   */
  fastify.put('/events/:eventId/budget', {
    schema: {
      description: 'Create or update event budget',
      tags: ['Financial Import'],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string', format: 'uuid' }
        },
        required: ['eventId']
      }
    }
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const body = request.body as {
      budgetStaff?: number;
      budgetReimbursements?: number;
      budgetRewards?: number;
      budgetBase?: number;
      budgetBonusKickback?: number;
      budgetParking?: number;
      budgetSetup?: number;
      budgetAdditional1?: number;
      budgetAdditional2?: number;
      budgetAdditional3?: number;
      budgetAdditional4?: number;
      projectedSignups?: number;
      projectedRevenue?: number;
      notes?: string;
    };
    
    try {
      // Verify event exists first
      const eventCheck = await pool.query('SELECT id FROM events WHERE id = $1', [eventId]);
      if (eventCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Event not found' });
      }
      
      // Calculate totals
      const budgetTotal = (body.budgetStaff || 0) + (body.budgetReimbursements || 0) + 
        (body.budgetRewards || 0) + (body.budgetBase || 0) + (body.budgetBonusKickback || 0) +
        (body.budgetParking || 0) + (body.budgetSetup || 0) + (body.budgetAdditional1 || 0) +
        (body.budgetAdditional2 || 0) + (body.budgetAdditional3 || 0) + (body.budgetAdditional4 || 0);
      
      const projectedProfit = (body.projectedRevenue || 0) - budgetTotal;
      
      // Check if budget exists
      const existing = await pool.query('SELECT id FROM event_budgets WHERE event_id = $1', [eventId]);
      
      if (existing.rows.length > 0) {
        // Update
        await pool.query(`
          UPDATE event_budgets SET
            budget_staff = $2,
            budget_reimbursements = $3,
            budget_rewards = $4,
            budget_base = $5,
            budget_bonus_kickback = $6,
            budget_parking = $7,
            budget_setup = $8,
            budget_additional_1 = $9,
            budget_additional_2 = $10,
            budget_additional_3 = $11,
            budget_additional_4 = $12,
            budget_total = $13,
            projected_signups = $14,
            projected_revenue = $15,
            projected_profit = $16,
            notes = $17,
            updated_at = NOW()
          WHERE event_id = $1
        `, [
          eventId,
          body.budgetStaff || 0,
          body.budgetReimbursements || 0,
          body.budgetRewards || 0,
          body.budgetBase || 0,
          body.budgetBonusKickback || 0,
          body.budgetParking || 0,
          body.budgetSetup || 0,
          body.budgetAdditional1 || 0,
          body.budgetAdditional2 || 0,
          body.budgetAdditional3 || 0,
          body.budgetAdditional4 || 0,
          budgetTotal,
          body.projectedSignups || 0,
          body.projectedRevenue || 0,
          projectedProfit,
          body.notes || null
        ]);
      } else {
        // Insert
        await pool.query(`
          INSERT INTO event_budgets (
            event_id, budget_staff, budget_reimbursements, budget_rewards, budget_base,
            budget_bonus_kickback, budget_parking, budget_setup, budget_additional_1,
            budget_additional_2, budget_additional_3, budget_additional_4, budget_total,
            projected_signups, projected_revenue, projected_profit, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          eventId,
          body.budgetStaff || 0,
          body.budgetReimbursements || 0,
          body.budgetRewards || 0,
          body.budgetBase || 0,
          body.budgetBonusKickback || 0,
          body.budgetParking || 0,
          body.budgetSetup || 0,
          body.budgetAdditional1 || 0,
          body.budgetAdditional2 || 0,
          body.budgetAdditional3 || 0,
          body.budgetAdditional4 || 0,
          budgetTotal,
          body.projectedSignups || 0,
          body.projectedRevenue || 0,
          projectedProfit,
          body.notes || null
        ]);
      }
      
      // Sync projected_signups to event's signup_goal field
      if (body.projectedSignups !== undefined) {
        await pool.query(
          'UPDATE events SET signup_goal = $1, updated_at = NOW() WHERE id = $2',
          [body.projectedSignups || 0, eventId]
        );
      }
      
      // Return updated budget
      const result = await pool.query(`
        SELECT eb.*, e.title as event_name, e.event_date as event_date
        FROM event_budgets eb
        JOIN events e ON e.id = eb.event_id
        WHERE eb.event_id = $1
      `, [eventId]);
      
      return { success: true, data: result.rows[0] };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Budget save error:', err.message, err.stack);
      return reply.code(500).send({ 
        error: 'Failed to save budget', 
        message: err.message 
      });
    }
  });

  /**
   * GET /api/v1/events/:eventId/actuals
   * Get actuals data for a specific event
   */
  fastify.get('/events/:eventId/actuals', {
    schema: {
      description: 'Get event actuals',
      tags: ['Financial Import'],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string', format: 'uuid' }
        },
        required: ['eventId']
      }
    }
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    
    const result = await pool.query(`
      SELECT ea.*, e.title as event_name, e.event_date as event_date
      FROM event_actuals ea
      JOIN events e ON e.id = ea.event_id
      WHERE ea.event_id = $1
    `, [eventId]);
    
    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Actuals not found for this event' });
    }
    
    return result.rows[0];
  });

  /**
   * GET /api/v1/events/:eventId/financial-summary
   * Get combined budget vs actuals summary for an event
   */
  fastify.get('/events/:eventId/financial-summary', {
    schema: {
      description: 'Get event financial summary (budget vs actuals)',
      tags: ['Financial Import'],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string', format: 'uuid' }
        },
        required: ['eventId']
      }
    }
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    
    const result = await pool.query(`
      SELECT 
        e.id, e.title, e.event_date, e.status,
        eb.budget_total, eb.projected_signups, eb.projected_revenue, eb.projected_profit, eb.projected_margin_percent,
        ea.actual_total, ea.actual_signups, ea.actual_revenue, ea.actual_profit, ea.actual_margin_percent,
        CASE WHEN eb.budget_total > 0 THEN 
          ROUND(((ea.actual_total - eb.budget_total) / eb.budget_total * 100)::numeric, 2)
        END as cost_variance_percent,
        CASE WHEN eb.projected_revenue > 0 THEN 
          ROUND(((ea.actual_revenue - eb.projected_revenue) / eb.projected_revenue * 100)::numeric, 2)
        END as revenue_variance_percent,
        CASE WHEN eb.projected_signups > 0 THEN 
          ROUND(((ea.actual_signups - eb.projected_signups)::decimal / eb.projected_signups * 100)::numeric, 2)
        END as signups_variance_percent
      FROM events e
      LEFT JOIN event_budgets eb ON eb.event_id = e.id
      LEFT JOIN event_actuals ea ON ea.event_id = e.id
      WHERE e.id = $1
    `, [eventId]);
    
    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Event not found' });
    }
    
    return result.rows[0];
  });

  /**
   * GET /api/v1/financial/budget-actuals-report
   * Get a report comparing budget vs actuals across events
   */
  fastify.get('/financial/budget-actuals-report', {
    schema: {
      description: 'Get budget vs actuals report for multiple events',
      tags: ['Financial Import'],
      querystring: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
          eventType: { type: 'string' },
          limit: { type: 'number', default: 50 }
        }
      }
    }
  }, async (request) => {
    const { fromDate, toDate, eventType, limit } = request.query as {
      fromDate?: string;
      toDate?: string;
      eventType?: string;
      limit?: number;
    };
    
    let query = `
      SELECT 
        e.id, e.title, e.event_date, e.status, e.event_type,
        eb.budget_total, eb.projected_signups, eb.projected_revenue, eb.projected_profit,
        ea.actual_total, ea.actual_signups, ea.actual_revenue, ea.actual_profit,
        ea.actual_margin_percent
      FROM events e
      LEFT JOIN event_budgets eb ON eb.event_id = e.id
      LEFT JOIN event_actuals ea ON ea.event_id = e.id
      WHERE (eb.id IS NOT NULL OR ea.id IS NOT NULL)
    `;
    
    const params: (string | number)[] = [];
    
    if (fromDate) {
      params.push(fromDate);
      query += ` AND e.event_date >= $${params.length}`;
    }
    
    if (toDate) {
      params.push(toDate);
      query += ` AND e.event_date <= $${params.length}`;
    }
    
    if (eventType) {
      params.push(eventType);
      query += ` AND e.event_type = $${params.length}`;
    }
    
    query += ` ORDER BY e.event_date DESC`;
    
    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }
    
    const result = await pool.query(query, params);
    
    // Calculate totals with typed accumulator
    const totals = result.rows.reduce((acc: RowAccumulator, row: EventRow) => ({
      totalBudget: acc.totalBudget + (parseFloat(row.budget_total || '0') || 0),
      totalActualCost: acc.totalActualCost + (parseFloat(row.actual_total || '0') || 0),
      totalProjectedRevenue: acc.totalProjectedRevenue + (parseFloat(row.projected_revenue || '0') || 0),
      totalActualRevenue: acc.totalActualRevenue + (parseFloat(row.actual_revenue || '0') || 0),
      totalProjectedSignups: acc.totalProjectedSignups + (parseInt(row.projected_signups || '0') || 0),
      totalActualSignups: acc.totalActualSignups + (parseInt(row.actual_signups || '0') || 0)
    }), {
      totalBudget: 0,
      totalActualCost: 0,
      totalProjectedRevenue: 0,
      totalActualRevenue: 0,
      totalProjectedSignups: 0,
      totalActualSignups: 0
    });
    
    return {
      events: result.rows,
      totals,
      count: result.rows.length
    };
  });

  /**
   * GET /api/v1/events/:eventId/performance-score
   * Get performance score for a specific event
   */
  fastify.get('/events/:eventId/performance-score', {
    schema: {
      description: 'Get performance score for an event',
      tags: ['Financial Import'],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string', format: 'uuid' }
        },
        required: ['eventId']
      }
    }
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    
    const score = await getEventPerformanceScore(eventId);
    
    if (!score) {
      return reply.code(404).send({ error: 'No actuals data found for this event' });
    }
    
    return score;
  });

  /**
   * POST /api/v1/imports/financial/recalculate-scores
   * Recalculate performance scores for all events with actuals
   */
  fastify.post('/imports/financial/recalculate-scores', {
    schema: {
      description: 'Recalculate performance scores for all events',
      tags: ['Financial Import']
    }
  }, async () => {
    const result = await recalculateAllPerformanceScores();
    
    return {
      success: true,
      message: `Recalculated performance scores for ${result.updated} events`,
      ...result
    };
  });

  /**
   * GET /api/v1/financial/scoring-config
   * Get the scoring configuration and weights
   */
  fastify.get('/financial/scoring-config', {
    schema: {
      description: 'Get performance scoring configuration',
      tags: ['Financial Import']
    }
  }, async () => {
    return getScoringConfiguration();
  });

  /**
   * GET /api/v1/financial/top-performers
   * Get top and bottom performing events
   */
  fastify.get('/financial/top-performers', {
    schema: {
      description: 'Get top and bottom performing events',
      tags: ['Financial Import'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10 },
          tier: { type: 'string', enum: ['excellent', 'good', 'average', 'below_average', 'poor'] },
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request) => {
    const { limit, tier, fromDate, toDate } = request.query as {
      limit?: number;
      tier?: string;
      fromDate?: string;
      toDate?: string;
    };
    
    let query = `
      SELECT 
        e.id, e.title, e.event_date, e.event_type,
        ea.performance_score, ea.performance_tier, ea.performance_breakdown,
        ea.actual_signups, ea.actual_revenue, ea.actual_profit, ea.actual_margin_percent
      FROM events e
      JOIN event_actuals ea ON ea.event_id = e.id
      WHERE ea.performance_score IS NOT NULL
    `;
    
    const params: (string | number)[] = [];
    
    if (tier) {
      params.push(tier);
      query += ` AND ea.performance_tier = $${params.length}`;
    }
    
    if (fromDate) {
      params.push(fromDate);
      query += ` AND e.event_date >= $${params.length}`;
    }
    
    if (toDate) {
      params.push(toDate);
      query += ` AND e.event_date <= $${params.length}`;
    }
    
    query += ` ORDER BY ea.performance_score DESC`;
    
    params.push(limit || 10);
    query += ` LIMIT $${params.length}`;
    
    const topResult = await pool.query(query, params);
    
    // Also get bottom performers
    const bottomQuery = query.replace('DESC', 'ASC');
    const bottomResult = await pool.query(bottomQuery, params);
    
    return {
      topPerformers: topResult.rows,
      bottomPerformers: bottomResult.rows
    };
  });
}
// Deploy trigger Sat Feb 21 18:06:15 EST 2026

