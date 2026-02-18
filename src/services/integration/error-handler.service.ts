import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { refreshProviderTokens, IntegrationType } from '../oauth/oauth.service.js';

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  SERVER_ERROR = 'server_error',
  NETWORK = 'network',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  UNKNOWN = 'unknown',
}

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  code?: string;
  statusCode?: number;
  isRetryable: boolean;
  suggestedAction: string;
  originalError: Error;
}

export interface ErrorContext {
  integration: IntegrationType;
  operation: string;
  resourceId?: string;
  requestId?: string;
}

/**
 * Classify an error by category and determine handling strategy
 */
export function classifyError(error: Error): ClassifiedError {
  const message = error.message.toLowerCase();
  
  // Extract status code if present
  const statusMatch = error.message.match(/status[:\s]+(\d{3})/i);
  const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

  // Authentication errors (401)
  if (statusCode === 401 || message.includes('unauthorized') || message.includes('invalid token')) {
    return {
      category: ErrorCategory.AUTHENTICATION,
      message: 'Authentication failed - token may be expired',
      statusCode,
      isRetryable: true, // After token refresh
      suggestedAction: 'Refresh OAuth tokens and retry',
      originalError: error,
    };
  }

  // Authorization errors (403)
  if (statusCode === 403 || message.includes('forbidden') || message.includes('permission denied')) {
    return {
      category: ErrorCategory.AUTHORIZATION,
      message: 'Access denied - insufficient permissions',
      statusCode,
      isRetryable: false,
      suggestedAction: 'Check API permissions and scopes',
      originalError: error,
    };
  }

  // Rate limiting (429)
  if (statusCode === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return {
      category: ErrorCategory.RATE_LIMIT,
      message: 'Rate limit exceeded',
      statusCode,
      isRetryable: true,
      suggestedAction: 'Wait and retry with exponential backoff',
      originalError: error,
    };
  }

  // Server errors (5xx)
  if (statusCode && statusCode >= 500) {
    return {
      category: ErrorCategory.SERVER_ERROR,
      message: `Server error (${statusCode})`,
      statusCode,
      isRetryable: true,
      suggestedAction: 'Retry with exponential backoff',
      originalError: error,
    };
  }

  // Not found (404)
  if (statusCode === 404 || message.includes('not found')) {
    return {
      category: ErrorCategory.NOT_FOUND,
      message: 'Resource not found',
      statusCode,
      isRetryable: false,
      suggestedAction: 'Verify resource exists',
      originalError: error,
    };
  }

  // Validation errors (400, 422)
  if (statusCode === 400 || statusCode === 422 || message.includes('validation') || message.includes('invalid')) {
    return {
      category: ErrorCategory.VALIDATION,
      message: 'Request validation failed',
      statusCode,
      isRetryable: false,
      suggestedAction: 'Check request data format',
      originalError: error,
    };
  }

  // Network errors
  const networkPatterns = ['network', 'connection', 'timeout', 'ECONNRESET', 'ETIMEDOUT', 'socket'];
  if (networkPatterns.some(p => message.includes(p.toLowerCase()))) {
    return {
      category: ErrorCategory.NETWORK,
      message: 'Network error - connection issue',
      code: (error as NodeJS.ErrnoException).code,
      isRetryable: true,
      suggestedAction: 'Retry with exponential backoff',
      originalError: error,
    };
  }

  // Unknown errors
  return {
    category: ErrorCategory.UNKNOWN,
    message: error.message,
    isRetryable: false,
    suggestedAction: 'Investigate error details',
    originalError: error,
  };
}

/**
 * Handle an integration error with appropriate actions
 */
export async function handleIntegrationError(
  error: Error,
  context: ErrorContext
): Promise<{
  handled: boolean;
  shouldRetry: boolean;
  newError?: Error;
}> {
  const classified = classifyError(error);

  // Log the error with full context
  logger.error({
    integration: context.integration,
    operation: context.operation,
    resourceId: context.resourceId,
    category: classified.category,
    statusCode: classified.statusCode,
    isRetryable: classified.isRetryable,
    message: classified.message,
    suggestedAction: classified.suggestedAction,
  }, 'Integration error occurred');

  // Record error in database
  await recordIntegrationError(context, classified);

  // Handle by category
  switch (classified.category) {
    case ErrorCategory.AUTHENTICATION:
      // Attempt token refresh
      try {
        logger.info({ integration: context.integration }, 'Attempting token refresh after 401');
        await refreshProviderTokens(context.integration);
        return { handled: true, shouldRetry: true };
      } catch (refreshError) {
        logger.error({ integration: context.integration, error: refreshError }, 'Token refresh failed');
        await updateIntegrationStatus(context.integration, 'error', 'Token refresh failed');
        return { handled: true, shouldRetry: false };
      }

    case ErrorCategory.AUTHORIZATION:
      // Alert administrators
      await sendAdminAlert(context, classified);
      await updateIntegrationStatus(context.integration, 'error', 'Permission denied');
      return { handled: true, shouldRetry: false };

    case ErrorCategory.RATE_LIMIT:
      // Get retry-after header if available
      const retryAfter = extractRetryAfter(error);
      if (retryAfter) {
        logger.info({ integration: context.integration, retryAfterMs: retryAfter }, 'Rate limited, waiting');
      }
      return { handled: true, shouldRetry: true };

    case ErrorCategory.SERVER_ERROR:
    case ErrorCategory.NETWORK:
      return { handled: true, shouldRetry: true };

    case ErrorCategory.VALIDATION:
    case ErrorCategory.NOT_FOUND:
      return { handled: true, shouldRetry: false };

    default:
      return { handled: false, shouldRetry: false };
  }
}

/**
 * Record integration error in database
 */
async function recordIntegrationError(
  context: ErrorContext,
  classified: ClassifiedError
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO integration_errors (
        integration_type, operation, category, message, 
        status_code, is_retryable, error_details, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      context.integration,
      context.operation,
      classified.category,
      classified.message,
      classified.statusCode,
      classified.isRetryable,
      JSON.stringify({
        resourceId: context.resourceId,
        requestId: context.requestId,
        originalMessage: classified.originalError.message,
        stack: classified.originalError.stack,
      }),
    ]);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to record integration error');
  }
}

/**
 * Update integration status in database
 */
async function updateIntegrationStatus(
  integration: IntegrationType,
  status: string,
  errorMessage: string
): Promise<void> {
  try {
    await pool.query(`
      UPDATE integrations
      SET status = $1, last_error = $2, error_count = COALESCE(error_count, 0) + 1, updated_at = NOW()
      WHERE provider = $3
    `, [status, errorMessage, integration]);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to update integration status');
  }
}

/**
 * Send alert to administrators
 */
async function sendAdminAlert(
  context: ErrorContext,
  classified: ClassifiedError
): Promise<void> {
  logger.warn({
    alert: 'INTEGRATION_PERMISSION_ERROR',
    integration: context.integration,
    operation: context.operation,
    category: classified.category,
    message: classified.message,
  }, '🚨 Admin alert: Integration permission error');

  // TODO: Send actual alert (email, Slack, etc.)
}

/**
 * Extract Retry-After header value in milliseconds
 */
function extractRetryAfter(error: Error): number | null {
  const match = error.message.match(/retry[- ]?after[:\s]+(\d+)/i);
  if (match) {
    const seconds = parseInt(match[1], 10);
    return seconds * 1000;
  }
  return null;
}
