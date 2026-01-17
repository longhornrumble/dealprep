/**
 * Constraint Validator Module
 *
 * Validates Deal Preparation Briefs against hard constraints defined in
 * Implementation Spec Section 9.3.
 *
 * Hard Constraints (Non-Negotiable from Section 9.3):
 * 1. executive_summary.top_opportunities = exactly 3 items
 * 2. artificial_intelligence_opportunities = exactly 3 items
 * 3. objections_and_rebuttals = exactly 3 items
 * 4. executive_summary.summary <= 600 characters
 * 5. opening_script <= 450 characters
 * 6. demonstration_plan.steps <= 6 items
 * 7. follow_up_emails.short_version.body <= 120 words
 * 8. follow_up_emails.warm_version.body <= 180 words
 * 9. Missing information must be explicitly "Not found"
 *
 * Evidence Rules (Section 9.4):
 * - No facts may be invented
 * - All claims must be traceable to meta.source_urls
 * - Confidence must never be simulated
 */

// ============================================================================
// Type Definitions (Canonical Schema from Section 9.2)
// ============================================================================

/**
 * Canonical Deal Preparation Brief as defined in Section 9.2
 */
export interface CanonicalDealPrepBrief {
  meta: {
    run_id: string;
    generated_at: string;
    trigger_source: 'inbound' | 'outbound';
    organization_name: string; // "string | Not found"
    organization_website: string;
    organization_domain: string;
    requester_name: string;
    requester_title: string;
    source_urls: string[];
  };

  executive_summary: {
    summary: string;
    top_opportunities: [string, string, string]; // Exactly 3
  };

  organization_understanding: {
    mission: string;
    programs: Array<{
      name: string;
      summary: string;
    }>;
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
    executive_leader: {
      name: string;
      role: string;
      summary: string;
    };
    other_staff_mentions: Array<{
      name: string;
      role: string;
    }>;
  };

  requester_profile: {
    summary: string;
    conversation_angle: string;
  };

  artificial_intelligence_opportunities: [
    AIOpportunity,
    AIOpportunity,
    AIOpportunity
  ]; // Exactly 3

  demonstration_plan: {
    opening: string;
    steps: string[]; // Max 6
    example_bot_responses: string[];
  };

  objections_and_rebuttals: [
    ObjectionRebuttal,
    ObjectionRebuttal,
    ObjectionRebuttal
  ]; // Exactly 3

  opening_script: string; // Max 450 chars

  follow_up_emails: {
    short_version: {
      subject: string;
      body: string; // Max 120 words
    };
    warm_version: {
      subject: string;
      body: string; // Max 180 words
    };
  };
}

export interface AIOpportunity {
  title: string;
  why_it_matters: string;
  demonstration_hook: string;
}

