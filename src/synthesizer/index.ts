/**
 * Synthesizer Module - Level 2 Deal Preparation
 *
 * Implements LLM synthesis per Implementation Spec Sections 8 and 9
 *
 * Features:
 * - Claude API integration with @anthropic-ai/sdk
 * - Prompt template loading and compilation
 * - JSON output validation against canonical schema
 * - Retry logic with one retry for format/constraint violations
 * - Full observability with logging and metrics hooks
 *
 * Usage:
 * ```typescript
 * const { synthesizeBrief } = await import('deal-prep-level-2/synthesizer');
 * const result = await synthesizeBrief(runId, storage, config);
 * ```
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  RunId,
  StorageAdapter,
  ModuleResult,
} from '../types/index.js';
import type { CanonicalInput } from '../normalizer/index.js';
import type { ScrapeOutput } from '../scraper/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for Claude API
 */
export interface ClaudeConfig {
  /** Anthropic API key (from ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model ID (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Maximum tokens for response (default: 4096) */
  maxTokens?: number;
  /** Temperature for generation (default: 0.3) */
  temperature?: number;
  /** Request timeout in milliseconds (default: 120000) */
  timeout?: number;
}

/**
 * Enrichment output per Implementation Spec Section 7.3
 */
export interface EnrichmentOutput {
  requester_profile: {
    summary: string;
    confidence: 'high' | 'medium' | 'low' | 'not_available';
  };
  errors: string[];
}

/**
 * Context for synthesis containing all input artifacts
 */
export interface SynthesisContext {
  runId: RunId;
  canonicalInput: CanonicalInput;
  websiteScrape: ScrapeOutput | null;
  enrichmentOutput: EnrichmentOutput | null;
  generatedAt: string;
}

/**
 * Person mention in leadership
 */
export interface StaffMention {
  name: string;
  role: string;
}

/**
 * Executive leader details
 */
export interface ExecutiveLeader {
  name: string;
  role: string;
  summary: string;
}

/**
 * Program information
 */
export interface ProgramInfo {
  name: string;
  summary: string;
}

/**
 * AI opportunity details
 */
export interface AIOpportunity {
  title: string;
  why_it_matters: string;
  demonstration_hook: string;
}

/**
 * Objection and rebuttal pair
 */
export interface ObjectionRebuttal {
  objection: string;
  rebuttal: string;
}

/**
 * Email template
 */
export interface EmailTemplate {
  subject: string;
  body: string;
}

/**
 * Canonical Deal Preparation Brief per Implementation Spec Section 9.2
 */
export interface DealPrepBrief {
  meta: {
    run_id: string;
    generated_at: string;
    trigger_source: 'inbound' | 'outbound';
    organization_name: string;
    organization_website: string;
    organization_domain: string;
    requester_name: string;
    requester_title: string;
    source_urls: string[];
  };
  executive_summary: {
    summary: string;
    top_opportunities: [string, string, string];
  };
  organization_understanding: {
    mission: string;
    programs: ProgramInfo[];
    audiences: string[];
  };
  website_analysis: {
    overall_tone: string;
    strengths: string[];
    gaps: string[];
    volunteer_flow_observations: string;
    donation_flow_observations: string;
  };
  leadership_and_staff: {
    executive_leader: ExecutiveLeader;
    other_staff_mentions: StaffMention[];
  };
  requester_profile: {
    summary: string;
    conversation_angle: string;
  };
  artificial_intelligence_opportunities: [AIOpportunity, AIOpportunity, AIOpportunity];
  demonstration_plan: {
    opening: string;
    steps: string[];
    example_bot_responses: string[];
  };
  objections_and_rebuttals: [ObjectionRebuttal, ObjectionRebuttal, ObjectionRebuttal];
  opening_script: string;
  follow_up_emails: {
    short_version: EmailTemplate;
    warm_version: EmailTemplate;
  };
}

/**
 * Logger interface for observability
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Metrics interface for observability
 */
export interface Metrics {
  increment(metric: string, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, value: number, tags?: Record<string, string>): void;
}

