import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

vi.mock('../../services/database.js', () => ({
  db: {
    query: vi.fn().mockResolvedValue({}),
    queryMany: vi.fn().mockResolvedValue([]),
  },
}));

function socket() {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

function parseSentEvents(ws: WebSocket) {
  const send = (ws as any).send as ReturnType<typeof vi.fn>;
  return send.mock.calls.map(([payload]: [string]) => JSON.parse(payload));
}

describe('Phase 1: Real-time event propagation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('propagates signup, event, ambassador, payroll, and sync events to eligible clients', async () => {
    const { eventPublisher } = await import('../../services/eventPublisher.js');
    const {
      publishAmbassadorCheckedIn,
      publishAmbassadorCheckedOut,
      publishEventUpdated,
      publishExternalSyncCompleted,
      publishExternalSyncFailed,
      publishPayrollCalculated,
      publishSignUpSubmitted,
    } = await import('../../utils/events.js');

    const adminWs = socket();
    const ambassadorWs = socket();
    const affiliateWs = socket();

    const adminClient = eventPublisher.registerClient(adminWs, 'admin-1', 'admin');
    const ambassadorClient = eventPublisher.registerClient(ambassadorWs, 'amb-7', 'ambassador');
    const affiliateClient = eventPublisher.registerClient(affiliateWs, 'aff-1', 'affiliate');

    eventPublisher.updateSubscription(ambassadorClient, {
      eventTypes: ['sign_up.submitted', 'event.updated', 'ambassador.checked_in', 'ambassador.checked_out'],
      eventIds: ['event-77'],
    });

    await publishSignUpSubmitted({
      signUpId: 'su-1',
      eventId: 'event-77',
      ambassadorId: 'amb-7',
      operatorId: 123,
      customerName: 'Customer One',
      userId: 'admin-1',
    });

    await publishEventUpdated({
      eventId: 'event-77',
      title: 'Main Event',
      status: 'active',
      userId: 'admin-1',
    });

    await publishAmbassadorCheckedIn({
      ambassadorId: 'amb-7',
      eventId: 'event-77',
      checkTime: new Date().toISOString(),
      userId: 'admin-1',
    });

    await publishAmbassadorCheckedOut({
      ambassadorId: 'amb-7',
      eventId: 'event-77',
      checkTime: new Date().toISOString(),
      userId: 'admin-1',
    });

    await publishPayrollCalculated({
      payPeriodId: 'pay-1',
      totalAmount: 1200,
      totalSignups: 45,
      ambassadorCount: 5,
      userId: 'admin-1',
    });

    await publishExternalSyncCompleted({
      syncType: 'customerio',
      source: 'api',
      recordsProcessed: 42,
      userId: 'admin-1',
    });

    await publishExternalSyncFailed({
      syncType: 'customerio',
      source: 'api',
      errorMessage: 'timeout',
      userId: 'admin-1',
    });

    const adminEvents = parseSentEvents(adminWs).filter((m) => m.type === 'event');
    const ambassadorEvents = parseSentEvents(ambassadorWs).filter((m) => m.type === 'event');
    const affiliateEvents = parseSentEvents(affiliateWs).filter((m) => m.type === 'event');

    expect(adminEvents.length).toBe(7);
    expect(ambassadorEvents.map((e) => e.data.type)).toEqual([
      'sign_up.submitted',
      'event.updated',
      'ambassador.checked_in',
      'ambassador.checked_out',
    ]);
    expect(affiliateEvents.map((e) => e.data.type)).toEqual(['external_sync.completed']);

    eventPublisher.unregisterClient(adminClient);
    eventPublisher.unregisterClient(ambassadorClient);
    eventPublisher.unregisterClient(affiliateClient);
  });
});
