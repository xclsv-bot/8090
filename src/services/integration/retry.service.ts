import { logger } from '../../utils/logger.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
  retryableErrors: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'],
};

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Execute a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: { integration?: string; operation?: string }
): Promise<RetryResult<T>> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 1) {
        logger.info({
          ...context,
          attempt,
          totalDelayMs,
        }, 'Operation succeeded after retry');
      }

      return {
        success: true,
        data: result,
        attempts: attempt,
        totalDelayMs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const isRetryable = isRetryableError(lastError, cfg);
      const isLastAttempt = attempt === cfg.maxAttempts;

      logger.warn({
        ...context,
        attempt,
        maxAttempts: cfg.maxAttempts,
        error: lastError.message,
        isRetryable,
        isLastAttempt,
      }, 'Operation failed');

      if (!isRetryable || isLastAttempt) {
        break;
      }

      // Calculate delay with exponential backoff
      const delayMs = calculateDelay(attempt, cfg);
      totalDelayMs += delayMs;

      logger.info({
        ...context,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
      }, 'Retrying after delay');

      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: cfg.maxAttempts,
    totalDelayMs,
  };
}

/**
 * Check if an error is retryable based on configuration
 */
export function isRetryableError(error: Error, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  // Check for HTTP status codes
  const statusMatch = error.message.match(/status[:\s]+(\d{3})/i);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    if (config.retryableStatuses.includes(status)) {
      return true;
    }
    // Non-retryable HTTP errors (auth, forbidden, not found, validation)
    if ([400, 401, 403, 404, 422].includes(status)) {
      return false;
    }
  }

  // Check for retryable error codes (network errors)
  const errorCode = (error as NodeJS.ErrnoException).code;
  if (errorCode && config.retryableErrors.includes(errorCode)) {
    return true;
  }

  // Check for specific error patterns
  const retryablePatterns = [
    /timeout/i,
    /timed? out/i,
    /network/i,
    /connection/i,
    /socket/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /rate limit/i,
    /too many requests/i,
    /service unavailable/i,
    /internal server error/i,
    /bad gateway/i,
    /gateway timeout/i,
  ];

  for (const pattern of retryablePatterns) {
    if (pattern.test(error.message)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for a given attempt with exponential backoff
 */
export function calculateDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  
  // Add jitter (±10% randomness) to prevent thundering herd
  const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
  
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a retry wrapper for a specific integration
 */
export function createRetryWrapper(
  integration: string,
  customConfig?: Partial<RetryConfig>
): <T>(fn: () => Promise<T>, operation: string) => Promise<RetryResult<T>> {
  return async <T>(fn: () => Promise<T>, operation: string) => {
    return withRetry(fn, customConfig, { integration, operation });
  };
}
