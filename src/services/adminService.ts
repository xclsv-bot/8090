/**
 * Admin Service
 * WO-12: Administrative workflow features (W9, QuickBooks, onboarding)
 * WO-8: Support Hub
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { StorageService } from './storage.js';
const storageService = new StorageService();

interface OnboardingTask {
  id: string;
  ambassadorId: string;
  taskType: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dueDate?: Date;
  completedAt?: Date;
}

interface Document {
  id: string;
  ambassadorId: string;
  documentType: string;
  fileName: string;
  fileKey: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: Date;
  reviewedAt?: Date;
}

interface SupportTicket {
  id: string;
  userId: string;
  category: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  assignedTo?: string;
  createdAt: Date;
}

class AdminService {
  // ============================================
  // ONBOARDING (WO-12)
  // ============================================

  /**
   * Create onboarding tasks for new ambassador
   */
  async initializeOnboarding(ambassadorId: string): Promise<OnboardingTask[]> {
    const defaultTasks = [
      { taskType: 'profile_complete', dueDate: 3 },
      { taskType: 'w9_upload', dueDate: 7 },
      { taskType: 'direct_deposit', dueDate: 7 },
      { taskType: 'training_video', dueDate: 3 },
      { taskType: 'background_check', dueDate: 14 },
      { taskType: 'equipment_pickup', dueDate: 7 },
    ];

    const tasks: OnboardingTask[] = [];

    for (const task of defaultTasks) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + task.dueDate);

      const result = await db.queryOne<OnboardingTask>(
        `INSERT INTO onboarding_tasks (ambassador_id, task_type, status, due_date)
         VALUES ($1, $2, 'pending', $3)
         RETURNING *`,
        [ambassadorId, task.taskType, dueDate.toISOString()]
      );

      if (result) tasks.push(result);
    }

    logger.info({ ambassadorId, taskCount: tasks.length }, 'Onboarding initialized');
    return tasks;
  }

  /**
   * Get onboarding progress
   */
  async getOnboardingProgress(ambassadorId: string): Promise<{
    tasks: OnboardingTask[];
    completed: number;
    total: number;
    percentComplete: number;
  }> {
    const tasks = await db.queryMany<OnboardingTask>(
      'SELECT * FROM onboarding_tasks WHERE ambassador_id = $1 ORDER BY due_date',
      [ambassadorId]
    );

    const completed = tasks.filter(t => t.status === 'completed').length;

    return {
      tasks,
      completed,
      total: tasks.length,
      percentComplete: tasks.length > 0 ? (completed / tasks.length) * 100 : 0,
    };
  }

  /**
   * Complete onboarding task
   */
  async completeTask(taskId: string): Promise<OnboardingTask | null> {
    return db.queryOne<OnboardingTask>(
      `UPDATE onboarding_tasks 
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [taskId]
    );
  }

  // ============================================
  // DOCUMENT MANAGEMENT (W9, etc.)
  // ============================================

  /**
   * Upload document
   */
  async uploadDocument(
    ambassadorId: string,
    documentType: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<Document> {
    // Upload to S3
    const fileKey = `documents/${ambassadorId}/${documentType}/${Date.now()}_${fileName}`;
    await storageService.upload(fileKey, fileBuffer, contentType);

    // Record in database
    const result = await db.queryOne<Document>(
      `INSERT INTO ambassador_documents (
        ambassador_id, document_type, file_name, file_key, status
      ) VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *`,
      [ambassadorId, documentType, fileName, fileKey]
    );

    // Update onboarding task if applicable
    const taskTypeMap: Record<string, string> = {
      w9: 'w9_upload',
      direct_deposit: 'direct_deposit',
      id: 'background_check',
    };

    if (taskTypeMap[documentType]) {
      await db.query(
        `UPDATE onboarding_tasks 
         SET status = 'in_progress'
         WHERE ambassador_id = $1 AND task_type = $2 AND status = 'pending'`,
        [ambassadorId, taskTypeMap[documentType]]
      );
    }

    logger.info({ ambassadorId, documentType, fileKey }, 'Document uploaded');
    return result!;
  }

  /**
   * Review document
   */
  async reviewDocument(
    documentId: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    notes?: string
  ): Promise<Document | null> {
    const result = await db.queryOne<Document>(
      `UPDATE ambassador_documents
       SET status = $1, reviewed_at = NOW(), reviewed_by = $2, review_notes = $3
       WHERE id = $4
       RETURNING *`,
      [status, reviewedBy, notes, documentId]
    );

    if (result && status === 'approved') {
      // Complete related onboarding task
      const taskTypeMap: Record<string, string> = {
        w9: 'w9_upload',
        direct_deposit: 'direct_deposit',
        id: 'background_check',
      };

      const taskType = taskTypeMap[result.documentType];
      if (taskType) {
        await db.query(
          `UPDATE onboarding_tasks 
           SET status = 'completed', completed_at = NOW()
           WHERE ambassador_id = $1 AND task_type = $2`,
          [result.ambassadorId, taskType]
        );
      }
    }

    logger.info({ documentId, status }, 'Document reviewed');
    return result;
  }

  /**
   * Get pending documents for review
   */
  async getPendingDocuments(): Promise<(Document & { ambassadorName: string })[]> {
    return db.queryMany(
      `SELECT d.*, CONCAT(a.first_name, ' ', a.last_name) as ambassador_name
       FROM ambassador_documents d
       JOIN ambassadors a ON a.id = d.ambassador_id
       WHERE d.status = 'pending'
       ORDER BY d.uploaded_at`,
      []
    );
  }

  // ============================================
  // SUPPORT HUB (WO-8)
  // ============================================

  /**
   * Create support ticket
   */
  async createTicket(input: {
    userId: string;
    category: string;
    subject: string;
    description: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<SupportTicket> {
    const result = await db.queryOne<SupportTicket>(
      `INSERT INTO support_tickets (user_id, category, subject, description, priority, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [
        input.userId,
        input.category,
        input.subject,
        input.description,
        input.priority || 'medium',
      ]
    );

    logger.info({ ticketId: result?.id, category: input.category }, 'Support ticket created');
    return result!;
  }

  /**
   * Get tickets with filters
   */
  async getTickets(filters: {
    userId?: string;
    status?: string;
    category?: string;
    priority?: string;
    assignedTo?: string;
  }, page = 1, limit = 20): Promise<{ items: SupportTicket[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filters.category);
    }
    if (filters.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      values.push(filters.priority);
    }
    if (filters.assignedTo) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      values.push(filters.assignedTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.queryMany<SupportTicket>(
        `SELECT * FROM support_tickets ${whereClause}
         ORDER BY 
           CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM support_tickets ${whereClause}`,
        values
      ),
    ]);

    return { items, total: parseInt(countResult?.count || '0') };
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(
    ticketId: string,
    status: SupportTicket['status'],
    assignedTo?: string
  ): Promise<SupportTicket | null> {
    const updates: string[] = ['status = $1'];
    const values: unknown[] = [status];

    if (assignedTo) {
      updates.push('assigned_to = $' + (values.length + 1));
      values.push(assignedTo);
    }

    if (status === 'resolved' || status === 'closed') {
      updates.push('resolved_at = NOW()');
    }

    values.push(ticketId);

    return db.queryOne<SupportTicket>(
      `UPDATE support_tickets SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
  }

  /**
   * Add ticket comment
   */
  async addTicketComment(
    ticketId: string,
    userId: string,
    comment: string,
    isInternal = false
  ): Promise<void> {
    await db.query(
      `INSERT INTO support_ticket_comments (ticket_id, user_id, comment, is_internal)
       VALUES ($1, $2, $3, $4)`,
      [ticketId, userId, comment, isInternal]
    );
  }

  /**
   * Get ticket comments
   */
  async getTicketComments(ticketId: string, includeInternal = false): Promise<{
    id: string;
    userId: string;
    comment: string;
    isInternal: boolean;
    createdAt: Date;
  }[]> {
    const internalCondition = includeInternal ? '' : 'AND is_internal = false';

    return db.queryMany(
      `SELECT * FROM support_ticket_comments
       WHERE ticket_id = $1 ${internalCondition}
       ORDER BY created_at`,
      [ticketId]
    );
  }

  /**
   * Get support stats
   */
  async getSupportStats(): Promise<{
    open: number;
    inProgress: number;
    avgResolutionHours: number;
    byCategory: Record<string, number>;
  }> {
    const [counts, avgResolution, byCategory] = await Promise.all([
      db.queryOne<{ open: string; in_progress: string }>(
        `SELECT 
          COUNT(*) FILTER (WHERE status = 'open') as open,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress
         FROM support_tickets`
      ),
      db.queryOne<{ avg_hours: string }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours
         FROM support_tickets WHERE resolved_at IS NOT NULL`
      ),
      db.queryMany<{ category: string; count: string }>(
        `SELECT category, COUNT(*) as count FROM support_tickets
         WHERE status NOT IN ('resolved', 'closed')
         GROUP BY category`
      ),
    ]);

    return {
      open: parseInt(counts?.open || '0'),
      inProgress: parseInt(counts?.in_progress || '0'),
      avgResolutionHours: parseFloat(avgResolution?.avg_hours || '0'),
      byCategory: byCategory.reduce((acc, r) => ({ ...acc, [r.category]: parseInt(r.count) }), {}),
    };
  }
}

export const adminService = new AdminService();
