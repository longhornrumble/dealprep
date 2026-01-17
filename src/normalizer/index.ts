/**
 * Normalizer Module
 *
 * Responsibilities per Implementation Spec Section 4:
 * - Accept partial payloads from inbound/outbound triggers
 * - Canonicalize to Implementation Spec Section 4.1 schema
 * - Apply validation rules from Section 4.2
 * - Apply canonicalization rules from Section 4.3
 *
 * Usage in n8n:
 * const { normalize } = await import('deal-prep-level-2/normalizer');
 * const result = normalize(rawInput);
 */

import { z } from 'zod';
import type { ModuleResult } from '../types/index.js';

/**
 * Trigger source types per Implementation Spec Section 4.1
 */
export type TriggerSource = 'inbound' | 'outbound';

/**
 * Canonical Input Schema per Implementation Spec Section 4.1
 */
export interface CanonicalInput {
  meta: {
    trigger_source: TriggerSource;
    submitted_at: string;
    run_id: string;
    requested_meeting_at: string | null;
    timezone: string | null;
  };
  organization: {
    name: string | null;
    website: string | null;
    domain: string | null;
  };
  contact: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
  };
  notes: {
    comments: string | null;
    intent_topic: string | null;
    source_context: string | null;
  };
  routing: {
    crm_target: string | null;
    email_to: string | null;
    email_cc: string[];
    motion_workspace: string | null;
  };
}

/**
 * Zod schema for raw input validation
 * Accepts partial data and validates minimum requirements
 */
const RawInputSchema = z.object({
  meta: z.object({
    trigger_source: z.enum(['inbound', 'outbound']),
    submitted_at: z.string().refine(
      (val) => !isNaN(Date.parse(val)),
      { message: 'submitted_at must be a valid ISO-8601 timestamp' }
    ),
    run_id: z.string().optional(),
    requested_meeting_at: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
  }),
  organization: z.object({
    name: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
  }).optional(),
  contact: z.object({
    full_name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
  }).optional(),
  notes: z.object({
    comments: z.string().nullable().optional(),
    intent_topic: z.string().nullable().optional(),
    source_context: z.string().nullable().optional(),
  }).optional(),
  routing: z.object({
    crm_target: z.string().nullable().optional(),
    email_to: z.string().nullable().optional(),
    email_cc: z.array(z.string()).optional(),
    motion_workspace: z.string().nullable().optional(),
  }).optional(),
});

export interface NormalizerConfig {
  strictValidation?: boolean;
  allowPartialData?: boolean;
  defaults?: Record<string, unknown>;
}

/**
 * Trim whitespace from string value
 * Per Implementation Spec Section 4.3: Trim leading and trailing whitespace from all string fields
 */
function trimString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize email to lowercase
 * Per Implementation Spec Section 4.3: Normalize email addresses to lowercase
 */
function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = trimString(email);
  return trimmed ? trimmed.toLowerCase() : null;
}

/**
 * Normalize URL by ensuring scheme presence and removing unsafe trailing slashes
 * Per Implementation Spec Section 4.3
 */
function normalizeUrl(url: string | null | undefined): string | null {
  const trimmed = trimString(url);
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed;

  // Ensure scheme presence - default to https
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = `https://${normalized}`;
  }

  // Remove trailing slash unless it's just the root path
  try {
    const urlObj = new URL(normalized);
    // Remove trailing slash from pathname unless it's the root
    if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return the normalized string as-is
    return normalized.replace(/\/+$/, '') || normalized;
  }
}

/**
 * Extract domain from URL
 * Per Implementation Spec Section 4.2: domain must be derived using standard domain parsing rules
 */
function extractDomain(url: string | null | undefined): string | null {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  try {
    const urlObj = new URL(normalizedUrl);
    // Return hostname without www. prefix
    return urlObj.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Parse contact name into first and last name
 * Per Implementation Spec Section 4.3: Attempt contact name parsing only when unambiguous
 */
function parseContactName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) {
    return { firstName: null, lastName: null };
  }

  const parts = fullName.trim().split(/\s+/);

  // Only parse if exactly two parts (unambiguous)
  if (parts.length === 2) {
    return {
      firstName: parts[0] ?? null,
      lastName: parts[1] ?? null,
    };
  }

  // Ambiguous - do not parse
  return { firstName: null, lastName: null };
}

/**
 * Validate that at least one of organization.name or organization.website is present
 * Per Implementation Spec Section 4.2
 */
function validateOrganizationRequirement(org: CanonicalInput['organization']): boolean {
  return org.name !== null || org.website !== null;
}

/**
 * Normalize raw input to canonical format
 * Per Implementation Spec Section 4
 *
 * @param rawInput - Raw input from webhook, API, or manual entry
 * @param config - Optional configuration for normalization behavior
 * @returns ModuleResult containing the canonicalized input or error details
 */
