/**
 * Enrichment Module
 *
 * Implements person enrichment per Implementation Spec Section 7.
 *
 * Key behaviors:
 * - Person enrichment is OPTIONAL and NON-BLOCKING
 * - Failure must not halt the pipeline
 * - Always return valid EnrichmentOutput even on error
 * - Log errors but don't throw
 *
 * Section 7.1 - Allowed Behavior:
 * - Summarize explicitly provided LinkedIn URLs
 * - Use configured safe enrichment providers
 *
 * Section 7.2 - Prohibited Behavior:
 * - No scraping of restricted platforms as a requirement
 * - No guessing or hallucination
 */

import type { RunId } from '../types/index.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Confidence levels for enrichment data
 * Per Implementation Spec Section 7.3
 */
export type EnrichmentConfidence = 'high' | 'medium' | 'low' | 'not_available';

/**
 * Profile summary result from enrichment
 */
export interface ProfileSummary {
  summary: string;
  confidence: EnrichmentConfidence;
}

/**
 * Canonical enrichment output per Implementation Spec Section 7.3
 */
export interface EnrichmentOutput {
  requester_profile: ProfileSummary;
  errors: string[];
}

/**
 * Canonical input contract (subset relevant to enrichment)
 * Per Implementation Spec Section 4.1
 */
export interface CanonicalInput {
  meta: {
    trigger_source: 'inbound' | 'outbound';
    submitted_at: string;
    run_id: string;
    requested_meeting_at?: string | null;
    timezone?: string | null;
  };
  organization: {
    name?: string | null;
    website?: string | null;
    domain?: string | null;
  };
  contact: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin_url?: string | null;
  };
  notes: {
    comments?: string | null;
    intent_topic?: string | null;
    source_context?: string | null;
  };
  routing: {
    crm_target?: string | null;
    email_to?: string | null;
    email_cc?: string[];
    motion_workspace?: string | null;
  };
}

/**
 * Configuration for enrichment behavior
 */
export interface EnrichmentConfig {
  /** Enable/disable enrichment caching */
  cacheEnabled?: boolean;
  /** Cache TTL in seconds */
  cacheTTL?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts (default: 1 per spec) */
  maxRetries?: number;
  /** Retry backoff in milliseconds (default: 30000 per spec) */
  retryBackoffMs?: number;
  /** Enrichment provider configuration */
  provider?: EnrichmentProviderConfig;
}

/**
 * Provider-specific configuration
 */
export interface EnrichmentProviderConfig {
  /** Provider type */
  type: 'null' | 'llm' | 'api';
  /** API key for external providers */
  apiKey?: string;
  /** API endpoint URL */
  apiUrl?: string;
  /** LLM model ID for LLM-based summarization */
  llmModelId?: string;
}

/**
 * Enrichment provider interface
 * Factory pattern for different enrichment strategies
 */
export interface EnrichmentProvider {
  /** Provider name for logging */
  readonly name: string;

  /**
   * Summarize a LinkedIn profile
   * @param linkedinUrl - The LinkedIn profile URL to summarize
   * @returns Profile summary with confidence level
   */
  summarize(linkedinUrl: string): Promise<ProfileSummary>;
}

/**
 * Logger interface for observability
 */
export interface EnrichmentLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Metrics collector interface for observability
 */
export interface EnrichmentMetrics {
  incrementCounter(name: string, tags?: Record<string, string>): void;
  recordDuration(name: string, durationMs: number, tags?: Record<string, string>): void;
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;
}

// =============================================================================
// Default Logger (Console-based)
// =============================================================================

/**
 * Default console logger implementation
 */
export const defaultLogger: EnrichmentLogger = {
  info: (message: string, context?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: 'info', module: 'enrichment', message, ...context, timestamp: new Date().toISOString() }));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: 'warn', module: 'enrichment', message, ...context, timestamp: new Date().toISOString() }));
  },
  error: (message: string, context?: Record<string, unknown>) => {
    console.error(JSON.stringify({ level: 'error', module: 'enrichment', message, ...context, timestamp: new Date().toISOString() }));
  },
  debug: (message: string, context?: Record<string, unknown>) => {
    console.debug(JSON.stringify({ level: 'debug', module: 'enrichment', message, ...context, timestamp: new Date().toISOString() }));
  },
};

/**
 * Default no-op metrics implementation
 */
export const defaultMetrics: EnrichmentMetrics = {
  incrementCounter: () => { /* no-op */ },
  recordDuration: () => { /* no-op */ },
  recordGauge: () => { /* no-op */ },
};

// =============================================================================
// Enrichment Providers
// =============================================================================

