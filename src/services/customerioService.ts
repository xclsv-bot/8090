/**
 * Customer.io API Service
 * WO-69: Customer.io Sync System and Retry Infrastructure
 *
 * Provides integration with Customer.io Track API for:
 * - Creating/updating customer profiles
 * - Tracking sign-up events
 * - Two-phase sync support (initial + enriched data)
 */

import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// ============================================
// TYPES
// ============================================

/**
 * Customer.io customer profile attributes
 */
export interface CustomerioProfile {
  id: string; // Customer.io identifier (typically email)
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  state?: string;
  created_at?: number; // Unix timestamp
  [key: string]: string | number | boolean | undefined;
}

/**
 * Sign-up data for initial sync (Phase 1)
 */
export interface InitialSyncData {
  signupId: string;
  customerEmail: string;
  customerName: string;
  firstName?: string;
  lastName?: string;
  customerPhone?: string;
  customerState?: string;
  operatorId: number;
  operatorName?: string;
  eventId?: string;
  eventName?: string;
  ambassadorId: string;
  ambassadorName?: string;
  submittedAt: Date;
  sourceType: 'event' | 'solo';
}

/**
 * Enriched data for Phase 2 sync (after extraction confirmation)
 */
export interface EnrichedSyncData {
  signupId: string;
  customerEmail: string;
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
  extractionConfidence?: number;
  confirmedAt: Date;
}

/**
 * Result of a Customer.io API call
 */
export interface CustomerioResult {
  success: boolean;
  contactId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Custom error for Customer.io API failures
 */
export class CustomerioApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'CustomerioApiError';
  }
}

// ============================================
// CUSTOMER.IO SERVICE
// ============================================

class CustomerioService {
  private readonly baseUrl = 'https://track.customer.io/api/v1';
  private readonly siteId: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor() {
    this.siteId = env.CUSTOMERIO_SITE_ID || '';
    this.apiKey = env.CUSTOMERIO_API_KEY || '';
    this.enabled = !!(this.siteId && this.apiKey);

    if (!this.enabled) {
      logger.warn('Customer.io integration is disabled - missing credentials');
    }
  }

