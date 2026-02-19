/**
 * Support Hub SLA Monitoring Job
 * WO-58: Support Hub Real-time Messaging System
 * Phase 12: Support Hub Foundation
 * 
 * Monitors support tickets for SLA warnings and breaches.
 * Runs periodically to:
 * - Send warnings for tickets approaching SLA deadline
 * - Mark tickets as SLA breached when deadline passes
 * - Send notifications to assigned admins
 */

import { db } from '../services/database.js';
import { logger } from '../utils/logger.js';
import { supportHubRealtimeService } from '../services/supportHubRealtimeService.js';
import type { TicketPriority, TicketStatus } from '../types/support-hub.js';

interface TicketForSlaCheck {
  id: string;
  ticket_number: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  sla_due_at: Date;
  sla_breached: boolean;
  assigned_to: string | null;
  ambassador_id: string | null;
}

interface AdminInfo {
  id: string;
  first_name: string;
  last_name: string;
}

/**
 * Run SLA monitoring check
 * Should be called periodically (e.g., every 5 minutes)
 */
export async function runSlaMonitoringJob(): Promise<{
  warningsIssued: number;
  breachesMarked: number;
  errors: number;
}> {
  const startTime = Date.now();
  const results = {
    warningsIssued: 0,
    breachesMarked: 0,
    errors: 0,
  };

  try {
    logger.info('Starting Support Hub SLA monitoring job');

    // Check for tickets approaching SLA (within 2 hours of breach)
    await checkTicketsApproachingSla(results);

    // Check for tickets that have breached SLA
    await checkTicketsBreachedSla(results);

    const duration = Date.now() - startTime;
    logger.info(
      { ...results, durationMs: duration },
      'Support Hub SLA monitoring job completed'
    );

    return results;
  } catch (error) {
    logger.error({ error }, 'Support Hub SLA monitoring job failed');
    throw error;
  }
}

/**
 * Check tickets approaching SLA deadline (within 2 hours)
 */
