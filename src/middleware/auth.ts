import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '@clerk/backend';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { AuthUser, UserRole } from '../types/index.js';

/**
 * Middleware to authenticate requests using Clerk
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth if Clerk is not configured (development/initial deployment)
  if (!env.CLERK_SECRET_KEY) {
    logger.warn('Clerk not configured - allowing unauthenticated access');
    request.user = {
      id: 'f0dab2b2-21b4-4611-b384-134b721b3490', // Valid UUID for dev testing
      email: 'dev@xclsv.com',
      role: 'admin' as UserRole,
      firstName: 'Dev',
      lastName: 'User',
    };
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
    });
  }

  const token = authHeader.substring(7);

  try {
    // Verify the session token with Clerk
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    if (!payload || !payload.sub) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token',
        },
      });
    }

    // Extract user info from token claims
    const user: AuthUser = {
      id: payload.sub,
      email: (payload.email as string) || '',
      firstName: payload.first_name as string | undefined,
      lastName: payload.last_name as string | undefined,
      role: (payload.role as UserRole) || 'ambassador',
      organizationId: payload.org_id as string | undefined,
      metadata: payload.metadata as Record<string, unknown> | undefined,
    };

    request.user = user;
  } catch (error) {
    logger.error({ error }, 'Authentication failed');
    return reply.status(401).send({
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      },
    });
  }
}

/**
 * Middleware factory for role-based access control
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      logger.warn(
        { userId: request.user.id, role: request.user.role, requiredRoles: allowedRoles },
        'Access denied - insufficient permissions'
      );
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }
  };
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return; // Continue without auth
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    if (payload && payload.sub) {
      request.user = {
        id: payload.sub,
        email: (payload.email as string) || '',
        firstName: payload.first_name as string | undefined,
        lastName: payload.last_name as string | undefined,
        role: (payload.role as UserRole) || 'ambassador',
        organizationId: payload.org_id as string | undefined,
        metadata: payload.metadata as Record<string, unknown> | undefined,
      };
    }
  } catch {
    // Silently continue without auth
  }
}
