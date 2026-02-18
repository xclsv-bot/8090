import { FastifyPluginAsync } from 'fastify';
import {
  initiateOAuthFlow,
  handleOAuthCallback,
  getCredentials,
  disconnectIntegration,
  IntegrationType,
} from '../services/oauth/oauth.service.js';
import { getIntegrationStatuses } from '../services/oauth/token-refresh.service.js';
import { logger } from '../utils/logger.js';

const oauthRoutes: FastifyPluginAsync = async (fastify) => {
  // Get integration statuses
  fastify.get('/status', async (request, reply) => {
    const statuses = await getIntegrationStatuses();
    return { success: true, data: statuses };
  });

  // Initiate OAuth flow
  fastify.post<{
    Params: { provider: string };
  }>('/:provider/authorize', async (request, reply) => {
    const { provider } = request.params;
    
    const validProviders: IntegrationType[] = ['quickbooks', 'ramp'];
    if (!validProviders.includes(provider as IntegrationType)) {
      return reply.code(400).send({
        success: false,
        error: `Invalid provider: ${provider}. Supported: ${validProviders.join(', ')}`,
      });
    }

    try {
      const { authUrl, state } = await initiateOAuthFlow(provider as IntegrationType);
      
      return {
        success: true,
        data: {
          authUrl,
          state,
          message: `Redirect user to authUrl to complete OAuth flow`,
        },
      };
    } catch (error) {
      logger.error({ provider, error }, 'Failed to initiate OAuth');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'OAuth initiation failed',
      });
    }
  });

  // QuickBooks OAuth callback
  fastify.get<{
    Querystring: {
      code?: string;
      state?: string;
      realmId?: string;
      error?: string;
    };
  }>('/quickbooks/callback', async (request, reply) => {
    const { code, state, realmId, error } = request.query;

    if (error) {
      logger.warn({ error }, 'QuickBooks OAuth error');
      return reply.redirect(`/integrations?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state || !realmId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameters: code, state, realmId',
      });
    }

    try {
      await handleOAuthCallback('quickbooks', code, state, { realmId });
      
      // Redirect to success page
      return reply.redirect('/integrations?success=quickbooks');
    } catch (error) {
      logger.error({ error }, 'QuickBooks OAuth callback failed');
      return reply.redirect(`/integrations?error=${encodeURIComponent(
        error instanceof Error ? error.message : 'OAuth failed'
      )}`);
    }
  });

  // Ramp OAuth callback
  fastify.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
    };
  }>('/ramp/callback', async (request, reply) => {
    const { code, state, error } = request.query;

    if (error) {
      logger.warn({ error }, 'Ramp OAuth error');
      return reply.redirect(`/integrations?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameters: code, state',
      });
    }

    try {
      await handleOAuthCallback('ramp', code, state);
      
      // Redirect to success page
      return reply.redirect('/integrations?success=ramp');
    } catch (error) {
      logger.error({ error }, 'Ramp OAuth callback failed');
      return reply.redirect(`/integrations?error=${encodeURIComponent(
        error instanceof Error ? error.message : 'OAuth failed'
      )}`);
    }
  });

  // Get integration credentials (returns masked info, not actual tokens)
  fastify.get<{
    Params: { provider: string };
  }>('/:provider', async (request, reply) => {
    const { provider } = request.params;
    
    try {
      const credentials = await getCredentials(provider as IntegrationType);
      
      if (!credentials) {
        return reply.code(404).send({
          success: false,
          error: `No credentials found for ${provider}`,
        });
      }

      // Return masked info, never expose actual tokens
      return {
        success: true,
        data: {
          id: credentials.id,
          integrationType: credentials.integrationType,
          status: credentials.status,
          expiresAt: credentials.expiresAt,
          metadata: credentials.metadata,
          hasAccessToken: !!credentials.accessToken,
          hasRefreshToken: !!credentials.refreshToken,
        },
      };
    } catch (error) {
      logger.error({ provider, error }, 'Failed to get credentials');
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve credentials',
      });
    }
  });

  // Disconnect integration
  fastify.delete<{
    Params: { provider: string };
  }>('/:provider', async (request, reply) => {
    const { provider } = request.params;
    
    try {
      await disconnectIntegration(provider as IntegrationType);
      
      return {
        success: true,
        message: `${provider} integration disconnected`,
      };
    } catch (error) {
      logger.error({ provider, error }, 'Failed to disconnect integration');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Disconnect failed',
      });
    }
  });
};

export default oauthRoutes;