/**
 * Null enrichment provider - returns "Not found" with "not_available" confidence
 * This is the default provider when no enrichment is configured
 * Per Implementation Spec Section 7.3
 */
export class NullEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'null';

  async summarize(_linkedinUrl: string): Promise<ProfileSummary> {
    return {
      summary: 'Not found',
      confidence: 'not_available',
    };
  }
}

/**
 * LLM-based enrichment provider
 * Uses an LLM to summarize publicly available LinkedIn data
 * NOTE: Does NOT scrape LinkedIn directly (prohibited per Section 7.2)
 */
export class LLMEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'llm';
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly modelId: string;
  private readonly timeout: number;

  constructor(
    config: {
      apiKey: string;
      apiUrl: string;
      modelId: string;
      timeout?: number;
    },
    private readonly logger: EnrichmentLogger = defaultLogger
  ) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl;
    this.modelId = config.modelId;
    this.timeout = config.timeout ?? 30000;
  }

  async summarize(linkedinUrl: string): Promise<ProfileSummary> {
    // NOTE: This implementation is a stub.
    // In production, this would call an LLM API with pre-fetched profile data
    // from a safe enrichment provider (not direct LinkedIn scraping).

    this.logger.info('LLM enrichment provider called', {
      linkedinUrl,
      apiUrl: this.apiUrl,
      modelId: this.modelId,
      timeout: this.timeout,
      hasApiKey: !!this.apiKey,
    });

    // For now, return low confidence with URL acknowledgment
    // Production would integrate with an actual LLM API
    return {
      summary: `LinkedIn profile provided: ${linkedinUrl}. Profile details require safe enrichment provider integration.`,
      confidence: 'low',
    };
  }
}

/**
 * API-based enrichment provider
 * Uses a configured safe enrichment API (e.g., Clearbit, Apollo, etc.)
 */
