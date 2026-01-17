/**
 * Core type definitions for Deal Prep Level 2
 *
 * This module exports all shared types used across the system.
 */

/**
 * Unique identifier for a deal preparation run
 * Format: YYYYMMDD_HHMMSS_nanoid or run_<hash>
 */
export type RunId = string;

// ============================================================================
// Canonical LLM Output Schema (Implementation Spec Section 9)
// ============================================================================

/**
 * Meta information for the deal preparation brief
 * Per Implementation Spec Section 9.2
 */
export interface CanonicalBriefMeta {
  run_id: string;
  generated_at: string;
  trigger_source: 'inbound' | 'outbound';
  organization_name: string;
  organization_website: string;
  organization_domain: string;
  requester_name: string;
  requester_title: string;
  source_urls: string[];
}

/**
 * Executive summary section
 * Per Implementation Spec Section 9.2
 */
export interface ExecutiveSummary {
  summary: string;
  top_opportunities: [string, string, string];
}

/**
 * Program information
 */
export interface Program {
  name: string;
  summary: string;
}

/**
 * Organization understanding section
 * Per Implementation Spec Section 9.2
 */
export interface OrganizationUnderstanding {
  mission: string;
  programs: Program[];
  audiences: string[];
}

/**
 * Website analysis section
 * Per Implementation Spec Section 9.2
 */
export interface WebsiteAnalysis {
  overall_tone: string;
  strengths: string[];
  gaps: string[];
  volunteer_flow_observations: string;
  donation_flow_observations: string;
}

/**
 * Staff member reference
 */
export interface StaffMention {
  name: string;
  role: string;
}

/**
 * Executive leader profile
 */
export interface ExecutiveLeader {
  name: string;
  role: string;
  summary: string;
}

/**
 * Leadership and staff section
 * Per Implementation Spec Section 9.2
 */
export interface LeadershipAndStaff {
  executive_leader: ExecutiveLeader;
  other_staff_mentions: StaffMention[];
}

/**
 * Requester profile section
 * Per Implementation Spec Section 9.2
 */
export interface RequesterProfile {
  summary: string;
  conversation_angle: string;
}

/**
 * AI opportunity
 * Per Implementation Spec Section 9.2
 */
export interface AIOpportunity {
  title: string;
  why_it_matters: string;
  demonstration_hook: string;
}

/**
 * Demonstration plan section
 * Per Implementation Spec Section 9.2
 */
export interface DemonstrationPlan {
  opening: string;
  steps: string[];
  example_bot_responses: string[];
}

/**
 * Objection and rebuttal pair
 * Per Implementation Spec Section 9.2
 */
export interface ObjectionRebuttal {
  objection: string;
  rebuttal: string;
}

/**
 * Follow-up email content
 */
export interface FollowUpEmail {
  subject: string;
  body: string;
}

/**
 * Follow-up emails section
 * Per Implementation Spec Section 9.2
 */
export interface FollowUpEmails {
  short_version: FollowUpEmail;
  warm_version: FollowUpEmail;
}

/**
 * Canonical Deal Preparation Brief
 * This is the ONLY canonical artifact per Implementation Spec Section 10.1
 * All rendered formats are views derived from it.
 * Per Implementation Spec Section 9.2
 */
export interface CanonicalDealPrepBrief {
  meta: CanonicalBriefMeta;
  executive_summary: ExecutiveSummary;
  organization_understanding: OrganizationUnderstanding;
  website_analysis: WebsiteAnalysis;
  leadership_and_staff: LeadershipAndStaff;
  requester_profile: RequesterProfile;
  artificial_intelligence_opportunities: [AIOpportunity, AIOpportunity, AIOpportunity];
  demonstration_plan: DemonstrationPlan;
  objections_and_rebuttals: [ObjectionRebuttal, ObjectionRebuttal, ObjectionRebuttal];
  opening_script: string;
  follow_up_emails: FollowUpEmails;
}

