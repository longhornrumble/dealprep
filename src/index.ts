/**
 * Deal Prep Level 2 - Main Entry Point
 *
 * This module exports all public interfaces and implementations for the
 * Deal Preparation Brief generation system.
 *
 * Architecture:
 * - n8n orchestrates the workflow
 * - Each module is callable independently via n8n Code nodes
 * - Artifacts are stored in S3 with RunID-based organization
 * - Modules communicate via artifact storage (no direct coupling)
 */

// Core Types
export type * from './types/index.js';

// Normalizer Module - Input canonicalization and validation
export {
  normalize,
  validateInput,
  deriveOrganizationIdentifier,
  extractDomain,
  normalizeUrl,
  normalizeEmail,
  trimString,
  type CanonicalInput,
  type TriggerSource,
  type NormalizerConfig,
} from './normalizer/index.js';

// Run Manager Module - Run lifecycle and idempotency
export {
  generateRunId,
  generateRunIdFull,
  roundTimestamp,
  initializeRunManager,
  createRun,
  checkIdempotency,
  updateRunStatus,
  getRunMetadata,
  markArtifactComplete,
  updateDeliveryStatus,
  type RunStatus,
  type RunMetadata,
  type RunArtifact,
  type RunManagerConfig,
} from './run-manager/index.js';

// Storage Module - Artifact persistence
export {
  S3StorageAdapter,
  MemoryStorageAdapter,
  createStorageAdapter,
  type StorageAdapter,
  type S3Config,
  type ArtifactType,
} from './storage/index.js';

// Scraper Module
export {
  scrapeWebsite,
  crawlWebsite,
  classifyPageType,
  extractCTAs,
  extractPeopleMentions,
  isSameDomain,
  type PageType,
  type PersonMention,
  type ScrapedPage,
  type ScrapeMeta,
  type ScrapeOutput,
  type ScraperConfig,
  type FirecrawlConfig,
  type ScrapeOptions,
  type Logger,
  type Metrics,
} from './scraper/index.js';

// Enrichment Module
export {
  enrichPerson,
  summarizeLinkedIn,
  getEnrichmentProvider,
  isValidLinkedInUrl,
  NullEnrichmentProvider,
  LLMEnrichmentProvider,
  APIEnrichmentProvider,
  defaultLogger,
  defaultMetrics,
  type EnrichmentConfig,
  type EnrichmentProviderConfig,
  type EnrichmentProvider,
  type EnrichmentOutput,
  type ProfileSummary,
  type EnrichmentConfidence,
  type EnrichmentLogger,
  type EnrichmentMetrics,
  type CanonicalInput as EnrichmentCanonicalInput,
} from './enrichment/index.js';

// Synthesizer Module
export {
  synthesizeBrief,
  buildPrompt,
  callClaude,
  parseBriefResponse,
  calculateConfidence,
  type ClaudeConfig,
  type SynthesisContext,
} from './synthesizer/index.js';

// Validator Module
export {
  validateBrief,
  validateInput as validateInputSchema,
  checkRequiredFields,
  checkContentQuality,
  applyCustomRules,
  type ValidationConfig,
  type ValidationRule,
} from './validator/index.js';

// Renderers Module
export {
  renderForCRM,
  renderForEmail,
  renderForMotion,
  renderAsMarkdown,
  renderAsPlainText,
  renderAsJSON,
  type RenderConfig,
} from './renderers/index.js';

// Adapters Module - Delivery adapters for CRM, Email, and Motion
export {
  // Adapter implementations
  NullCRMAdapter,
  SendGridEmailAdapter,
  NullEmailAdapter,
  MotionAPIAdapter,
  NullMotionAdapter,
  // Orchestrator
  executeDeliveries,
  createAdaptersFromEnv,
  createInitialDeliveryStatus,
  calculateDeliveryMetrics,
  // Helper
  extractDomain as extractDomainFromUrl,
} from './adapters/index.js';

export type {
  // Types
  CRMAdapter,
  EmailAdapter,
  MotionAdapter,
  CRMAdapterInterface,
  EmailAdapterInterface,
  MotionAdapterInterface,
  // Data types
  OrgData,
  ContactData,
  RunMeta,
  CRMResult,
  EmailMessage,
  EmailResult,
  EmailConfig,
  MotionTask,
  MotionResult,
  MotionConfig,
  // Delivery types
  DeliveryStatus,
  DeliveryChannelStatus,
  DeliveryStatusValue,
  DeliveryMetrics,
  RenderedOutputs,
  CRMNoteOutput,
  EmailOutput,
  MotionTaskOutput,
  CanonicalInput as DeliveryCanonicalInput,
  AdaptersConfig,
  Logger as DeliveryLogger,
} from './adapters/index.js';

/**
 * Module Boundaries:
 *
 * 1. normalizer - Input canonicalization and validation
 *    - Accepts raw webhook/API inputs
 *    - Normalizes to CanonicalInput schema
 *    - Validates required fields
 *
 * 2. run-manager - Run lifecycle management
 *    - Generates unique RunIDs
 *    - Implements idempotency checks
 *    - Manages artifact lifecycle
 *
 * 3. storage - Artifact persistence layer
 *    - StorageAdapter interface
 *    - S3 implementation
 *    - Metadata tracking
 *
 * 4. scraper - Website content extraction
 *    - Firecrawl integration
 *    - Markdown conversion
 *    - Link extraction
 *
 * 5. enrichment - Person enrichment
 *    - LinkedIn profile extraction
 *    - Summary generation
 *    - Caching layer
 *
 * 6. synthesizer - LLM brief generation
 *    - Prompt templating
 *    - Claude integration
 *    - Structured output generation
 *
 * 7. validator - Output validation
 *    - Schema validation
 *    - Business rule enforcement
 *    - Quality checks
 *
 * 8. renderers - Output formatting
 *    - CRM format (structured fields)
 *    - Email format (HTML template)
 *    - Motion format (task list)
 *    - Markdown format (readable doc)
 *
 * 9. adapters - External system integrations
 *    - CRM adapter (HubSpot/Salesforce)
 *    - Email adapter (SendGrid/SES)
 *    - Motion adapter (API integration)
 */
