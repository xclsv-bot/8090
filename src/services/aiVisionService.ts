/**
 * AI Vision Service
 * WO-68: AI Extraction Pipeline for Bet Slip Analysis
 *
 * Integrates with external AI vision service to extract bet information
 * from bet slip images. Handles:
 * - Image analysis via AI vision API
 * - Structured extraction of bet_amount, team_bet_on, odds
 * - Confidence scoring for extraction results
 * - Error handling and validation
 */

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

/**
 * Extracted bet slip data with confidence scores
 */
export interface BetSlipExtractionResult {
  /** Extracted bet amount in dollars */
  betAmount: number | null;
  /** Team or selection the bet was placed on */
  teamBetOn: string | null;
  /** Odds in string format (e.g., "-110", "+150", "2.5") */
  odds: string | null;
  /** Overall confidence score (0-100) */
  confidenceScore: number;
  /** Individual field confidence scores */
  fieldConfidence: {
    betAmount: number;
    teamBetOn: number;
    odds: number;
  };
  /** Raw AI response for audit/debugging */
  rawResponse: Record<string, unknown>;
  /** Any warnings or issues found during extraction */
  warnings: string[];
}

/**
 * AI Vision API response structure
 */
interface AIVisionAPIResponse {
  success: boolean;
  data?: {
    bet_amount?: {
      value: number | null;
      confidence: number;
      raw_text?: string;
    };
    team_bet_on?: {
      value: string | null;
      confidence: number;
      raw_text?: string;
    };
    odds?: {
      value: string | null;
      confidence: number;
      raw_text?: string;
    };
    overall_confidence: number;
    image_quality: 'good' | 'fair' | 'poor';
    warnings?: string[];
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Options for AI vision extraction
 */
export interface ExtractionOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to enhance image before processing */
  enhanceImage?: boolean;
  /** Hint about the sportsbook/operator */
  operatorHint?: string;
}

// ============================================
// ERROR CLASSES
// ============================================

/**
 * Error thrown when AI vision service is unavailable
 */
export class AIServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIServiceUnavailableError';
  }
}

/**
 * Error thrown when image cannot be processed
 */
export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

/**
 * Error thrown when extraction times out
 */
export class ExtractionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionTimeoutError';
  }
}

// ============================================
// AI VISION SERVICE
// ============================================