  /**
   * Check if Customer.io integration is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Phase 1: Initial sync immediately after sign-up submission
   * Creates/updates customer profile with basic sign-up data
   */
  async syncInitialSignUp(data: InitialSyncData): Promise<CustomerioResult> {
    if (!this.enabled) {
      logger.info({ signupId: data.signupId }, 'Customer.io disabled - skipping initial sync');
      return { success: true, contactId: `mock-${data.signupId}` };
    }

    const customerId = data.customerEmail.toLowerCase();

    // Build customer attributes
    const attributes: Record<string, string | number | boolean> = {
      email: data.customerEmail.toLowerCase(),
      first_name: data.firstName || data.customerName.split(' ')[0] || '',
      last_name: data.lastName || data.customerName.split(' ').slice(1).join(' ') || '',
      full_name: data.customerName,
      phone: data.customerPhone || '',
      state: data.customerState || '',
      latest_operator_id: data.operatorId,
      latest_operator_name: data.operatorName || '',
      latest_signup_source: data.sourceType,
      latest_signup_at: Math.floor(data.submittedAt.getTime() / 1000),
      latest_ambassador_id: data.ambassadorId,
      latest_ambassador_name: data.ambassadorName || '',
      signup_count: 1, // Will be incremented by Customer.io if customer exists
    };

    // Add event details if from an event
    if (data.eventId) {
      attributes.latest_event_id = data.eventId;
      attributes.latest_event_name = data.eventName || '';
    }

    try {
      // Create/update customer
      await this.identifyCustomer(customerId, attributes);

      // Track the signup event
      await this.trackEvent(customerId, 'signup_submitted', {
        signup_id: data.signupId,
        operator_id: data.operatorId,
        operator_name: data.operatorName || '',
        source_type: data.sourceType,
        event_id: data.eventId || '',
        event_name: data.eventName || '',
        ambassador_id: data.ambassadorId,
        ambassador_name: data.ambassadorName || '',
        timestamp: Math.floor(data.submittedAt.getTime() / 1000),
      });

      logger.info(
        { signupId: data.signupId, customerId },
        'Customer.io initial sync completed'
      );

      return { success: true, contactId: customerId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = error instanceof CustomerioApiError ? error.statusCode : 500;

      logger.error(
        { signupId: data.signupId, error: errorMessage, statusCode },
        'Customer.io initial sync failed'
      );

      return { success: false, error: errorMessage, statusCode };
    }
  }

  /**
   * Phase 2: Enriched sync after extraction confirmation
   * Updates customer profile with bet slip data
   */
  async syncEnrichedData(data: EnrichedSyncData): Promise<CustomerioResult> {
    if (!this.enabled) {
      logger.info({ signupId: data.signupId }, 'Customer.io disabled - skipping enriched sync');
      return { success: true, contactId: `mock-${data.signupId}` };
    }

    const customerId = data.customerEmail.toLowerCase();

    // Build enriched attributes
    const attributes: Record<string, string | number | boolean> = {
      latest_bet_amount: data.betAmount || 0,
      latest_team_bet_on: data.teamBetOn || '',
      latest_odds: data.odds || '',
      latest_extraction_confidence: data.extractionConfidence || 0,
      extraction_confirmed_at: Math.floor(data.confirmedAt.getTime() / 1000),
    };

    try {
      // Update customer with enriched data
      await this.identifyCustomer(customerId, attributes);

      // Track the extraction confirmation event
      await this.trackEvent(customerId, 'signup_extraction_confirmed', {
        signup_id: data.signupId,
        bet_amount: data.betAmount || 0,
        team_bet_on: data.teamBetOn || '',
        odds: data.odds || '',
        extraction_confidence: data.extractionConfidence || 0,
        timestamp: Math.floor(data.confirmedAt.getTime() / 1000),
      });

      logger.info(
        { signupId: data.signupId, customerId },
        'Customer.io enriched sync completed'
      );

      return { success: true, contactId: customerId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = error instanceof CustomerioApiError ? error.statusCode : 500;

      logger.error(
        { signupId: data.signupId, error: errorMessage, statusCode },
        'Customer.io enriched sync failed'
      );

      return { success: false, error: errorMessage, statusCode };
    }
  }

  /**
   * Create or update a customer profile in Customer.io
   */
  private async identifyCustomer(
    customerId: string,
    attributes: Record<string, string | number | boolean>
  ): Promise<void> {
    const response = await this.makeRequest(`/customers/${encodeURIComponent(customerId)}`, {
      method: 'PUT',
      body: JSON.stringify(attributes),
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }
  }

  /**
   * Track an event for a customer
   */
  private async trackEvent(
    customerId: string,
    eventName: string,
    eventData: Record<string, string | number | boolean>
  ): Promise<void> {
    const response = await this.makeRequest(`/customers/${encodeURIComponent(customerId)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        name: eventName,
        data: eventData,
      }),
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }
  }

  /**
   * Make a request to the Customer.io API
   */
  private async makeRequest(
    endpoint: string,
    options: RequestInit
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const auth = Buffer.from(`${this.siteId}:${this.apiKey}`).toString('base64');

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        ...options.headers,
      },
    });

    return response;
  }

  /**
   * Handle error responses from Customer.io API
   */
  private async handleErrorResponse(response: Response): Promise<CustomerioApiError> {
    let errorMessage = `Customer.io API error: ${response.status}`;
    let retryable = false;

    try {
      const errorBody = await response.text();
      if (errorBody) {
        errorMessage = `${errorMessage} - ${errorBody}`;
      }
    } catch {
      // Ignore parse errors
    }

    // Determine if error is retryable
    // 429 (rate limit), 5xx (server errors) are retryable
    if (response.status === 429 || response.status >= 500) {
      retryable = true;
    }

    return new CustomerioApiError(errorMessage, response.status, retryable);
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error: unknown): boolean {
    if (error instanceof CustomerioApiError) {
      return error.retryable;
    }

    // Network errors are retryable
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('fetch failed')
      );
    }

    return false;
  }
}

// Export singleton instance
export const customerioService = new CustomerioService();