export class APIEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'api';
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeout: number;

  constructor(
    config: {
      apiKey: string;
      apiUrl: string;
      timeout?: number;
    },
    private readonly logger: EnrichmentLogger = defaultLogger
  ) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl;
    this.timeout = config.timeout ?? 30000;
  }

  async summarize(linkedinUrl: string): Promise<ProfileSummary> {
    // NOTE: This implementation is a stub.
    // In production, this would call a safe enrichment API
    // that is compliant with data privacy regulations.

    this.logger.info('API enrichment provider called', {
      linkedinUrl,
      apiUrl: this.apiUrl,
      timeout: this.timeout,
      hasApiKey: !!this.apiKey,
    });

    // For now, return low confidence placeholder
    return {
      summary: `LinkedIn profile provided: ${linkedinUrl}. API enrichment integration pending.`,
      confidence: 'low',
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Factory function to create an enrichment provider based on configuration
 * @param config - Provider configuration
 * @param logger - Logger instance
 * @returns Configured enrichment provider
 */
export function getEnrichmentProvider(
  config?: EnrichmentProviderConfig,
  logger: EnrichmentLogger = defaultLogger
): EnrichmentProvider {
  if (!config) {
    logger.debug('No provider config provided, using NullEnrichmentProvider');
    return new NullEnrichmentProvider();
  }

  switch (config.type) {
    case 'llm':
      if (!config.apiKey || !config.apiUrl || !config.llmModelId) {
        logger.warn('LLM provider config incomplete, falling back to NullEnrichmentProvider', {
          hasApiKey: !!config.apiKey,
          hasApiUrl: !!config.apiUrl,
          hasModelId: !!config.llmModelId,
        });
        return new NullEnrichmentProvider();
      }
      return new LLMEnrichmentProvider({
        apiKey: config.apiKey,
        apiUrl: config.apiUrl,
        modelId: config.llmModelId,
      }, logger);

    case 'api':
      if (!config.apiKey || !config.apiUrl) {
        logger.warn('API provider config incomplete, falling back to NullEnrichmentProvider', {
          hasApiKey: !!config.apiKey,
          hasApiUrl: !!config.apiUrl,
        });
        return new NullEnrichmentProvider();
      }
      return new APIEnrichmentProvider({
        apiKey: config.apiKey,
        apiUrl: config.apiUrl,
      }, logger);

    case 'null':
    default:
      logger.debug('Using NullEnrichmentProvider');
      return new NullEnrichmentProvider();
  }
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Validate a LinkedIn URL format
 * @param url - URL to validate
 * @returns true if valid LinkedIn URL
 */
export function isValidLinkedInUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    const validHosts = ['linkedin.com', 'www.linkedin.com'];
    return validHosts.includes(parsed.hostname) && parsed.pathname.startsWith('/in/');
  } catch {
    return false;
  }
}

/**
 * Summarize a LinkedIn profile using the configured provider
 * Per Implementation Spec Section 7.1 - only summarize explicitly provided URLs
 *
 * @param url - LinkedIn profile URL
 * @param config - Enrichment configuration
 * @param logger - Logger instance
 * @returns Profile summary
 */
export async function summarizeLinkedIn(
  url: string,
  config: EnrichmentConfig,
  logger: EnrichmentLogger = defaultLogger
): Promise<ProfileSummary> {
  logger.info('Summarizing LinkedIn profile', { url });

  // Validate URL format
  if (!isValidLinkedInUrl(url)) {
    logger.warn('Invalid LinkedIn URL format', { url });
    return {
      summary: 'Not found',
      confidence: 'not_available',
    };
  }

  // Get configured provider
  const provider = getEnrichmentProvider(config.provider, logger);

  logger.debug('Using enrichment provider', { provider: provider.name });

  // Call provider to summarize
  return provider.summarize(url);
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a "not found" enrichment output
 * Per Implementation Spec Section 7.3
 */
function createNotFoundOutput(errors: string[] = []): EnrichmentOutput {
  return {
    requester_profile: {
      summary: 'Not found',
      confidence: 'not_available',
    },
    errors,
  };
}

/**
 * Enrich person data from canonical input
 *
 * Per Implementation Spec Section 7:
 * - Check if linkedin_url is provided
 * - If provided, attempt to summarize using safe provider
 * - If not provided, return "Not found" with "not_available" confidence
 * - Never block pipeline execution on failure
 * - Retry once with 30s backoff on failure
 *
 * @param input - Canonical input containing contact information
 * @param config - Enrichment configuration
 * @param observability - Logger and metrics instances
 * @returns Enrichment output (always valid, never throws)
 */
export async function enrichPerson(
  input: CanonicalInput,
  config: EnrichmentConfig = {},
  observability: { logger?: EnrichmentLogger; metrics?: EnrichmentMetrics } = {}
): Promise<EnrichmentOutput> {
  const logger = observability.logger ?? defaultLogger;
  const metrics = observability.metrics ?? defaultMetrics;
  const startTime = Date.now();

  const runId = input.meta.run_id;
  const linkedinUrl = input.contact.linkedin_url;

  logger.info('Starting person enrichment', {
    runId,
    hasLinkedInUrl: !!linkedinUrl
  });
  metrics.incrementCounter('enrichment.started', { runId });

  // If no LinkedIn URL provided, return not found immediately
  // Per Section 7.2 - No guessing or hallucination
  if (!linkedinUrl) {
    logger.info('No LinkedIn URL provided, returning not found', { runId });
    metrics.incrementCounter('enrichment.no_url', { runId });
    metrics.recordDuration('enrichment.duration_ms', Date.now() - startTime, { runId, result: 'no_url' });
    return createNotFoundOutput();
  }

  // Configuration with defaults per spec
  const maxRetries = config.maxRetries ?? 1;
  const retryBackoffMs = config.retryBackoffMs ?? 30000; // 30 seconds per spec

  const errors: string[] = [];
  let lastError: Error | null = null;

  // Attempt enrichment with retry logic
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(`Retry attempt ${attempt} after ${retryBackoffMs}ms backoff`, { runId, attempt });
        metrics.incrementCounter('enrichment.retry', { runId, attempt: String(attempt) });
        await sleep(retryBackoffMs);
      }

      const summary = await summarizeLinkedIn(linkedinUrl, config, logger);

      logger.info('Person enrichment completed successfully', {
        runId,
        confidence: summary.confidence,
        attempt
      });
      metrics.incrementCounter('enrichment.success', {
        runId,
        confidence: summary.confidence
      });
      metrics.recordDuration('enrichment.duration_ms', Date.now() - startTime, {
        runId,
        result: 'success',
        attempt: String(attempt)
      });

      return {
        requester_profile: summary,
        errors,
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = `Enrichment attempt ${attempt + 1} failed: ${lastError.message}`;

      logger.error(errorMessage, {
        runId,
        attempt,
        error: lastError.message,
        stack: lastError.stack
      });
      metrics.incrementCounter('enrichment.error', { runId, attempt: String(attempt) });

      errors.push(errorMessage);
    }
  }

  // All attempts failed - return not found with errors
  // Per spec: "Failure must not halt the pipeline"
  logger.warn('All enrichment attempts failed, returning not found', {
    runId,
    totalAttempts: maxRetries + 1,
    errors
  });
  metrics.incrementCounter('enrichment.failed', { runId });
  metrics.recordDuration('enrichment.duration_ms', Date.now() - startTime, {
    runId,
    result: 'failed'
  });

  return createNotFoundOutput(errors);
}

// =============================================================================
// Exports
// =============================================================================

export {
  type RunId,
};