// ============================================================================
// Default Implementations
// ============================================================================

const defaultLogger: Logger = {
  info: (msg, meta) => console.log(`[INFO] [synthesizer] ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta) => console.warn(`[WARN] [synthesizer] ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, meta) => console.error(`[ERROR] [synthesizer] ${msg}`, meta ? JSON.stringify(meta) : ''),
  debug: (msg, meta) => console.debug(`[DEBUG] [synthesizer] ${msg}`, meta ? JSON.stringify(meta) : ''),
};

const defaultMetrics: Metrics = {
  increment: () => {},
  gauge: () => {},
  timing: () => {},
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT = 120000;
const MAX_RETRIES = 1; // Per spec Section 8.2: one retry allowed

/** Exponential backoff delays for rate limit handling */
const RATE_LIMIT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

// ============================================================================
// Zod Schema for Brief Validation (per Implementation Spec Section 9.2-9.3)
// ============================================================================

const StaffMentionSchema = z.object({
  name: z.string(),
  role: z.string(),
});

const ExecutiveLeaderSchema = z.object({
  name: z.string(),
  role: z.string(),
  summary: z.string(),
});

const ProgramInfoSchema = z.object({
  name: z.string(),
  summary: z.string(),
});

const AIOpportunitySchema = z.object({
  title: z.string(),
  why_it_matters: z.string(),
  demonstration_hook: z.string(),
});

const ObjectionRebuttalSchema = z.object({
  objection: z.string(),
  rebuttal: z.string(),
});

const EmailTemplateSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

/**
 * Full Zod schema for DealPrepBrief with hard constraints from Section 9.3
 */
const DealPrepBriefSchema = z.object({
  meta: z.object({
    run_id: z.string(),
    generated_at: z.string(),
    trigger_source: z.enum(['inbound', 'outbound']),
    organization_name: z.string(),
    organization_website: z.string(),
    organization_domain: z.string(),
    requester_name: z.string(),
    requester_title: z.string(),
    source_urls: z.array(z.string()),
  }),
  executive_summary: z.object({
    summary: z.string().max(600, 'Executive summary must be <= 600 characters'),
    top_opportunities: z.tuple([z.string(), z.string(), z.string()]),
  }),
  organization_understanding: z.object({
    mission: z.string(),
    programs: z.array(ProgramInfoSchema),
    audiences: z.array(z.string()),
  }),
  website_analysis: z.object({
    overall_tone: z.string(),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    volunteer_flow_observations: z.string(),
    donation_flow_observations: z.string(),
  }),
  leadership_and_staff: z.object({
    executive_leader: ExecutiveLeaderSchema,
    other_staff_mentions: z.array(StaffMentionSchema),
  }),
  requester_profile: z.object({
    summary: z.string(),
    conversation_angle: z.string(),
  }),
  artificial_intelligence_opportunities: z.tuple([
    AIOpportunitySchema,
    AIOpportunitySchema,
    AIOpportunitySchema,
  ]),
  demonstration_plan: z.object({
    opening: z.string(),
    steps: z.array(z.string()).max(6, 'Demonstration plan must have <= 6 steps'),
    example_bot_responses: z.array(z.string()),
  }),
  objections_and_rebuttals: z.tuple([
    ObjectionRebuttalSchema,
    ObjectionRebuttalSchema,
    ObjectionRebuttalSchema,
  ]),
  opening_script: z.string().max(450, 'Opening script must be <= 450 characters'),
  follow_up_emails: z.object({
    short_version: EmailTemplateSchema,
    warm_version: EmailTemplateSchema,
  }),
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Count words in a string
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Validate word count constraints per Section 9.3
 */
function validateWordCounts(brief: DealPrepBrief): string[] {
  const errors: string[] = [];

  const shortEmailWords = countWords(brief.follow_up_emails.short_version.body);
  if (shortEmailWords > 120) {
    errors.push(`Short follow-up email body has ${shortEmailWords} words, must be <= 120`);
  }

  const warmEmailWords = countWords(brief.follow_up_emails.warm_version.body);
  if (warmEmailWords > 180) {
    errors.push(`Warm follow-up email body has ${warmEmailWords} words, must be <= 180`);
  }

  return errors;
}

/**
 * Get the prompts directory path
 */
function getPromptsDir(): string {
  // Handle both ESM and CommonJS environments
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    return join(currentDir, '..', '..', 'prompts');
  } catch {
    // Fallback for CommonJS or alternative environments
    return join(process.cwd(), 'prompts');
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load and compile prompt template with context variables
 *
 * @param context - Synthesis context containing all artifacts
 * @param templatePath - Optional custom template path
 * @returns Compiled prompt string
 */
export async function buildPrompt(
  context: SynthesisContext,
  templatePath?: string
): Promise<ModuleResult<string>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    // Load template
    const promptsDir = getPromptsDir();
    const templateFile = templatePath || join(promptsDir, 'synthesize-brief.md');

    let template: string;
    try {
      template = await readFile(templateFile, 'utf-8');
    } catch (readError) {
      return {
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: `Failed to load prompt template: ${templateFile}`,
          details: readError,
        },
        metadata: {
          runId: context.runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    // Build context objects for template injection
    const runMetadata = {
      run_id: context.runId,
      generated_at: context.generatedAt,
    };

    const canonicalInput = context.canonicalInput;

    const websiteScrape = context.websiteScrape || {
      scrape_meta: {
        started_at: null,
        completed_at: null,
        source_domain: 'Not available',
        tool: 'none',
        pages_fetched: 0,
      },
      pages: [],
      errors: ['Website scrape not available'],
    };

    const enrichmentOutput = context.enrichmentOutput || {
      requester_profile: {
        summary: 'Not found',
        confidence: 'not_available' as const,
      },
      errors: ['Enrichment not available'],
    };

    // Compile template using simple string replacement
    // Template uses {{variable}} syntax
    let compiled = template
      .replace('{{run_metadata}}', JSON.stringify(runMetadata, null, 2))
      .replace('{{canonical_input}}', JSON.stringify(canonicalInput, null, 2))
      .replace('{{website_scrape}}', JSON.stringify(websiteScrape, null, 2))
      .replace('{{enrichment_output}}', JSON.stringify(enrichmentOutput, null, 2));

    return {
      success: true,
      data: compiled,
      metadata: {
        runId: context.runId,
        module: 'synthesizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: 'PROMPT_BUILD_ERROR',
        message: `Failed to build prompt: ${errorMessage}`,
        details: error,
      },
      metadata: {
        runId: context.runId,
        module: 'synthesizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Call Claude API with retry logic for rate limits
 *
 * @param prompt - The compiled prompt to send
 * @param config - Claude configuration
 * @param systemPrompt - Optional system prompt override
 * @param logger - Logger for observability
 * @param metrics - Metrics collector
 * @returns Raw response text from Claude
 */
export async function callClaude(
  prompt: string,
  config: ClaudeConfig,
  systemPrompt?: string,
  logger: Logger = defaultLogger,
  metrics: Metrics = defaultMetrics
): Promise<ModuleResult<string>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Resolve configuration
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = config.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const maxTokens = config.maxTokens || parseInt(process.env.ANTHROPIC_MAX_TOKENS || String(DEFAULT_MAX_TOKENS), 10);
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;

  if (!apiKey) {
    return {
      success: false,
      error: {
        code: 'MISSING_API_KEY',
        message: 'ANTHROPIC_API_KEY is required. Set it in config or environment variable.',
      },
      metadata: {
        runId: '',
        module: 'synthesizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }

  // Initialize Anthropic client
  const client = new Anthropic({
    apiKey,
    timeout: config.timeout || DEFAULT_TIMEOUT,
  });

  // System prompt for JSON output
  const defaultSystemPrompt = `You are an expert sales enablement analyst. You MUST output ONLY valid JSON that conforms exactly to the schema provided in the prompt. No markdown code fences, no explanatory text - just raw JSON.`;

  const finalSystemPrompt = systemPrompt || defaultSystemPrompt;

  logger.info('Calling Claude API', {
    model,
    maxTokens,
    temperature,
    promptLength: prompt.length,
  });

  metrics.increment('synthesizer.claude.calls', { model });

  // Retry logic for rate limits
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RATE_LIMIT_DELAYS_MS.length; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: finalSystemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text content from response
      const textContent = response.content.find((block: ContentBlock) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      const responseText = textContent.text;

      logger.info('Claude API response received', {
        model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        stopReason: response.stop_reason,
      });

      metrics.timing('synthesizer.claude.duration', Date.now() - startTime, { model });
      metrics.gauge('synthesizer.claude.input_tokens', response.usage?.input_tokens || 0, { model });
      metrics.gauge('synthesizer.claude.output_tokens', response.usage?.output_tokens || 0, { model });

      return {
        success: true,
        data: responseText,
        metadata: {
          runId: '',
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error
      const isRateLimit =
        lastError.message.includes('rate_limit') ||
        lastError.message.includes('429') ||
        lastError.message.includes('overloaded');

      if (isRateLimit && attempt < RATE_LIMIT_DELAYS_MS.length - 1) {
        const delay = RATE_LIMIT_DELAYS_MS[attempt] || 1000;
        logger.warn(`Rate limited, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          error: lastError.message,
        });
        metrics.increment('synthesizer.claude.rate_limit', { model });
        await sleep(delay);
        continue;
      }

      // Not a rate limit error or exhausted retries
      break;
    }
  }

  logger.error('Claude API call failed', {
    error: lastError?.message,
  });

  metrics.increment('synthesizer.claude.errors', {});

  return {
    success: false,
    error: {
      code: 'CLAUDE_API_ERROR',
      message: lastError?.message || 'Unknown error calling Claude API',
      details: lastError,
    },
    metadata: {
      runId: '',
      module: 'synthesizer',
      timestamp,
      duration: Date.now() - startTime,
    },
  };
}

/**
 * Parse and validate Claude response into DealPrepBrief
 *
 * @param response - Raw response text from Claude
 * @param context - Synthesis context for enrichment
 * @returns Validated and enriched DealPrepBrief
 */
export function parseBriefResponse(
  response: string,
  context: SynthesisContext
): ModuleResult<DealPrepBrief> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    // Clean response - remove any markdown code fences if present
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedResponse);
    } catch (parseError) {
      return {
        success: false,
        error: {
          code: 'JSON_PARSE_ERROR',
          message: 'Failed to parse response as JSON',
          details: {
            parseError,
            responsePreview: cleanedResponse.substring(0, 500),
          },
        },
        metadata: {
          runId: context.runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    // Validate against schema
    const validationResult = DealPrepBriefSchema.safeParse(parsed);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      return {
        success: false,
        error: {
          code: 'SCHEMA_VALIDATION_ERROR',
          message: 'Response does not conform to brief schema',
          details: errors,
        },
        metadata: {
          runId: context.runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    const brief = validationResult.data as DealPrepBrief;

    // Additional word count validation per Section 9.3
    const wordCountErrors = validateWordCounts(brief);
    if (wordCountErrors.length > 0) {
      return {
        success: false,
        error: {
          code: 'CONSTRAINT_VIOLATION',
          message: 'Brief violates word count constraints',
          details: wordCountErrors,
        },
        metadata: {
          runId: context.runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    // Enrich with metadata from context
    brief.meta.run_id = context.runId;
    brief.meta.generated_at = context.generatedAt;

    // Ensure source_urls are populated from scrape if not already
    if (brief.meta.source_urls.length === 0 && context.websiteScrape) {
      brief.meta.source_urls = context.websiteScrape.pages.map((p) => p.url);
    }

    return {
      success: true,
      data: brief,
      metadata: {
        runId: context.runId,
        module: 'synthesizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: `Failed to parse brief response: ${errorMessage}`,
        details: error,
      },
      metadata: {
        runId: context.runId,
        module: 'synthesizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Calculate confidence score based on data completeness
 */
export function calculateConfidence(
  brief: DealPrepBrief,
  context: SynthesisContext
): 'high' | 'medium' | 'low' {
  let score = 0;
  const maxScore = 10;

  // Website scrape quality
  if (context.websiteScrape) {
    const pageCount = context.websiteScrape.pages.length;
    if (pageCount >= 10) score += 3;
    else if (pageCount >= 5) score += 2;
    else if (pageCount > 0) score += 1;
  }

  // Enrichment quality
  if (context.enrichmentOutput?.requester_profile.confidence === 'high') {
    score += 2;
  } else if (context.enrichmentOutput?.requester_profile.confidence === 'medium') {
    score += 1;
  }

  // Brief completeness
  if (brief.meta.organization_name !== 'Not found') score += 1;
  if (brief.organization_understanding.mission !== 'Not found') score += 1;
  if (brief.leadership_and_staff.executive_leader.name !== 'Not found') score += 1;
  if (brief.organization_understanding.programs.length > 0) score += 1;
  if (brief.website_analysis.strengths.length > 0) score += 1;

  const percentage = score / maxScore;
  if (percentage >= 0.7) return 'high';
  if (percentage >= 0.4) return 'medium';
  return 'low';
}

/**
 * Main entry point: Synthesize a Deal Preparation Brief from all gathered data
 *
 * Per Implementation Spec Sections 8 and 9:
 * 1. Load artifacts from storage (input, scrape, enrichment)
 * 2. Build synthesis context
 * 3. Load and compile prompt template
 * 4. Call Claude API with JSON mode
 * 5. Validate response against schema
 * 6. Store brief artifact in S3
 * 7. Retry once on validation failure
 *
 * @param runId - Unique run identifier
 * @param storage - Storage adapter for artifact persistence
 * @param config - Claude configuration
 * @param logger - Optional logger for observability
 * @param metrics - Optional metrics collector
 * @returns ModuleResult containing the generated DealPrepBrief
 */
export async function synthesizeBrief(
  runId: RunId,
  storage: StorageAdapter,
  config: ClaudeConfig,
  logger: Logger = defaultLogger,
  metrics: Metrics = defaultMetrics
): Promise<ModuleResult<DealPrepBrief>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  logger.info('Starting brief synthesis', { runId });
  metrics.increment('synthesizer.started', { run_id: runId });

  try {
    // Step 1: Load artifacts from storage
    logger.debug('Loading artifacts from storage', { runId });

    // Load canonical input (required)
    let canonicalInput: CanonicalInput;
    try {
      const inputResult = await storage.load(runId, 'input');
      canonicalInput = JSON.parse(inputResult.content as string) as CanonicalInput;
      logger.debug('Loaded canonical input', {
        runId,
        orgName: canonicalInput.organization.name,
      });
    } catch (loadError) {
      logger.error('Failed to load canonical input', { runId, error: loadError });
      return {
        success: false,
        error: {
          code: 'INPUT_NOT_FOUND',
          message: `Canonical input not found for run ${runId}`,
          details: loadError,
        },
        metadata: {
          runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    // Load website scrape (optional - may be null)
    let websiteScrape: ScrapeOutput | null = null;
    try {
      if (await storage.exists(runId, 'scrape')) {
        const scrapeResult = await storage.load(runId, 'scrape');
        websiteScrape = JSON.parse(scrapeResult.content as string) as ScrapeOutput;
        logger.debug('Loaded website scrape', {
          runId,
          pageCount: websiteScrape.pages.length,
        });
      } else {
        logger.warn('Website scrape not found, proceeding without', { runId });
      }
    } catch (scrapeError) {
      logger.warn('Failed to load website scrape, proceeding without', {
        runId,
        error: scrapeError,
      });
    }

    // Load enrichment (optional - may be null)
    let enrichmentOutput: EnrichmentOutput | null = null;
    try {
      if (await storage.exists(runId, 'enrichment')) {
        const enrichmentResult = await storage.load(runId, 'enrichment');
        enrichmentOutput = JSON.parse(enrichmentResult.content as string) as EnrichmentOutput;
        logger.debug('Loaded enrichment output', {
          runId,
          confidence: enrichmentOutput.requester_profile.confidence,
        });
      } else {
        logger.info('Enrichment not found, proceeding without', { runId });
      }
    } catch (enrichError) {
      logger.warn('Failed to load enrichment, proceeding without', {
        runId,
        error: enrichError,
      });
    }

    // Step 2: Build synthesis context
    const generatedAt = new Date().toISOString();
    const context: SynthesisContext = {
      runId,
      canonicalInput,
      websiteScrape,
      enrichmentOutput,
      generatedAt,
    };

    // Step 3: Build prompt
    logger.debug('Building prompt', { runId });
    const promptResult = await buildPrompt(context);
    if (!promptResult.success || !promptResult.data) {
      logger.error('Failed to build prompt', { runId, error: promptResult.error });
      return {
        success: false,
        error: promptResult.error || {
          code: 'PROMPT_BUILD_FAILED',
          message: 'Failed to build prompt',
        },
        metadata: {
          runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    const prompt = promptResult.data;

    // Step 4 & 5: Call Claude and parse response (with retry per spec Section 8.2)
    let brief: DealPrepBrief | null = null;
    let lastError: { code: string; message: string; details?: unknown } | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      logger.info(`Synthesis attempt ${attempt + 1}/${MAX_RETRIES + 1}`, { runId });

      // Call Claude
      const claudeResult = await callClaude(prompt, config, undefined, logger, metrics);
      if (!claudeResult.success || !claudeResult.data) {
        lastError = claudeResult.error || {
          code: 'CLAUDE_CALL_FAILED',
          message: 'Claude API call failed',
        };
        logger.warn('Claude call failed', { runId, attempt, error: lastError });
        continue;
      }

      // Parse and validate response
      const parseResult = parseBriefResponse(claudeResult.data, context);
      if (!parseResult.success || !parseResult.data) {
        lastError = parseResult.error || {
          code: 'PARSE_FAILED',
          message: 'Failed to parse brief response',
        };
        logger.warn('Response parsing/validation failed', {
          runId,
          attempt,
          error: lastError,
        });
        continue;
      }

      brief = parseResult.data;
      logger.info('Successfully generated and validated brief', { runId, attempt });
      break;
    }

    if (!brief) {
      logger.error('Failed to generate valid brief after retries', { runId, error: lastError });
      metrics.increment('synthesizer.failed', { run_id: runId });
      return {
        success: false,
        error: lastError || {
          code: 'SYNTHESIS_FAILED',
          message: 'Failed to generate valid brief after retries',
        },
        metadata: {
          runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    // Step 6: Store brief artifact
    logger.debug('Storing brief artifact', { runId });
    try {
      await storage.save(runId, 'brief', JSON.stringify(brief, null, 2), {
        contentType: 'application/json',
        confidence: calculateConfidence(brief, context),
      });
      logger.info('Brief artifact stored', { runId });
    } catch (storeError) {
      logger.error('Failed to store brief artifact', { runId, error: storeError });
      return {
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: 'Failed to store brief artifact',
          details: storeError,
        },
        metadata: {
          runId,
          module: 'synthesizer',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    const duration = Date.now() - startTime;
    logger.info('Synthesis completed successfully', {
      runId,
      durationMs: duration,
      confidence: calculateConfidence(brief, context),
    });

    metrics.timing('synthesizer.duration', duration, { run_id: runId });
    metrics.increment('synthesizer.completed', { run_id: runId });

    return {
      success: true,
      data: brief,
      metadata: {
        runId,
        module: 'synthesizer',
        timestamp,
        duration,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Synthesis failed with unexpected error', {
      runId,
      error: errorMessage,
    });

    metrics.increment('synthesizer.failed', { run_id: runId });

    return {
      success: false,
      error: {
        code: 'SYNTHESIS_ERROR',
        message: errorMessage,
        details: error,
      },
      metadata: {
        runId,
        module: 'synthesizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  DealPrepBriefSchema,
  validateWordCounts,
};

export default {
  synthesizeBrief,
  buildPrompt,
  callClaude,
  parseBriefResponse,
  calculateConfidence,
  DealPrepBriefSchema,
};