export interface ObjectionRebuttal {
  objection: string;
  rebuttal: string;
}

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationError {
  field: string; // e.g., "executive_summary.summary"
  constraint: string; // e.g., "maxLength", "exactLength", "notFound", "urlFormat"
  message: string;
  actual: number | string;
  expected: number | string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ============================================================================
// Configuration
// ============================================================================

export interface ValidatorConfig {
  /** Skip source URL validation */
  skipSourceValidation?: boolean;
  /** Custom "not found" marker (default: "Not found") */
  notFoundMarker?: string;
}

const DEFAULT_CONFIG: Required<ValidatorConfig> = {
  skipSourceValidation: false,
  notFoundMarker: 'Not found',
};

// ============================================================================
// Constraint Constants (from Section 9.3)
// ============================================================================

export const CONSTRAINTS = {
  // Exact array lengths
  TOP_OPPORTUNITIES_COUNT: 3,
  AI_OPPORTUNITIES_COUNT: 3,
  OBJECTIONS_REBUTTALS_COUNT: 3,

  // Character limits
  EXECUTIVE_SUMMARY_MAX_CHARS: 600,
  OPENING_SCRIPT_MAX_CHARS: 450,

  // Item limits
  DEMONSTRATION_STEPS_MAX: 6,

  // Word limits
  SHORT_EMAIL_BODY_MAX_WORDS: 120,
  WARM_EMAIL_BODY_MAX_WORDS: 180,
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Count words in a string
 * Words are separated by whitespace
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  const trimmed = text.trim();
  if (trimmed === '') {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

/**
 * Safe property access using dot notation path
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Check if a value is a valid URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// Individual Validation Functions
// ============================================================================

/**
 * Validate array has exactly N items
 */
export function validateArrayLength(
  arr: unknown,
  expected: number,
  fieldPath: string
): ValidationError | null {
  if (!Array.isArray(arr)) {
    return {
      field: fieldPath,
      constraint: 'exactLength',
      message: `${fieldPath} must be an array with exactly ${expected} items`,
      actual: 'not an array',
      expected: expected,
    };
  }

  if (arr.length !== expected) {
    return {
      field: fieldPath,
      constraint: 'exactLength',
      message: `${fieldPath} must have exactly ${expected} items`,
      actual: arr.length,
      expected: expected,
    };
  }

  return null;
}

/**
 * Validate string is within character limit
 */
export function validateMaxLength(
  str: unknown,
  maxChars: number,
  fieldPath: string
): ValidationError | null {
  if (typeof str !== 'string') {
    return {
      field: fieldPath,
      constraint: 'maxLength',
      message: `${fieldPath} must be a string with at most ${maxChars} characters`,
      actual: 'not a string',
      expected: `<= ${maxChars} characters`,
    };
  }

  if (str.length > maxChars) {
    return {
      field: fieldPath,
      constraint: 'maxLength',
      message: `${fieldPath} exceeds maximum length of ${maxChars} characters`,
      actual: str.length,
      expected: `<= ${maxChars} characters`,
    };
  }

  return null;
}

/**
 * Validate string is within word limit
 */
export function validateMaxWords(
  str: unknown,
  maxWords: number,
  fieldPath: string
): ValidationError | null {
  if (typeof str !== 'string') {
    return {
      field: fieldPath,
      constraint: 'maxWords',
      message: `${fieldPath} must be a string with at most ${maxWords} words`,
      actual: 'not a string',
      expected: `<= ${maxWords} words`,
    };
  }

  const wordCount = countWords(str);
  if (wordCount > maxWords) {
    return {
      field: fieldPath,
      constraint: 'maxWords',
      message: `${fieldPath} exceeds maximum of ${maxWords} words`,
      actual: wordCount,
      expected: `<= ${maxWords} words`,
    };
  }

  return null;
}

/**
 * Validate array has at most N items
 */
export function validateMaxItems(
  arr: unknown,
  maxItems: number,
  fieldPath: string
): ValidationError | null {
  if (!Array.isArray(arr)) {
    return {
      field: fieldPath,
      constraint: 'maxItems',
      message: `${fieldPath} must be an array with at most ${maxItems} items`,
      actual: 'not an array',
      expected: `<= ${maxItems} items`,
    };
  }

  if (arr.length > maxItems) {
    return {
      field: fieldPath,
      constraint: 'maxItems',
      message: `${fieldPath} exceeds maximum of ${maxItems} items`,
      actual: arr.length,
      expected: `<= ${maxItems} items`,
    };
  }

  return null;
}

/**
 * Check fields that should use "Not found" when unavailable
 * Returns errors for empty strings, null values, or undefined that should be "Not found"
 */
export function validateNotFoundFields(
  brief: CanonicalDealPrepBrief,
  config: ValidatorConfig = {}
): ValidationError[] {
  const errors: ValidationError[] = [];
  const marker = config.notFoundMarker ?? DEFAULT_CONFIG.notFoundMarker;

  // Fields that should be "Not found" if unavailable (from Section 9.2)
  const notFoundFields = [
    'meta.organization_name',
    'meta.organization_website',
    'meta.organization_domain',
    'meta.requester_name',
    'meta.requester_title',
    'organization_understanding.mission',
    'website_analysis.overall_tone',
    'website_analysis.volunteer_flow_observations',
    'website_analysis.donation_flow_observations',
    'leadership_and_staff.executive_leader.name',
    'leadership_and_staff.executive_leader.role',
    'leadership_and_staff.executive_leader.summary',
    'requester_profile.summary',
    'requester_profile.conversation_angle',
  ];

  for (const fieldPath of notFoundFields) {
    const value = getNestedValue(brief, fieldPath);

    // Check for null, undefined, or empty string
    if (value === null || value === undefined || value === '') {
      errors.push({
        field: fieldPath,
        constraint: 'notFound',
        message: `${fieldPath} must be "${marker}" when information is unavailable, not empty or null`,
        actual: value === null ? 'null' : value === undefined ? 'undefined' : 'empty string',
        expected: marker,
      });
    }
  }

  return errors;
}

/**
 * Validate meta.source_urls is populated and contains valid URLs
 */
export function validateSourceUrls(
  brief: CanonicalDealPrepBrief
): ValidationError[] {
  const errors: ValidationError[] = [];
  const sourceUrls = brief.meta?.source_urls;

  // Check source_urls exists and is an array
  if (!sourceUrls) {
    errors.push({
      field: 'meta.source_urls',
      constraint: 'required',
      message: 'meta.source_urls is required for evidence traceability',
      actual: 'undefined',
      expected: 'array of URLs',
    });
    return errors;
  }

  if (!Array.isArray(sourceUrls)) {
    errors.push({
      field: 'meta.source_urls',
      constraint: 'type',
      message: 'meta.source_urls must be an array',
      actual: typeof sourceUrls,
      expected: 'array',
    });
    return errors;
  }

  // Check that there is at least one source URL
  if (sourceUrls.length === 0) {
    errors.push({
      field: 'meta.source_urls',
      constraint: 'minItems',
      message: 'meta.source_urls must contain at least one URL for evidence traceability',
      actual: 0,
      expected: '>= 1 URL',
    });
    return errors;
  }

  // Validate each URL format
  for (let i = 0; i < sourceUrls.length; i++) {
    const url = sourceUrls[i];
    if (typeof url !== 'string') {
      errors.push({
        field: `meta.source_urls[${i}]`,
        constraint: 'type',
        message: `meta.source_urls[${i}] must be a string`,
        actual: typeof url,
        expected: 'string',
      });
      continue;
    }

    if (!isValidUrl(url)) {
      errors.push({
        field: `meta.source_urls[${i}]`,
        constraint: 'urlFormat',
        message: `meta.source_urls[${i}] is not a valid URL`,
        actual: url,
        expected: 'valid http or https URL',
      });
    }
  }

  return errors;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a Deal Preparation Brief against all hard constraints from Section 9.3
 *
 * @param brief - The canonical deal prep brief to validate
 * @param config - Optional validation configuration
 * @returns ValidationResult with valid flag and list of errors
 */
export function validateBrief(
  brief: CanonicalDealPrepBrief,
  config: ValidatorConfig = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Validate brief exists
  if (!brief || typeof brief !== 'object') {
    return {
      valid: false,
      errors: [
        {
          field: 'brief',
          constraint: 'required',
          message: 'Brief must be a valid object',
          actual: brief === null ? 'null' : typeof brief,
          expected: 'object',
        },
      ],
    };
  }

  // =========================================================================
  // Hard Constraints from Section 9.3
  // =========================================================================

  // 1. executive_summary.top_opportunities = exactly 3 items
  const topOppsError = validateArrayLength(
    brief.executive_summary?.top_opportunities,
    CONSTRAINTS.TOP_OPPORTUNITIES_COUNT,
    'executive_summary.top_opportunities'
  );
  if (topOppsError) errors.push(topOppsError);

  // 2. artificial_intelligence_opportunities = exactly 3 items
  const aiOppsError = validateArrayLength(
    brief.artificial_intelligence_opportunities,
    CONSTRAINTS.AI_OPPORTUNITIES_COUNT,
    'artificial_intelligence_opportunities'
  );
  if (aiOppsError) errors.push(aiOppsError);

  // 3. objections_and_rebuttals = exactly 3 items
  const objectionsError = validateArrayLength(
    brief.objections_and_rebuttals,
    CONSTRAINTS.OBJECTIONS_REBUTTALS_COUNT,
    'objections_and_rebuttals'
  );
  if (objectionsError) errors.push(objectionsError);

  // 4. executive_summary.summary <= 600 characters
  const summaryError = validateMaxLength(
    brief.executive_summary?.summary,
    CONSTRAINTS.EXECUTIVE_SUMMARY_MAX_CHARS,
    'executive_summary.summary'
  );
  if (summaryError) errors.push(summaryError);

  // 5. opening_script <= 450 characters
  const scriptError = validateMaxLength(
    brief.opening_script,
    CONSTRAINTS.OPENING_SCRIPT_MAX_CHARS,
    'opening_script'
  );
  if (scriptError) errors.push(scriptError);

  // 6. demonstration_plan.steps <= 6 items
  const stepsError = validateMaxItems(
    brief.demonstration_plan?.steps,
    CONSTRAINTS.DEMONSTRATION_STEPS_MAX,
    'demonstration_plan.steps'
  );
  if (stepsError) errors.push(stepsError);

  // 7. follow_up_emails.short_version.body <= 120 words
  const shortEmailError = validateMaxWords(
    brief.follow_up_emails?.short_version?.body,
    CONSTRAINTS.SHORT_EMAIL_BODY_MAX_WORDS,
    'follow_up_emails.short_version.body'
  );
  if (shortEmailError) errors.push(shortEmailError);

  // 8. follow_up_emails.warm_version.body <= 180 words
  const warmEmailError = validateMaxWords(
    brief.follow_up_emails?.warm_version?.body,
    CONSTRAINTS.WARM_EMAIL_BODY_MAX_WORDS,
    'follow_up_emails.warm_version.body'
  );
  if (warmEmailError) errors.push(warmEmailError);

  // 9. Missing information must be explicitly "Not found"
  const notFoundErrors = validateNotFoundFields(brief, mergedConfig);
  errors.push(...notFoundErrors);

  // =========================================================================
  // Evidence Rules from Section 9.4
  // =========================================================================

  if (!mergedConfig.skipSourceValidation) {
    const sourceErrors = validateSourceUrls(brief);
    errors.push(...sourceErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Legacy exports for backwards compatibility with existing module structure
// ============================================================================

import type { DealPrepBrief, ModuleResult } from '../types/index.js';

export interface ValidationConfig {
  strictMode?: boolean;
  enforceMinimumFields?: boolean;
  customRules?: ValidationRule[];
}

export interface ValidationRule {
  name: string;
  field: string;
  validator: (value: unknown, context: unknown) => boolean;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Legacy validation result type for backwards compatibility
 */
export interface LegacyValidationResult {
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
 * Validate legacy DealPrepBrief format
 * This is a simplified validator for the non-canonical brief format
 */
export function validateLegacyBrief(
  brief: DealPrepBrief,
  _config?: ValidationConfig
): ModuleResult<LegacyValidationResult> {
  const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  // Basic required field checks
  if (!brief.runId) {
    errors.push({ field: 'runId', message: 'runId is required', severity: 'error' });
  }
  if (!brief.prospect?.companyName) {
    errors.push({ field: 'prospect.companyName', message: 'Company name is required', severity: 'error' });
  }
  if (!brief.generatedAt) {
    errors.push({ field: 'generatedAt', message: 'generatedAt is required', severity: 'error' });
  }
  if (!brief.sources || brief.sources.length === 0) {
    warnings.push({ field: 'sources', message: 'No sources provided' });
  }

  return {
    success: true,
    data: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    metadata: {
      runId: brief.runId || 'unknown',
      module: 'validator',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Validate normalized input
 */
export function validateInput(
  input: unknown,
  _config?: ValidationConfig
): ModuleResult<LegacyValidationResult> {
  const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Input must be an object',
      },
      metadata: {
        runId: 'unknown',
        module: 'validator',
        timestamp: new Date().toISOString(),
      },
    };
  }

  const obj = input as Record<string, unknown>;

  if (!obj.runId) {
    errors.push({ field: 'runId', message: 'runId is required', severity: 'error' });
  }

  return {
    success: true,
    data: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    metadata: {
      runId: (obj.runId as string) || 'unknown',
      module: 'validator',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Check for required fields in brief
 */
export function checkRequiredFields(
  brief: DealPrepBrief
): ModuleResult<{ missing: string[]; present: string[] }> {
  const requiredFields = [
    'runId',
    'prospect',
    'prospect.companyName',
    'insights',
    'recommendations',
    'sources',
    'generatedAt',
    'confidence',
  ];

  const missing: string[] = [];
  const present: string[] = [];

  for (const field of requiredFields) {
    const value = getNestedValue(brief, field);
    if (value === undefined || value === null) {
      missing.push(field);
    } else {
      present.push(field);
    }
  }

  return {
    success: true,
    data: { missing, present },
    metadata: {
      runId: brief.runId || 'unknown',
      module: 'validator',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Quality checks for generated content
 */
export function checkContentQuality(
  brief: DealPrepBrief
): ModuleResult<{
  score: number;
  issues: Array<{ field: string; issue: string; severity: 'error' | 'warning' }>;
}> {
  const issues: Array<{ field: string; issue: string; severity: 'error' | 'warning' }> = [];
  let score = 100;

  // Check company overview length
  if (brief.prospect?.companyOverview) {
    const overviewLength = brief.prospect.companyOverview.length;
    if (overviewLength < 50) {
      issues.push({
        field: 'prospect.companyOverview',
        issue: 'Company overview is too short',
        severity: 'warning',
      });
      score -= 10;
    }
  } else {
    issues.push({
      field: 'prospect.companyOverview',
      issue: 'Missing company overview',
      severity: 'warning',
    });
    score -= 15;
  }

  // Check for pain points
  if (!brief.insights?.painPoints || brief.insights.painPoints.length === 0) {
    issues.push({
      field: 'insights.painPoints',
      issue: 'No pain points identified',
      severity: 'warning',
    });
    score -= 10;
  }

  // Check for opportunities
  if (!brief.insights?.opportunities || brief.insights.opportunities.length === 0) {
    issues.push({
      field: 'insights.opportunities',
      issue: 'No opportunities identified',
      severity: 'warning',
    });
    score -= 10;
  }

  // Check for source citations
  if (!brief.sources || brief.sources.length === 0) {
    issues.push({
      field: 'sources',
      issue: 'No sources provided - evidence traceability compromised',
      severity: 'error',
    });
    score -= 25;
  }

  // Ensure score doesn't go negative
  score = Math.max(0, score);

  return {
    success: true,
    data: { score, issues },
    metadata: {
      runId: brief.runId || 'unknown',
      module: 'validator',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Validate against custom business rules
 */
export function applyCustomRules(
  data: unknown,
  rules: ValidationRule[]
): ModuleResult<LegacyValidationResult> {
  const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  for (const rule of rules) {
    const value = getNestedValue(data, rule.field);
    const isValid = rule.validator(value, data);

    if (!isValid) {
      if (rule.severity === 'error') {
        errors.push({
          field: rule.field,
          message: rule.message,
          severity: 'error',
        });
      } else {
        warnings.push({
          field: rule.field,
          message: rule.message,
        });
      }
    }
  }

  return {
    success: true,
    data: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    metadata: {
      runId: 'custom-validation',
      module: 'validator',
      timestamp: new Date().toISOString(),
    },
  };
}
