import { FastifyRequest, FastifyReply } from 'fastify';
import { createClerkClient } from '@clerk/backend';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { AuthUser, UserRole } from '../types/index.js';

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

/**
 * Middleware to authenticate requests using Clerk
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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
    const { sub: userId } = await clerk.verifyToken(token);

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token',
        },
      });
    }

    // Get full user details
    const clerkUser = await clerk.users.getUser(userId);

    // Extract role from public metadata (set in Clerk dashboard)
    const role = (clerkUser.publicMetadata?.role as UserRole) || 'ambassador';

    const user: AuthUser = {
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || '',
      firstName: clerkUser.firstName || undefined,
      lastName: clerkUser.lastName || undefined,
      role,
      organizationId: clerkUser.publicMetadata?.organizationId as string | undefined,
      metadata: clerkUser.publicMetadata,
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
    const { sub: userId } = await clerk.verifyToken(token);
    if (userId) {
      const clerkUser = await clerk.users.getUser(userId);
      const role = (clerkUser.publicMetadata?.role as UserRole) || 'ambassador';

      request.user = {
        id: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress || '',
        firstName: clerkUser.firstName || undefined,
        lastName: clerkUser.lastName || undefined,
        role,
        organizationId: clerkUser.publicMetadata?.organizationId as string | undefined,
        metadata: clerkUser.publicMetadata,
      };
    }
  } catch {
    // Silently continue without auth
  }
}
