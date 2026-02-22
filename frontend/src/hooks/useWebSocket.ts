'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

type WebSocketMessage = {
  type: string;
  data: unknown;
};

type EventHandler = (data: unknown) => void;

/**
 * Derive WebSocket URL from API URL
 * AC-100.5: WebSocket URL derived from API URL, not hardcoded
 */
function getWebSocketUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  
  if (!apiUrl) {
    console.warn('NEXT_PUBLIC_API_URL not set, WebSocket disabled');
    return '';
  }
  
  // Convert http(s):// to ws(s)://
  const wsUrl = apiUrl
    .replace('https://', 'wss://')
    .replace('http://', 'ws://');
  
  return `${wsUrl}/ws`;
}

export function useWebSocket(customUrl?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

  const url = useMemo(() => customUrl || getWebSocketUrl(), [customUrl]);

  const connect = useCallback(() => {
    if (!url) {
      console.warn('No WebSocket URL available');
      return;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Reconnect with backoff, max 3 attempts
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          setTimeout(connect, 3000 * reconnectAttempts.current);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);

          // Dispatch to registered handlers
          const handlers = handlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach(handler => handler(message.data));
          }

          // Also dispatch to wildcard handlers
          const wildcardHandlers = handlersRef.current.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach(handler => handler(message));
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const subscribe = useCallback((eventType: string, handler: EventHandler) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      handlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  const send = useCallback((type: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    subscribe,
    send,
    connect,
    disconnect,
  };
}

// Event types from the backend
export type WebSocketEventType =
  | 'sign_up.submitted'
  | 'sign_up.validated'
  | 'event.updated'
  | 'event.created'
  | 'event.deleted'
  | 'ambassador.availability_changed'
  | 'payroll.calculated'
  | 'external_sync.completed';

// Hook for subscribing to specific event types
export function useWebSocketEvent<T = unknown>(
  eventType: WebSocketEventType | '*',
  handler: (data: T) => void
) {
  const { subscribe, isConnected } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe(eventType, handler as EventHandler);
    return unsubscribe;
  }, [eventType, handler, subscribe]);

  return { isConnected };
}