class AIVisionService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultTimeout: number;

  constructor() {
    // Configuration from environment
    this.baseUrl = env.AI_VISION_API_URL || 'https://api.example.com/vision';
    this.apiKey = env.AI_VISION_API_KEY || '';
    this.defaultTimeout = 30000; // 30 seconds
  }

  /**
   * Extract bet information from a bet slip image
   *
   * @param imageUrl - URL of the bet slip image (S3 or presigned URL)
   * @param options - Extraction options
   * @returns Extracted bet slip data with confidence scores
   */
  async extractBetSlipData(
    imageUrl: string,
    options: ExtractionOptions = {}
  ): Promise<BetSlipExtractionResult> {
    const timeoutMs = options.timeoutMs || this.defaultTimeout;

    logger.info({ imageUrl, options }, 'Starting bet slip extraction');

    try {
      // Make API call with timeout
      const response = await this.callVisionAPI(imageUrl, options, timeoutMs);

      // Process and validate response
      const result = this.processAPIResponse(response);

      logger.info(
        {
          imageUrl,
          confidenceScore: result.confidenceScore,
          betAmount: result.betAmount,
          teamBetOn: result.teamBetOn,
          odds: result.odds,
        },
        'Bet slip extraction completed'
      );

      return result;
    } catch (error) {
      logger.error({ error, imageUrl }, 'Bet slip extraction failed');
      throw error;
    }
  }

  /**
   * Call the AI Vision API
   */
  private async callVisionAPI(
    imageUrl: string,
    options: ExtractionOptions,
    timeoutMs: number
  ): Promise<AIVisionAPIResponse> {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Check if we have a real API configured
      if (!this.apiKey || this.apiKey === 'mock') {
        // Use mock implementation for development/testing
        return this.mockVisionAPI(imageUrl, options);
      }

      const response = await fetch(`${this.baseUrl}/extract/bet-slip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          image_url: imageUrl,
          enhance_image: options.enhanceImage ?? true,
          operator_hint: options.operatorHint,
          extraction_fields: ['bet_amount', 'team_bet_on', 'odds'],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status >= 500) {
          throw new AIServiceUnavailableError(
            `AI service returned ${response.status}: ${response.statusText}`
          );
        }
        throw new ImageProcessingError(
          `Failed to process image: ${response.status} ${response.statusText}`
        );
      }

      return (await response.json()) as AIVisionAPIResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExtractionTimeoutError(
          `Extraction timed out after ${timeoutMs}ms`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Mock Vision API for development and testing
   * Generates realistic-looking extraction results
   */
  private async mockVisionAPI(
    imageUrl: string,
    _options: ExtractionOptions
  ): Promise<AIVisionAPIResponse> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

    // Simulate occasional failures (5% rate)
    if (Math.random() < 0.05) {
      throw new AIServiceUnavailableError('Mock AI service temporarily unavailable');
    }

    // Generate realistic mock data
    const teams = [
      'New York Yankees',
      'Los Angeles Lakers',
      'Kansas City Chiefs',
      'Boston Celtics',
      'Dallas Cowboys',
      'Golden State Warriors',
      'New England Patriots',
      'Miami Heat',
    ];

    const oddsFormats = ['-110', '+150', '-200', '+250', '-150', '+300', '-125'];
    
    // Generate mock results with varying confidence
    const mockConfidence = 60 + Math.random() * 35; // 60-95
    const betAmountConfidence = mockConfidence - Math.random() * 15;
    const teamConfidence = mockConfidence - Math.random() * 10;
    const oddsConfidence = mockConfidence - Math.random() * 20;

    const mockBetAmount = [10, 20, 25, 50, 100, 200, 500][Math.floor(Math.random() * 7)];
    const mockTeam = teams[Math.floor(Math.random() * teams.length)];
    const mockOdds = oddsFormats[Math.floor(Math.random() * oddsFormats.length)];

    // Determine image quality based on URL (for testing)
    const imageQuality = imageUrl.includes('poor')
      ? 'poor'
      : imageUrl.includes('fair')
        ? 'fair'
        : 'good';

    // Lower confidence and potentially null values for poor quality
    const qualityMultiplier = imageQuality === 'poor' ? 0.6 : imageQuality === 'fair' ? 0.8 : 1;

    const warnings: string[] = [];
    if (imageQuality === 'poor') {
      warnings.push('Image quality is poor, extraction confidence reduced');
    }

    return {
      success: true,
      data: {
        bet_amount: {
          value: Math.random() > 0.1 ? mockBetAmount : null, // 10% chance of null
          confidence: betAmountConfidence * qualityMultiplier,
          raw_text: `$${mockBetAmount}.00`,
        },
        team_bet_on: {
          value: Math.random() > 0.05 ? mockTeam : null, // 5% chance of null
          confidence: teamConfidence * qualityMultiplier,
          raw_text: mockTeam,
        },
        odds: {
          value: Math.random() > 0.15 ? mockOdds : null, // 15% chance of null
          confidence: oddsConfidence * qualityMultiplier,
          raw_text: mockOdds,
        },
        overall_confidence: mockConfidence * qualityMultiplier,
        image_quality: imageQuality,
        warnings,
      },
    };
  }

  /**
   * Process and validate API response
   */
  private processAPIResponse(response: AIVisionAPIResponse): BetSlipExtractionResult {
    if (!response.success || !response.data) {
      const errorMsg = response.error?.message || 'Unknown error from AI service';
      throw new ImageProcessingError(errorMsg);
    }

    const { data } = response;
    const warnings: string[] = data.warnings || [];

    // Extract values with defaults
    const betAmount = data.bet_amount?.value ?? null;
    const teamBetOn = data.team_bet_on?.value ?? null;
    const odds = data.odds?.value ?? null;

    // Calculate field confidence with fallbacks
    const fieldConfidence = {
      betAmount: data.bet_amount?.confidence ?? 0,
      teamBetOn: data.team_bet_on?.confidence ?? 0,
      odds: data.odds?.confidence ?? 0,
    };

    // Add warnings for missing critical fields
    if (betAmount === null) {
      warnings.push('Bet amount could not be extracted');
    }
    if (teamBetOn === null) {
      warnings.push('Team/selection could not be extracted');
    }

    // Overall confidence score (0-100)
    let confidenceScore = data.overall_confidence;

    // Penalize for missing critical fields
    if (betAmount === null) confidenceScore *= 0.7;
    if (teamBetOn === null) confidenceScore *= 0.8;

    // Ensure confidence is within bounds
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));

    return {
      betAmount,
      teamBetOn,
      odds,
      confidenceScore: Math.round(confidenceScore * 100) / 100, // Round to 2 decimal places
      fieldConfidence: {
        betAmount: Math.round(fieldConfidence.betAmount * 100) / 100,
        teamBetOn: Math.round(fieldConfidence.teamBetOn * 100) / 100,
        odds: Math.round(fieldConfidence.odds * 100) / 100,
      },
      rawResponse: response as unknown as Record<string, unknown>,
      warnings,
    };
  }

  /**
   * Validate that an image URL is accessible
   */
  async validateImageUrl(imageUrl: string): Promise<boolean> {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
      
      if (!response.ok) {
        logger.warn({ imageUrl, status: response.status }, 'Image URL validation failed');
        return false;
      }

      if (!contentType?.startsWith('image/')) {
        logger.warn({ imageUrl, contentType }, 'URL does not point to an image');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, imageUrl }, 'Failed to validate image URL');
      return false;
    }
  }

  /**
   * Health check for AI vision service
   */
  async healthCheck(): Promise<{ available: boolean; latencyMs?: number }> {
    const start = Date.now();

    try {
      if (!this.apiKey || this.apiKey === 'mock') {
        return { available: true, latencyMs: 0 };
      }

      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;

      return {
        available: response.ok,
        latencyMs,
      };
    } catch {
      return { available: false };
    }
  }
}

// Export singleton instance
export const aiVisionService = new AIVisionService();

// Export types and errors
export {
  AIVisionAPIResponse,
};
