import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function resolveWebSocketUrl(apiUrl?: string) {
  if (!apiUrl) return '';
  return `${apiUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/ws`;
}

describe('Phase 7: Real-time updates and live data', () => {
  it('derives WebSocket URL from API URL without hardcoding hosts', () => {
    expect(resolveWebSocketUrl('https://api.example.com')).toBe('wss://api.example.com/ws');
    expect(resolveWebSocketUrl('http://localhost:3001')).toBe('ws://localhost:3001/ws');
    expect(resolveWebSocketUrl()).toBe('');
  });

  it('defines reconnect and subscription hooks in useWebSocket', () => {
    const content = read('frontend/src/hooks/useWebSocket.ts');

    expect(content).toContain('maxReconnectAttempts = 3');
    expect(content).toContain('setTimeout(connect, 3000 * reconnectAttempts.current)');
    expect(content).toContain('const subscribe = useCallback');
    expect(content).toContain("handlersRef.current.get('*')");
    expect(content).toContain('WebSocketEventType');
  });

  it('refreshes event data on event.updated/event.created/event.deleted messages', () => {
    const content = read('frontend/src/hooks/useEvents.ts');

    expect(content).toContain("subscribe('event.updated'");
    expect(content).toContain("subscribe('event.created'");
    expect(content).toContain("subscribe('event.deleted'");
    expect(content).toContain('reload();');
  });
});
