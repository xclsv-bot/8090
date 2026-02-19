/**
 * Historical Data Import Routes
 * WO-76: Backend API Layer for Historical Data Import
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../../middleware/validate.js';
import * as importService from '../../../modules/historical-import/api/services/import.service.js';
import type { ImportStatus, DataType } from '../../../modules/historical-import/api/types.js';

// Schemas
const validateBodySchema = z.object({
  file_id: z.string(),
  data_types: z.array(z.enum(['sign_ups', 'budgets_actuals', 'payroll'])),
  validation_mode: z.enum(['strict', 'permissive']).default('strict'),
});

const reconcileBodySchema = z.object({
  file_id: z.string(),
  data_types: z.array(z.enum(['sign_ups', 'budgets_actuals', 'payroll'])),
});

const reconciliationUpdateSchema = z.object({
  decisions: z.array(z.object({
    ambiguous_match_id: z.string(),
    user_selection: z.enum(['use_match', 'use_candidate', 'create_new']),
    selected_candidate_id: z.string().optional(),
    notes: z.string().optional(),
  })),
});

const executeBodySchema = z.object({
  confirm: z.literal(true),
  dry_run: z.boolean().optional(),
  skip_validation: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  page_size: z.string().optional().default('20').transform(Number),
  status: z.string().optional(), // comma-separated list
  data_types: z.string().optional(), // comma-separated list
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  imported_by: z.string().optional(),
  search: z.string().optional(),
});

const fileIdParamSchema = z.object({
  fileId: z.string(),
});

const importIdParamSchema = z.object({
  importId: z.string(),
});

const reportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
  include_raw_data: z.string().transform(v => v === 'true').optional(),
  include_validation_details: z.string().transform(v => v === 'true').optional(),
  include_reconciliation_details: z.string().transform(v => v === 'true').optional(),
});

const auditQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  page_size: z.string().optional().default('50').transform(Number),
});

// Helper to get user info from request
function getUserInfo(request: FastifyRequest): { userId: string; userName: string } {
  const user = (request as any).user;
  return {
    userId: user?.id || 'system',
    userName: user?.name || user?.email || 'System',
  };
}

// Helper to parse comma-separated status values
function parseStatusArray(status?: string): ImportStatus[] | undefined {
  if (!status) return undefined;
  return status.split(',').filter(Boolean) as ImportStatus[];
}

// Helper to parse comma-separated data type values
function parseDataTypesArray(dataTypes?: string): DataType[] | undefined {
  if (!dataTypes) return undefined;
  return dataTypes.split(',').filter(Boolean) as DataType[];
}

export async function importRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication and admin/manager role
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /admin/imports/parse - Upload and parse file
   */
  fastify.post('/parse', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request, reply) => {
    const data = await (request as any).file();
    if (!data) {
      return reply.status(400).send({ 
        success: false, 
        error: { code: 'NO_FILE', message: 'No file uploaded' } 
      });
    }

    const { userId, userName } = getUserInfo(request);
    const buffer = await data.toBuffer();
    
    // Create a File-like object from the multipart data
    const file = new File([buffer], data.filename, { type: data.mimetype });
    
    const result = await importService.parseFile(file, userId, userName);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /admin/imports/validate - Validate parsed data
   */
  fastify.post('/validate', {
    preHandler: [requireRole('admin', 'manager'), validateBody(validateBodySchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof validateBodySchema>;
    const { userId, userName } = getUserInfo(request);
    
    const result = await importService.validateFile(
      {
        file_id: body.file_id,
        data_types: body.data_types as DataType[],
        validation_mode: body.validation_mode,
      },
      userId,
      userName
    );
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /admin/imports/reconcile - Match records to existing data
   */
  fastify.post('/reconcile', {
    preHandler: [requireRole('admin', 'manager'), validateBody(reconcileBodySchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof reconcileBodySchema>;
    const { userId, userName } = getUserInfo(request);
    
    const result = await importService.reconcileFile(
      {
        file_id: body.file_id,
        data_types: body.data_types as DataType[],
      },
      userId,
      userName
    );
    return reply.send({ success: true, data: result });
  });

  /**
   * PUT /admin/imports/:fileId/reconciliation - Update match decisions
   */
  fastify.put('/:fileId/reconciliation', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(fileIdParamSchema),
      validateBody(reconciliationUpdateSchema),
    ],
  }, async (request, reply) => {
    const { fileId } = request.params as z.infer<typeof fileIdParamSchema>;
    const body = request.body as z.infer<typeof reconciliationUpdateSchema>;
    const { userId, userName } = getUserInfo(request);
    
    const result = await importService.updateReconciliation(
      fileId,
      { decisions: body.decisions },
      userId,
      userName
    );
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /admin/imports/:fileId/execute - Execute import
   */
  fastify.post('/:fileId/execute', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(fileIdParamSchema),
      validateBody(executeBodySchema),
    ],
  }, async (request, reply) => {
    const { fileId } = request.params as z.infer<typeof fileIdParamSchema>;
    const body = request.body as z.infer<typeof executeBodySchema>;
    const { userId, userName } = getUserInfo(request);
    
    const result = await importService.executeImport(
      fileId,
      {
        confirm: body.confirm,
        dry_run: body.dry_run,
        skip_validation: body.skip_validation,
      },
      userId,
      userName
    );
    return reply.send({ success: true, data: result });
  });

  /**
   * GET /admin/imports - List import history
   */
  fastify.get('/', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(listQuerySchema)],
  }, async (request, reply) => {
    const query = request.query as z.infer<typeof listQuerySchema>;
    
    const result = await importService.getImportHistory(
      {
        status: parseStatusArray(query.status),
        data_types: parseDataTypesArray(query.data_types),
        from_date: query.from_date,
        to_date: query.to_date,
        imported_by: query.imported_by,
        search: query.search,
      },
      {
        page: query.page,
        page_size: query.page_size,
      }
    );
    return reply.send({ success: true, data: result });
  });

  /**
   * GET /admin/imports/:importId/report - Get reconciliation report
   */
  fastify.get('/:importId/report', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(importIdParamSchema),
      validateQuery(reportQuerySchema),
    ],
  }, async (request, reply) => {
    const { importId } = request.params as z.infer<typeof importIdParamSchema>;
    const query = request.query as z.infer<typeof reportQuerySchema>;
    
    const result = await importService.getImportReport(importId, {
      format: query.format,
      include_raw_data: query.include_raw_data,
      include_validation_details: query.include_validation_details,
      include_reconciliation_details: query.include_reconciliation_details,
    });
    
    if (query.format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="import-${importId}-report.csv"`);
      return reply.send(result);
    }
    
    return reply.send({ success: true, data: result });
  });

  /**
   * GET /admin/imports/:importId/audit-trail - Get audit trail
   */
  fastify.get('/:importId/audit-trail', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(importIdParamSchema),
      validateQuery(auditQuerySchema),
    ],
  }, async (request, reply) => {
    const { importId } = request.params as z.infer<typeof importIdParamSchema>;
    const query = request.query as z.infer<typeof auditQuerySchema>;
    
    const result = await importService.getAuditTrail(importId, {
      page: query.page,
      page_size: query.page_size,
    });
    return reply.send({ success: true, data: result });
  });
}

export default importRoutes;
