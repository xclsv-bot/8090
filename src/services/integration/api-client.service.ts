import { logger } from '../../utils/logger.js';
import { IntegrationType } from '../oauth/oauth.service.js';
import { ensureValidToken } from '../oauth/token-refresh.service.js';
import { withRetry, RetryConfig, RetryResult } from './retry.service.js';
import { handleIntegrationError, classifyError, ErrorCategory } from './error-handler.service.js';

export interface ApiClientConfig {
  integration: IntegrationType;
  baseUrl: string;
  retryConfig?: Partial<RetryConfig>;
  defaultHeaders?: Record<string, string>;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  operation: string;
  resourceId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    category: string;
    message: string;
    statusCode?: number;
  };
  meta?: {
    attempts: number;
    totalDelayMs: number;
    requestId?: string;
  };
}

/**
 * Create an API client for an integration with built-in retry and error handling
 */
export function createApiClient(config: ApiClientConfig) {
  const { integration, baseUrl, retryConfig, defaultHeaders } = config;

  /**
   * Make an authenticated API request with retry and error handling
   */
  async function request<T>(
    endpoint: string,
    options: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const { method = 'GET', body, headers = {}, operation, resourceId } = options;
    const url = `${baseUrl}${endpoint}`;
    const requestId = generateRequestId();

    const context = {
      integration,
      operation,
      resourceId,
      requestId,
    };

    logger.debug({
      ...context,
      url,
      method,
    }, 'API request starting');

    // Execute with retry
    const result = await withRetry<T>(
      async () => {
        // Get fresh token before each attempt
        const token = await ensureValidToken(integration);

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Request-ID': requestId,
            ...defaultHeaders,
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
          throw new Error(
            `HTTP ${response.status}: ${errorBody.message || errorBody.error || response.statusText}`
          );
        }

        return response.json() as Promise<T>;
      },
      retryConfig,
      context
    );

    // Handle result
    if (result.success) {
      logger.info({
        ...context,
        attempts: result.attempts,
        totalDelayMs: result.totalDelayMs,
      }, 'API request succeeded');

      return {
        success: true,
        data: result.data,
        meta: {
          attempts: result.attempts,
          totalDelayMs: result.totalDelayMs,
          requestId,
        },
      };
    }

    // Handle error
    if (result.error) {
      const { handled, shouldRetry } = await handleIntegrationError(result.error, context);
      const classified = classifyError(result.error);

      // If error was handled and should retry (e.g., token refresh), try once more
      if (handled && shouldRetry) {
        logger.info({ ...context }, 'Retrying after error handling');
        return request<T>(endpoint, options);
      }

      return {
        success: false,
        error: {
          category: classified.category,
          message: classified.message,
          statusCode: classified.statusCode,
        },
        meta: {
          attempts: result.attempts,
          totalDelayMs: result.totalDelayMs,
          requestId,
        },
      };
    }

    return {
      success: false,
      error: {
        category: ErrorCategory.UNKNOWN,
        message: 'Unknown error occurred',
      },
      meta: {
        attempts: result.attempts,
        totalDelayMs: result.totalDelayMs,
        requestId,
      },
    };
  }

  /**
   * GET request
   */
  async function get<T>(endpoint: string, operation: string): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { method: 'GET', operation });
  }

  /**
   * POST request
   */
  async function post<T>(
    endpoint: string,
    body: unknown,
    operation: string
  ): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { method: 'POST', body, operation });
  }

  /**
   * PUT request
   */
  async function put<T>(
    endpoint: string,
    body: unknown,
    operation: string,
    resourceId?: string
  ): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { method: 'PUT', body, operation, resourceId });
  }

  /**
   * PATCH request
   */
  async function patch<T>(
    endpoint: string,
    body: unknown,
    operation: string,
    resourceId?: string
  ): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { method: 'PATCH', body, operation, resourceId });
  }

  /**
   * DELETE request
   */
  async function del<T>(
    endpoint: string,
    operation: string,
    resourceId?: string
  ): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { method: 'DELETE', operation, resourceId });
  }

  return {
    request,
    get,
    post,
    put,
    patch,
    delete: del,
  };
}

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Pre-configured API clients for each integration
 */
export const quickbooksClient = (realmId: string) => createApiClient({
  integration: 'quickbooks',
  baseUrl: `https://quickbooks.api.intuit.com/v3/company/${realmId}`,
  defaultHeaders: {
    'Accept': 'application/json',
  },
  retryConfig: {
    maxAttempts: 3,
    initialDelayMs: 2000, // QuickBooks recommends longer delays
  },
});

export const rampClient = () => createApiClient({
  integration: 'ramp',
  baseUrl: 'https://api.ramp.com/developer/v1',
  defaultHeaders: {
    'Accept': 'application/json',
  },
});
