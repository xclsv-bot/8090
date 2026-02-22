/**
 * Shared API Client
 * WO-98: Base client with auth, error handling, and key transformations
 */

// ============================================
// CONFIGURATION
// ============================================

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// AC-100.4: Fail clearly if NEXT_PUBLIC_API_URL not set
if (!API_URL && typeof window !== 'undefined') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_API_URL environment variable is required');
  } else {
    console.warn(
      '⚠️ NEXT_PUBLIC_API_URL not set. Using fallback URL.\n' +
      'Set NEXT_PUBLIC_API_URL in .env.local for proper configuration.'
    );
  }
}

const BASE_URL = API_URL || 'https://xclsv-core-platform.onrender.com';

// ============================================
// ERROR HANDLING
// ============================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(status: number, body: unknown): ApiError {
    if (typeof body === 'object' && body !== null) {
      const err = body as Record<string, unknown>;
      const message = (err.message as string) || 
                      (err.error as { message?: string })?.message || 
                      `HTTP ${status}`;
      const code = (err.code as string) || (err.error as { code?: string })?.code;
      return new ApiError(message, status, code, body);
    }
    return new ApiError(`HTTP ${status}`, status);
  }
}

// ============================================
// KEY TRANSFORMATIONS
// ============================================

/** Convert snake_case to camelCase */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/** Convert camelCase to snake_case */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/** Recursively transform object keys from snake_case to camelCase */
export function transformKeysToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(transformKeysToCamel);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).reduce((acc, [key, value]) => {
      acc[snakeToCamel(key)] = transformKeysToCamel(value);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return obj;
}

/** Recursively transform object keys from camelCase to snake_case */
export function transformKeysToSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(transformKeysToSnake);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).reduce((acc, [key, value]) => {
      acc[camelToSnake(key)] = transformKeysToSnake(value);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return obj;
}

// ============================================
// AUTH TOKEN MANAGEMENT
// ============================================

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

// ============================================
// API RESPONSE TYPE
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// REQUEST OPTIONS
// ============================================

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Override auth token for this request */
  token?: string;
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Skip camelCase transformation of response */
  rawResponse?: boolean;
  /** Skip JSON parsing (for blob responses) */
  rawBody?: boolean;
}

// ============================================
// CORE FETCH WRAPPER
// ============================================

/**
 * Core fetch wrapper with auth, error handling, and key transformation
 */
export async function fetchApi<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { token, body, rawResponse, rawBody, ...fetchOptions } = options;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Add auth token
  const authHeader = token || authToken;
  if (authHeader) {
    headers['Authorization'] = `Bearer ${authHeader}`;
  }

  // Build request
  const request: RequestInit = {
    ...fetchOptions,
    headers,
  };

  // Add body if present
  if (body !== undefined) {
    request.body = JSON.stringify(body);
  }

  // Execute request
  const response = await fetch(`${BASE_URL}${endpoint}`, request);

  // Handle non-OK responses
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw ApiError.fromResponse(response.status, errorBody);
  }

  // Handle raw body (for blobs)
  if (rawBody) {
    return { success: true, data: response as unknown as T };
  }

  // Parse JSON
  const json = await response.json();

  // Transform keys if needed
  if (rawResponse) {
    return json as ApiResponse<T>;
  }

  return transformKeysToCamel(json) as ApiResponse<T>;
}

/**
 * GET request helper
 */
export function get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'GET' });
}

/**
 * POST request helper
 */
export function post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'POST', body });
}

/**
 * PUT request helper
 */
export function put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'PUT', body });
}

/**
 * PATCH request helper
 */
export function patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'PATCH', body });
}

/**
 * DELETE request helper
 */
export function del<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'DELETE' });
}

// ============================================
// QUERY STRING BUILDER
// ============================================

/**
 * Build query string from params object, filtering out undefined/null values
 */
export function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)]);
  
  if (entries.length === 0) return '';
  
  return '?' + new URLSearchParams(entries).toString();
}

// ============================================
// EXPORTS
// ============================================

export { BASE_URL };
