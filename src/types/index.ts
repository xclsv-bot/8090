// User roles for RBAC
export type UserRole = 'admin' | 'manager' | 'ambassador' | 'affiliate';

// Authenticated user from Clerk
export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

// Extend Fastify request with auth
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: 'up' | 'down';
    storage: 'up' | 'down';
    auth: 'up' | 'down';
  };
}

// File upload types
export interface FileUpload {
  key: string;
  url: string;
  signedUrl?: string;
  contentType: string;
  size: number;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