export function normalize(
  rawInput: unknown,
  _config?: NormalizerConfig
): ModuleResult<CanonicalInput> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Step 1: Parse and validate raw input structure
  const parseResult = RawInputSchema.safeParse(rawInput);

  if (!parseResult.success) {
    const errors = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: errors,
      },
      metadata: {
        runId: '',
        module: 'normalizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }

  const raw = parseResult.data;

  // Step 2: Apply canonicalization rules (Section 4.3)
  const organization = {
    name: trimString(raw.organization?.name),
    website: normalizeUrl(raw.organization?.website),
    domain: null as string | null,
  };

  // Derive domain from website if present (Section 4.2)
  if (organization.website) {
    organization.domain = extractDomain(organization.website);
  } else if (raw.organization?.domain) {
    organization.domain = trimString(raw.organization.domain)?.toLowerCase() ?? null;
  }

  // Step 3: Validate organization requirement (Section 4.2)
  if (!validateOrganizationRequirement(organization)) {
    return {
      success: false,
      error: {
        code: 'ORGANIZATION_REQUIRED',
        message: 'At least one of organization.name or organization.website must be present',
        details: { organization },
      },
      metadata: {
        runId: '',
        module: 'normalizer',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }

  // Step 4: Normalize contact information
  const fullName = trimString(raw.contact?.full_name);
  const { firstName: parsedFirstName, lastName: parsedLastName } = parseContactName(fullName);

  const contact = {
    full_name: fullName,
    first_name: trimString(raw.contact?.first_name) ?? parsedFirstName,
    last_name: trimString(raw.contact?.last_name) ?? parsedLastName,
    title: trimString(raw.contact?.title),
    email: normalizeEmail(raw.contact?.email),
    phone: trimString(raw.contact?.phone),
    linkedin_url: normalizeUrl(raw.contact?.linkedin_url),
  };

  // Step 5: Normalize notes
  const notes = {
    comments: trimString(raw.notes?.comments),
    intent_topic: trimString(raw.notes?.intent_topic),
    source_context: trimString(raw.notes?.source_context),
  };

  // Step 6: Normalize routing
  const routing = {
    crm_target: trimString(raw.routing?.crm_target),
    email_to: normalizeEmail(raw.routing?.email_to),
    email_cc: (raw.routing?.email_cc ?? [])
      .map((email) => normalizeEmail(email))
      .filter((email): email is string => email !== null),
    motion_workspace: trimString(raw.routing?.motion_workspace),
  };

  // Step 7: Validate requested_meeting_at if present
  let requestedMeetingAt: string | null = null;
  if (raw.meta.requested_meeting_at) {
    const meetingDate = new Date(raw.meta.requested_meeting_at);
    if (!isNaN(meetingDate.getTime())) {
      requestedMeetingAt = meetingDate.toISOString();
    }
  }

  // Step 8: Build canonical output
  const canonicalInput: CanonicalInput = {
    meta: {
      trigger_source: raw.meta.trigger_source,
      submitted_at: new Date(raw.meta.submitted_at).toISOString(),
      run_id: raw.meta.run_id ?? '', // Will be populated by run-manager
      requested_meeting_at: requestedMeetingAt,
      timezone: trimString(raw.meta.timezone),
    },
    organization,
    contact,
    notes,
    routing,
  };

  return {
    success: true,
    data: canonicalInput,
    metadata: {
      runId: canonicalInput.meta.run_id,
      module: 'normalizer',
      timestamp,
      duration: Date.now() - startTime,
    },
  };
}

/**
 * Validate canonical input against all requirements
 * Per Implementation Spec Section 4.2
 *
 * @param input - Canonical input to validate
 * @returns ModuleResult containing validation status and any errors
 */
export function validateInput(
  input: CanonicalInput
): ModuleResult<{ valid: boolean; errors: string[] }> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const errors: string[] = [];

  // Validate required fields per Section 4.2
  if (!input.meta.submitted_at) {
    errors.push('meta.submitted_at is required');
  }

  if (!input.meta.trigger_source) {
    errors.push('meta.trigger_source is required');
  }

  if (!validateOrganizationRequirement(input.organization)) {
    errors.push('At least one of organization.name or organization.website must be present');
  }

  // Validate email format if present
  if (input.contact.email && !input.contact.email.includes('@')) {
    errors.push('contact.email must be a valid email address');
  }

  // Validate timestamp formats
  if (input.meta.submitted_at && isNaN(Date.parse(input.meta.submitted_at))) {
    errors.push('meta.submitted_at must be a valid ISO-8601 timestamp');
  }

  if (input.meta.requested_meeting_at && isNaN(Date.parse(input.meta.requested_meeting_at))) {
    errors.push('meta.requested_meeting_at must be a valid ISO-8601 timestamp');
  }

  // Validate website domain derivation
  if (input.organization.website && !input.organization.domain) {
    errors.push('organization.domain must be derived when organization.website is present');
  }

  const valid = errors.length === 0;

  return {
    success: true,
    data: { valid, errors },
    metadata: {
      runId: input.meta.run_id,
      module: 'normalizer',
      timestamp,
      duration: Date.now() - startTime,
    },
  };
}

/**
 * Utility function to derive organization identifier for run ID generation
 * Per Implementation Spec Section 5.1
 *
 * Precedence:
 * 1. organization.domain
 * 2. parsed domain from organization.website
 * 3. normalized organization.name
 */
export function deriveOrganizationIdentifier(input: CanonicalInput): string | null {
  // First: organization.domain
  if (input.organization.domain) {
    return input.organization.domain.toLowerCase();
  }

  // Second: parsed domain from website
  if (input.organization.website) {
    const domain = extractDomain(input.organization.website);
    if (domain) {
      return domain.toLowerCase();
    }
  }

  // Third: normalized organization name
  if (input.organization.name) {
    return input.organization.name.toLowerCase().replace(/\s+/g, '_');
  }

  return null;
}

export { extractDomain, normalizeUrl, normalizeEmail, trimString };