async function checkTicketsApproachingSla(results: {
  warningsIssued: number;
  errors: number;
}): Promise<void> {
  try {
    // Find tickets approaching SLA that haven't been warned yet
    const tickets = await db.queryMany<TicketForSlaCheck>(
      `SELECT id, ticket_number, subject, priority, status, sla_due_at, sla_breached, assigned_to, ambassador_id
       FROM support_tickets
       WHERE status NOT IN ('resolved', 'closed')
       AND sla_breached = false
       AND sla_due_at IS NOT NULL
       AND sla_due_at > NOW()
       AND sla_due_at <= NOW() + INTERVAL '2 hours'
       AND (sla_warning_sent_at IS NULL OR sla_warning_sent_at < NOW() - INTERVAL '1 hour')
       ORDER BY sla_due_at ASC
       LIMIT 100`
    );

    logger.debug({ ticketCount: tickets.length }, 'Found tickets approaching SLA');

    for (const ticket of tickets) {
      try {
        const hoursRemaining = Math.max(
          0,
          (new Date(ticket.sla_due_at).getTime() - Date.now()) / (1000 * 60 * 60)
        );

        // Get assigned admin name
        let assignedToName: string | undefined;
        if (ticket.assigned_to) {
          const admin = await db.queryOne<AdminInfo>(
            'SELECT id, first_name, last_name FROM users WHERE id = $1',
            [ticket.assigned_to]
          );
          if (admin) {
            assignedToName = `${admin.first_name} ${admin.last_name}`;
          }
        }

        // Publish SLA warning event
        await supportHubRealtimeService.publishSlaWarning({
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          subject: ticket.subject,
          priority: ticket.priority,
          slaDueAt: new Date(ticket.sla_due_at),
          hoursRemaining,
          assignedTo: ticket.assigned_to || undefined,
          assignedToName,
        });

        // Send push notification to assigned admin
        if (ticket.assigned_to) {
          await supportHubRealtimeService.sendPushNotification({
            userIds: [ticket.assigned_to],
            title: '⚠️ SLA Warning',
            body: `Ticket ${ticket.ticket_number} is approaching SLA deadline (${hoursRemaining.toFixed(1)} hours remaining)`,
            priority: ticket.priority === 'urgent' ? 'urgent' : 'high',
            category: 'sla_warning',
            actionUrl: `/support/tickets/${ticket.id}`,
            data: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticket_number,
              hoursRemaining,
            },
          });
        }

        // Mark warning as sent
        await db.query(
          'UPDATE support_tickets SET sla_warning_sent_at = NOW() WHERE id = $1',
          [ticket.id]
        );

        results.warningsIssued++;
      } catch (error) {
        logger.error({ error, ticketId: ticket.id }, 'Failed to process SLA warning');
        results.errors++;
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to check tickets approaching SLA');
    results.errors++;
  }
}

/**
 * Check tickets that have breached SLA
 */
async function checkTicketsBreachedSla(results: {
  breachesMarked: number;
  errors: number;
}): Promise<void> {
  try {
    // Find tickets that have breached SLA but aren't marked yet
    const tickets = await db.queryMany<TicketForSlaCheck>(
      `SELECT id, ticket_number, subject, priority, status, sla_due_at, sla_breached, assigned_to, ambassador_id
       FROM support_tickets
       WHERE status NOT IN ('resolved', 'closed')
       AND sla_breached = false
       AND sla_due_at IS NOT NULL
       AND sla_due_at < NOW()
       ORDER BY sla_due_at ASC
       LIMIT 100`
    );

    logger.debug({ ticketCount: tickets.length }, 'Found tickets with SLA breach');

    for (const ticket of tickets) {
      try {
        const hoursOverdue = (Date.now() - new Date(ticket.sla_due_at).getTime()) / (1000 * 60 * 60);

        // Get assigned admin name
        let assignedToName: string | undefined;
        if (ticket.assigned_to) {
          const admin = await db.queryOne<AdminInfo>(
            'SELECT id, first_name, last_name FROM users WHERE id = $1',
            [ticket.assigned_to]
          );
          if (admin) {
            assignedToName = `${admin.first_name} ${admin.last_name}`;
          }
        }

        // Mark as breached
        await db.query(
          'UPDATE support_tickets SET sla_breached = true, updated_at = NOW() WHERE id = $1',
          [ticket.id]
        );

        // Publish SLA breach event
        await supportHubRealtimeService.publish({
          type: 'support.ticket.sla_breached' as any,
          payload: {
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            subject: ticket.subject,
            priority: ticket.priority,
            slaDueAt: new Date(ticket.sla_due_at).toISOString(),
            hoursOverdue,
            assignedTo: ticket.assigned_to || undefined,
            assignedToName,
          },
        } as any);

        // Send urgent notification to assigned admin and all managers
        const notifyUsers: string[] = [];
        if (ticket.assigned_to) {
          notifyUsers.push(ticket.assigned_to);
        }

        // Get all managers
        const managers = await db.queryMany<{ id: string }>(
          "SELECT id FROM users WHERE role IN ('admin', 'manager')"
        );
        for (const manager of managers) {
          if (!notifyUsers.includes(manager.id)) {
            notifyUsers.push(manager.id);
          }
        }

        if (notifyUsers.length > 0) {
          await supportHubRealtimeService.sendPushNotification({
            userIds: notifyUsers,
            title: '🚨 SLA Breached',
            body: `Ticket ${ticket.ticket_number} has breached SLA (${hoursOverdue.toFixed(1)} hours overdue)`,
            priority: 'urgent',
            category: 'sla_breach',
            actionUrl: `/support/tickets/${ticket.id}`,
            data: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticket_number,
              hoursOverdue,
            },
          });
        }

        results.breachesMarked++;
      } catch (error) {
        logger.error({ error, ticketId: ticket.id }, 'Failed to process SLA breach');
        results.errors++;
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to check tickets with SLA breach');
    results.errors++;
  }
}

/**
 * Get SLA monitoring statistics
 */
export async function getSlaStats(): Promise<{
  totalOpen: number;
  atRisk: number;
  breached: number;
  byPriority: { priority: string; atRisk: number; breached: number }[];
}> {
  const stats = await db.queryOne<{
    total_open: string;
    at_risk: string;
    breached: string;
  }>(
    `SELECT 
       COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) as total_open,
       COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND sla_due_at <= NOW() + INTERVAL '2 hours' AND sla_breached = false) as at_risk,
       COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND sla_breached = true) as breached
     FROM support_tickets`
  );

  const byPriority = await db.queryMany<{
    priority: string;
    at_risk: string;
    breached: string;
  }>(
    `SELECT 
       priority,
       COUNT(*) FILTER (WHERE sla_due_at <= NOW() + INTERVAL '2 hours' AND sla_breached = false) as at_risk,
       COUNT(*) FILTER (WHERE sla_breached = true) as breached
     FROM support_tickets
     WHERE status NOT IN ('resolved', 'closed')
     GROUP BY priority`
  );

  return {
    totalOpen: parseInt(stats?.total_open || '0'),
    atRisk: parseInt(stats?.at_risk || '0'),
    breached: parseInt(stats?.breached || '0'),
    byPriority: byPriority.map(p => ({
      priority: p.priority,
      atRisk: parseInt(p.at_risk),
      breached: parseInt(p.breached),
    })),
  };
}

// Export for scheduling
export default runSlaMonitoringJob;
