/**
 * Event Import Routes - WO-88
 * API endpoints for importing historical event data
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  importHistoricalEvents,
  getEventImportStatus,
  getEventImportRowDetails,
  listEventImports,
  getEventImportAuditTrail,
  previewEventImport,
} from '../../services/eventImportService.js';

export async function eventImportRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/imports/events
   * Import historical events from CSV
   */
  fastify.post('/', {
    schema: {
      description: 'Import historical events from CSV',
      tags: ['Event Import'],
      body: {
        type: 'object',
        properties: {
          csvContent: { 
            type: 'string', 
            description: 'CSV content as string' 
          },
          filename: { 
            type: 'string', 
            description: 'Original filename (optional)' 
          },
          year: { 
            type: 'number', 
            description: 'Default year for dates without year (e.g., 2024)' 
          },
          dryRun: { 
            type: 'boolean', 
            description: 'If true, validate only without saving' 
          },
          columnMapping: {
            type: 'object',
            description: 'Custom column index mapping',
            properties: {
              eventDate: { type: 'number' },
              venue: { type: 'number' },
              city: { type: 'number' },
              state: { type: 'number' },
              ambassadors: { type: 'number' },
              signups: { type: 'number' },
              eventType: { type: 'number' },
              startTime: { type: 'number' },
              endTime: { type: 'number' },
              notes: { type: 'number' },
            },
          },
          skipHeaderRows: {
            type: 'number',
            description: 'Number of header rows to skip (default: auto-detect)',
          },
        },
        required: ['csvContent'],
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      csvContent: string;
      filename?: string;
      year?: number;
      dryRun?: boolean;
      columnMapping?: Record<string, number>;
      skipHeaderRows?: number;
    };

    try {
      const result = await importHistoricalEvents(
        body.csvContent,
        body.filename || 'upload.csv',
        {
          defaultYear: body.year,
          dryRun: body.dryRun,
          importedBy: (request.user as { id?: string })?.id || 'api',
          columnMapping: body.columnMapping,
          skipHeaderRows: body.skipHeaderRows,
        }
      );

      return result;
    } catch (error: unknown) {
      const err = error as Error;
      reply.code(400);
      return {
        error: 'Import failed',
        message: err.message,
      };
    }
  });

  /**
   * POST /api/v1/imports/events/preview
   * Preview import without saving (parse and validate)
   */
  fastify.post('/preview', {
    schema: {
      description: 'Preview event import without saving',
      tags: ['Event Import'],
      body: {
        type: 'object',
        properties: {
          csvContent: { 
            type: 'string', 
            description: 'CSV content as string' 
          },
          year: { 
            type: 'number', 
            description: 'Default year for dates without year' 
          },
          columnMapping: {
            type: 'object',
            description: 'Custom column index mapping',
          },
          skipHeaderRows: {
            type: 'number',
            description: 'Number of header rows to skip',
          },
        },
        required: ['csvContent'],
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      csvContent: string;
      year?: number;
      columnMapping?: Record<string, number>;
      skipHeaderRows?: number;
    };

    try {
      const result = await previewEventImport(body.csvContent, {
        defaultYear: body.year,
        columnMapping: body.columnMapping,
        skipHeaderRows: body.skipHeaderRows,
      });

      return result;
    } catch (error: unknown) {
      const err = error as Error;
      reply.code(400);
      return {
        error: 'Preview failed',
        message: err.message,
      };
    }
  });

  /**
   * GET /api/v1/imports/events
   * List event imports
   */
  fastify.get('/', {
    schema: {
      description: 'List event imports',
      tags: ['Event Import'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          status: { 
            type: 'string', 
            enum: ['processing', 'completed', 'failed', 'partial'],
            description: 'Filter by status',
          },
        },
      },
    },
  }, async (request: FastifyRequest) => {
    const { limit, status } = request.query as { limit?: number; status?: string };

    const imports = await listEventImports({ limit, status });

    return { imports, count: imports.length };
  });

  /**
   * GET /api/v1/imports/events/:importId
   * Get import status by ID
   */
  fastify.get('/:importId', {
    schema: {
      description: 'Get event import status',
      tags: ['Event Import'],
      params: {
        type: 'object',
        properties: {
          importId: { type: 'string', format: 'uuid' },
        },
        required: ['importId'],
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { importId } = request.params as { importId: string };

    const status = await getEventImportStatus(importId);

    if (!status) {
      reply.code(404);
      return { error: 'Import not found' };
    }

    return status;
  });

  /**
   * GET /api/v1/imports/events/:importId/rows
   * Get row-by-row details of an import
   */
  fastify.get('/:importId/rows', {
    schema: {
      description: 'Get event import row details',
      tags: ['Event Import'],
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
          status: { 
            type: 'string', 
            enum: ['success', 'skipped', 'error', 'warning'],
            description: 'Filter by row status',
          },
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest) => {
    const { importId } = request.params as { importId: string };
    const { status, limit, offset } = request.query as { 
      status?: string; 
      limit?: number; 
      offset?: number;
    };

    const rows = await getEventImportRowDetails(importId, { status, limit, offset });

    return { rows, count: rows.length };
  });

  /**
   * GET /api/v1/imports/events/:importId/audit
   * Get audit trail for an import
   */
  fastify.get('/:importId/audit', {
    schema: {
      description: 'Get event import audit trail',
      tags: ['Event Import'],
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
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest) => {
    const { importId } = request.params as { importId: string };
    const { limit, offset } = request.query as { limit?: number; offset?: number };

    const audit = await getEventImportAuditTrail(importId, { limit, offset });

    return { audit, count: audit.length };
  });
}

export default eventImportRoutes;