// ============================================================================
// Renderer Output Types (Implementation Spec Section 10)
// ============================================================================

/**
 * CRM Note output format
 * Per Implementation Spec Section 10.2
 */
export interface CRMNoteOutput {
  markdown: string;
  runId: string;
  organizationName: string;
}

/**
 * Email output format
 * Per Implementation Spec Section 10.3
 */
export interface EmailOutput {
  subject: string;
  bodyPlain: string;
  bodyHtml: string;
}

/**
 * Motion task output format
 * Per Implementation Spec Section 10.4
 */
export interface MotionTaskOutput {
  title: string;
  body: string;
  dueDate: string | null;  // ISO-8601 or null
}

/**
 * Normalized input structure after canonicalization
 */
export interface NormalizedInput {
  runId: RunId;
  timestamp: string;
  prospect: {
    companyName: string;
    companyWebsite?: string;
    contactName?: string;
    contactLinkedIn?: string;
    contactEmail?: string;
  };
  context: {
    dealStage?: string;
    primaryPainPoint?: string;
    additionalNotes?: string;
  };
  metadata: Record<string, unknown>;
}

/**
 * Artifact metadata for storage tracking
 */
export interface ArtifactMetadata {
  runId: RunId;
  artifactType: 'input' | 'scraped' | 'enriched' | 'brief' | 'rendered';
  fileName: string;
  createdAt: string;
  contentType: string;
  size?: number;
  checksum?: string;
}

/**
 * Storage adapter interface for artifact persistence
 */
export interface StorageAdapter {
  save(runId: RunId, artifactType: string, content: string | Buffer, metadata?: Record<string, unknown>): Promise<ArtifactMetadata>;
  load(runId: RunId, artifactType: string): Promise<{ content: string | Buffer; metadata: ArtifactMetadata }>;
  exists(runId: RunId, artifactType: string): Promise<boolean>;
  list(runId: RunId): Promise<ArtifactMetadata[]>;
  delete(runId: RunId, artifactType?: string): Promise<void>;
}

/**
 * Scraped content from company website
 */
export interface ScrapedContent {
  url: string;
  title?: string;
  markdown: string;
  metadata: {
    scrapedAt: string;
    wordCount: number;
    links: string[];
    error?: string;
  };
}

/**
 * Enriched person data from LinkedIn
 */
export interface EnrichedPerson {
  name: string;
  linkedInUrl?: string;
  title?: string;
  company?: string;
  summary?: string;
  experience?: Array<{
    title: string;
    company: string;
    duration?: string;
  }>;
  metadata: {
    enrichedAt: string;
    source: 'linkedin' | 'manual' | 'cached';
    confidence?: number;
  };
}

/**
 * Generated deal preparation brief
 */
export interface DealPrepBrief {
  runId: RunId;
  prospect: {
    companyName: string;
    companyOverview?: string;
    industry?: string;
    size?: string;
    keyProducts?: string[];
  };
  contact?: {
    name: string;
    title?: string;
    background?: string;
    relevantExperience?: string[];
  };
  insights: {
    painPoints?: string[];
    opportunities?: string[];
    competitivePosition?: string;
    decisionMakingProcess?: string;
  };
  recommendations: {
    talkingPoints?: string[];
    questionsToAsk?: string[];
    objectionHandling?: string[];
    nextSteps?: string[];
  };
  sources: Array<{
    type: 'website' | 'linkedin' | 'manual';
    url?: string;
    description: string;
  }>;
  generatedAt: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Rendered output formats
 */
export interface RenderedOutput {
  format: 'crm' | 'email' | 'motion' | 'markdown';
  content: string;
  metadata: {
    renderedAt: string;
    templateVersion?: string;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Module result wrapper for n8n integration
 */
export interface ModuleResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    runId: RunId;
    module: string;
    timestamp: string;
    duration?: number;
  };
}
