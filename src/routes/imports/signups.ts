/**
 * Sign-Up Import Routes - WO-92
 * API endpoints for importing historical sign-up data
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { 
  importSignups,
  getSignupImportStatus,
  getSignupImportRowDetails,
  listSignupImports,
  getImportSummary,
  rollbackSignupImport,
} from '../../services/signupImportService.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';

// Schemas
const importBodySchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  filename: z.string().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  dryRun: z.boolean().optional(),
  skipDuplicates: z.boolean().optional(),
});

const importIdParamSchema = z.object({
  importId: z.string().uuid(),
});

const rowDetailsQuerySchema = z.object({
  status: z.enum(['success', 'skipped', 'error']).optional(),
  limit: z.string().optional().default('100').transform(Number),
  offset: z.string().optional().default('0').transform(Number),
});

const listQuerySchema = z.object({
  status: z.enum(['processing', 'completed', 'partial', 'failed', 'rolled_back']).optional(),
  limit: z.string().optional().default('20').transform(Number),
});

export async function signupImportRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication and admin/manager role
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /api/v1/imports/signups
   * Import sign-ups from CSV
   * 
   * CSV columns: date, ambassador, customer_email, customer_name, operator, state, cpa
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(importBodySchema)],
    schema: {
      description: 'Import historical sign-ups from CSV',
      tags: ['Sign-Up Import'],
      body: {
        type: 'object',
        properties: {
          csvContent: { type: 'string', description: 'CSV content as string' },
          filename: { type: 'string', description: 'Original filename (optional)' },
          year: { type: 'number', description: 'Default year for dates without year (e.g., 2024)' },
          dryRun: { type: 'boolean', description: 'If true, validate only without creating records' },
          skipDuplicates: { type: 'boolean', description: 'If true, silently skip duplicates without warning' },
        },
        required: ['csvContent'],
      },
    },
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof importBodySchema>;
    const user = request.user as { id?: string } | undefined;
    
    try {
      const result = await importSignups(
        body.csvContent,
        body.filename || 'upload.csv',
        {
          defaultYear: body.year,
          dryRun: body.dryRun,
          skipDuplicates: body.skipDuplicates,
          importedBy: user?.id || 'api',
        }
      );
      
      const statusCode = result.status === 'completed' ? 200 
        : result.status === 'partial' ? 207 
        : 422;
      
      return reply.code(statusCode).send({
        success: result.status !== 'failed',
        data: result,
      });
    } catch (error: unknown) {
      const err = error as Error;
      return reply.code(400).send({
        success: false,
        error: {
          code: 'IMPORT_FAILED',
          message: err.message,
        },
      });
    }
  });

  /**
   * GET /api/v1/imports/signups
   * List recent sign-up imports
   */
  fastify.get('/', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(listQuerySchema)],
    schema: {
      description: 'List recent sign-up imports',
      tags: ['Sign-Up Import'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['processing', 'completed', 'partial', 'failed', 'rolled_back'] },
          limit: { type: 'number', default: 20 },
        },
      },
    },
  }, async (request) => {
    const { status, limit } = request.query as z.infer<typeof listQuerySchema>;
    
    const imports = await listSignupImports({ status, limit });
    
    return {
      success: true,
      data: { imports, count: imports.length },
    };
  });

  /**
   * GET /api/v1/imports/signups/summary
   * Get overall import statistics
   */
  fastify.get('/summary', {
    preHandler: [requireRole('admin', 'manager')],
    schema: {
      description: 'Get sign-up import summary statistics',
      tags: ['Sign-Up Import'],
    },
  }, async () => {
    const summary = await getImportSummary();
    
    return {
      success: true,
      data: summary,
    };
  });

  /**
   * GET /api/v1/imports/signups/:importId
   * Get status of a specific import
   */
  fastify.get('/:importId', {
    preHandler: [requireRole('admin', 'manager'), validateParams(importIdParamSchema)],
    schema: {
      description: 'Get sign-up import status',
      tags: ['Sign-Up Import'],
      params: {
        type: 'object',
        properties: {
          importId: { type: 'string', format: 'uuid' },
        },
        required: ['importId'],
      },
    },
  }, async (request, reply) => {
    const { importId } = request.params as z.infer<typeof importIdParamSchema>;
    
    const status = await getSignupImportStatus(importId);
    
    if (!status) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Import not found' },
      });
    }
    
    return {
      success: true,
      data: status,
    };
  });

  /**
   * GET /api/v1/imports/signups/:importId/rows
   * Get row-by-row details of an import
   */
  fastify.get('/:importId/rows', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(importIdParamSchema),
      validateQuery(rowDetailsQuerySchema),
    ],
    schema: {
      description: 'Get import row details',
      tags: ['Sign-Up Import'],
      params: {
        type: 'object',
        properties: {
          importId: { type: 'string', format: 'uuid' },
        },
        required: ['importId'],
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['success', 'skipped', 'error'] },
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request) => {
    const { importId } = request.params as z.infer<typeof importIdParamSchema>;
    const { status, limit, offset } = request.query as z.infer<typeof rowDetailsQuerySchema>;
    
    const rows = await getSignupImportRowDetails(importId, { status, limit, offset });
    
    return {
      success: true,
      data: { rows, count: rows.length },
    };
  });

  /**
   * POST /api/v1/imports/signups/:importId/rollback
   * Rollback an import (delete all created signups)
   */
  fastify.post('/:importId/rollback', {
    preHandler: [requireRole('admin'), validateParams(importIdParamSchema)],
    schema: {
      description: 'Rollback a sign-up import (delete all created signups)',
      tags: ['Sign-Up Import'],
      params: {
        type: 'object',
        properties: {
          importId: { type: 'string', format: 'uuid' },
        },
        required: ['importId'],
      },
    },
  }, async (request, reply) => {
    const { importId } = request.params as z.infer<typeof importIdParamSchema>;
    
    // Check if import exists
    const status = await getSignupImportStatus(importId);
    if (!status) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Import not found' },
      });
    }
    
    // Can't rollback an already rolled back import
    if (status.status === 'rolled_back') {
      return reply.code(400).send({
        success: false,
        error: { code: 'ALREADY_ROLLED_BACK', message: 'Import has already been rolled back' },
      });
    }
    
    const result = await rollbackSignupImport(importId);
    
    return {
      success: true,
      data: {
        message: `Rolled back ${result.deletedSignups} signups`,
        deletedSignups: result.deletedSignups,
      },
    };
  });

  /**
   * POST /api/v1/imports/signups/validate
   * Validate CSV without importing (dry run)
   */
  fastify.post('/validate', {
    preHandler: [requireRole('admin', 'manager'), validateBody(importBodySchema.pick({ csvContent: true, filename: true, year: true }))],
    schema: {
      description: 'Validate sign-up CSV without importing',
      tags: ['Sign-Up Import'],
      body: {
        type: 'object',
        properties: {
          csvContent: { type: 'string', description: 'CSV content as string' },
          filename: { type: 'string', description: 'Original filename (optional)' },
          year: { type: 'number', description: 'Default year for dates without year' },
        },
        required: ['csvContent'],
      },
    },
  }, async (request, reply) => {
    const body = request.body as { csvContent: string; filename?: string; year?: number };
    const user = request.user as { id?: string } | undefined;
    
    try {
      const result = await importSignups(
        body.csvContent,
        body.filename || 'validation.csv',
        {
          defaultYear: body.year,
          dryRun: true,
          importedBy: user?.id || 'api',
        }
      );
      
      return {
        success: true,
        data: {
          isValid: result.status !== 'failed',
          totalRows: result.totalRows,
          validRows: result.processedRows,
          duplicates: result.skippedDuplicates,
          errors: result.errors,
          warnings: result.warnings,
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: err.message,
        },
      });
    }
  });
}

export default signupImportRoutes;
