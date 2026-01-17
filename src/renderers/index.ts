/**
 * Renderers Module
 *
 * Per Implementation Spec Section 10: Rendering Specifications
 *
 * The structured JSON brief is the ONLY canonical artifact.
 * All rendered formats are views derived from it.
 *
 * Responsibilities:
 * - CRM Rendering (Section 10.2): Full brief as formatted Markdown
 * - Email Rendering (Section 10.3): Executive summary + top 3 opportunities + brief link
 * - Motion Task Rendering (Section 10.4): Task with due date calculation
 *
 * Usage in n8n:
 * const { renderCRMNote, renderEmail, renderMotionTask } = await import('deal-prep-level-2/renderers');
 */

import type {
  CanonicalDealPrepBrief,
  CRMNoteOutput,
  EmailOutput,
  MotionTaskOutput,
} from '../types/index.js';
import type { CanonicalInput } from '../normalizer/index.js';

// ============================================================================
// Logging and Observability
// ============================================================================

interface RenderMetrics {
  renderer: string;
  runId: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  outputSize?: number;
  success: boolean;
  error?: string;
}

/**
 * Log renderer metrics for observability
 */
function logMetrics(metrics: RenderMetrics): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: metrics.success ? 'info' : 'error',
    module: 'renderers',
    ...metrics,
    durationMs: metrics.endTime ? metrics.endTime - metrics.startTime : undefined,
  };
  // Structured logging for n8n and external observability systems
  console.log(JSON.stringify(logEntry));
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate that the brief has required fields for rendering
 */
function validateBrief(brief: unknown): brief is CanonicalDealPrepBrief {
  if (!brief || typeof brief !== 'object') {
    return false;
  }

  const b = brief as Record<string, unknown>;

  // Check required top-level sections
  const requiredSections = [
    'meta',
    'executive_summary',
    'organization_understanding',
    'website_analysis',
    'leadership_and_staff',
    'requester_profile',
    'artificial_intelligence_opportunities',
    'demonstration_plan',
    'objections_and_rebuttals',
    'opening_script',
    'follow_up_emails',
  ];

  for (const section of requiredSections) {
    if (!(section in b)) {
      return false;
    }
  }

  // Validate meta section
  const meta = b.meta as Record<string, unknown>;
  if (!meta.run_id || !meta.organization_name) {
    return false;
  }

  // Validate executive summary has required fields
  const execSummary = b.executive_summary as Record<string, unknown>;
  if (!execSummary.summary || !Array.isArray(execSummary.top_opportunities)) {
    return false;
  }

  return true;
}

// ============================================================================
// CRM Note Renderer (Section 10.2)
// ============================================================================

/**
 * Render full brief as formatted Markdown for CRM attachment
 *
 * Per Implementation Spec Section 10.2:
 * - Render full brief as formatted Markdown
 * - Preserve section hierarchy
 * - Include headings matching schema sections
 * - Link the run identifier in the CRM record
 *
 * @param brief - The canonical deal preparation brief
 * @returns CRM note output with markdown content
 * @throws Error if brief validation fails
 */
export function renderCRMNote(brief: CanonicalDealPrepBrief): CRMNoteOutput {
  const startTime = Date.now();

  // Early null/undefined check before accessing properties
  if (!brief || typeof brief !== 'object') {
    const metrics: RenderMetrics = {
      renderer: 'renderCRMNote',
      runId: 'unknown',
      startTime,
      endTime: Date.now(),
      success: false,
      error: 'Invalid brief: missing required fields',
    };
    logMetrics(metrics);
    throw new Error('Invalid brief: missing required fields');
  }

  const runId = brief.meta?.run_id || 'unknown';
  const metrics: RenderMetrics = {
    renderer: 'renderCRMNote',
    runId,
    startTime,
    success: false,
  };

  try {
    if (!validateBrief(brief)) {
      throw new Error('Invalid brief: missing required fields');
    }

    const markdown = buildCRMMarkdown(brief);

    metrics.success = true;
    metrics.endTime = Date.now();
    metrics.outputSize = markdown.length;
    logMetrics(metrics);

    return {
      markdown,
      runId: brief.meta.run_id,
      organizationName: brief.meta.organization_name,
    };
  } catch (error) {
    metrics.endTime = Date.now();
    metrics.error = error instanceof Error ? error.message : String(error);
    logMetrics(metrics);
    throw error;
  }
}

/**
 * Build the full Markdown document for CRM
 */
function buildCRMMarkdown(brief: CanonicalDealPrepBrief): string {
  const lines: string[] = [];

  // Header with run reference
  lines.push(`# Deal Preparation Brief: ${brief.meta.organization_name}`);
  lines.push('');
  lines.push(`**Run ID:** \`${brief.meta.run_id}\``);
  lines.push(`**Generated:** ${formatDateTime(brief.meta.generated_at)}`);
  lines.push(`**Trigger Source:** ${brief.meta.trigger_source}`);
  lines.push('');

  // Meta information
  lines.push('## Organization Information');
  lines.push('');
  lines.push(`- **Name:** ${brief.meta.organization_name}`);
  lines.push(`- **Website:** ${brief.meta.organization_website}`);
  lines.push(`- **Domain:** ${brief.meta.organization_domain}`);
  lines.push(`- **Requester:** ${brief.meta.requester_name}`);
  lines.push(`- **Requester Title:** ${brief.meta.requester_title}`);
  lines.push('');

  // Source URLs
  if (brief.meta.source_urls.length > 0) {
    lines.push('### Source URLs');
    lines.push('');
    for (const url of brief.meta.source_urls) {
      lines.push(`- ${url}`);
    }
    lines.push('');
  }

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(brief.executive_summary.summary);
  lines.push('');
  lines.push('### Top Opportunities');
  lines.push('');
  for (let i = 0; i < brief.executive_summary.top_opportunities.length; i++) {
    lines.push(`${i + 1}. ${brief.executive_summary.top_opportunities[i]}`);
  }
  lines.push('');

  // Organization Understanding
  lines.push('## Organization Understanding');
  lines.push('');
  lines.push('### Mission');
  lines.push('');
  lines.push(brief.organization_understanding.mission);
  lines.push('');

  if (brief.organization_understanding.programs.length > 0) {
    lines.push('### Programs');
    lines.push('');
    for (const program of brief.organization_understanding.programs) {
      lines.push(`**${program.name}**`);
      lines.push('');
      lines.push(program.summary);
      lines.push('');
    }
  }

  if (brief.organization_understanding.audiences.length > 0) {
    lines.push('### Target Audiences');
    lines.push('');
    for (const audience of brief.organization_understanding.audiences) {
      lines.push(`- ${audience}`);
    }
    lines.push('');
  }

  // Website Analysis
  lines.push('## Website Analysis');
  lines.push('');
  lines.push(`**Overall Tone:** ${brief.website_analysis.overall_tone}`);
  lines.push('');

  if (brief.website_analysis.strengths.length > 0) {
    lines.push('### Strengths');
    lines.push('');
    for (const strength of brief.website_analysis.strengths) {
      lines.push(`- ${strength}`);
    }
    lines.push('');
  }

  if (brief.website_analysis.gaps.length > 0) {
    lines.push('### Gaps');
    lines.push('');
    for (const gap of brief.website_analysis.gaps) {
      lines.push(`- ${gap}`);
    }
    lines.push('');
  }

  lines.push('### Volunteer Flow Observations');
  lines.push('');
  lines.push(brief.website_analysis.volunteer_flow_observations);
  lines.push('');

  lines.push('### Donation Flow Observations');
  lines.push('');
  lines.push(brief.website_analysis.donation_flow_observations);
  lines.push('');

  // Leadership and Staff
  lines.push('## Leadership and Staff');
  lines.push('');
  lines.push('### Executive Leader');
  lines.push('');
  lines.push(`**${brief.leadership_and_staff.executive_leader.name}** - ${brief.leadership_and_staff.executive_leader.role}`);
  lines.push('');
  lines.push(brief.leadership_and_staff.executive_leader.summary);
  lines.push('');

  if (brief.leadership_and_staff.other_staff_mentions.length > 0) {
    lines.push('### Other Staff');
    lines.push('');
    for (const staff of brief.leadership_and_staff.other_staff_mentions) {
      lines.push(`- **${staff.name}** - ${staff.role}`);
    }
    lines.push('');
  }

  // Requester Profile
  lines.push('## Requester Profile');
  lines.push('');
  lines.push(brief.requester_profile.summary);
  lines.push('');
  lines.push('### Conversation Angle');
  lines.push('');
  lines.push(brief.requester_profile.conversation_angle);
  lines.push('');

  // AI Opportunities
  lines.push('## AI Opportunities');
  lines.push('');
  brief.artificial_intelligence_opportunities.forEach((opp, i) => {
    lines.push(`### ${i + 1}. ${opp.title}`);
    lines.push('');
    lines.push(`**Why It Matters:** ${opp.why_it_matters}`);
    lines.push('');
    lines.push(`**Demonstration Hook:** ${opp.demonstration_hook}`);
    lines.push('');
  });

  // Demonstration Plan
  lines.push('## Demonstration Plan');
  lines.push('');
  lines.push('### Opening');
  lines.push('');
  lines.push(brief.demonstration_plan.opening);
  lines.push('');

  if (brief.demonstration_plan.steps.length > 0) {
    lines.push('### Steps');
    lines.push('');
    for (let i = 0; i < brief.demonstration_plan.steps.length; i++) {
      lines.push(`${i + 1}. ${brief.demonstration_plan.steps[i]}`);
    }
    lines.push('');
  }

  if (brief.demonstration_plan.example_bot_responses.length > 0) {
    lines.push('### Example Bot Responses');
    lines.push('');
    for (const response of brief.demonstration_plan.example_bot_responses) {
      lines.push(`> ${response}`);
      lines.push('');
    }
  }

  // Objections and Rebuttals
  lines.push('## Objections and Rebuttals');
  lines.push('');
  brief.objections_and_rebuttals.forEach((obj, i) => {
    lines.push(`### ${i + 1}. "${obj.objection}"`);
    lines.push('');
    lines.push(`**Rebuttal:** ${obj.rebuttal}`);
    lines.push('');
  });

  // Opening Script
  lines.push('## Opening Script');
  lines.push('');
  lines.push(`> ${brief.opening_script}`);
  lines.push('');

  // Follow-up Emails
  lines.push('## Follow-up Emails');
  lines.push('');
  lines.push('### Short Version');
  lines.push('');
  lines.push(`**Subject:** ${brief.follow_up_emails.short_version.subject}`);
  lines.push('');
  lines.push(brief.follow_up_emails.short_version.body);
  lines.push('');

  lines.push('### Warm Version');
  lines.push('');
  lines.push(`**Subject:** ${brief.follow_up_emails.warm_version.subject}`);
  lines.push('');
  lines.push(brief.follow_up_emails.warm_version.body);
  lines.push('');

  // Footer with run reference
  lines.push('---');
  lines.push('');
  lines.push(`*Run ID: ${brief.meta.run_id}*`);

  return lines.join('\n');
}

// ============================================================================
// Email Renderer (Section 10.3)
// ============================================================================

/**
 * Render email notification with executive summary and top opportunities
 *
 * Per Implementation Spec Section 10.3:
 * - Email must contain: executive summary, top three opportunities, link to full brief
 * - Email must NEVER include the full brief inline
 * - Email must be skimmable in under one minute
 *
 * @param brief - The canonical deal preparation brief
 * @param briefUrl - Optional URL to the full brief (CRM link or artifact URL)
 * @returns Email output with subject, plain text body, and HTML body
 * @throws Error if brief validation fails
 */
export function renderEmail(brief: CanonicalDealPrepBrief, briefUrl?: string): EmailOutput {
  const startTime = Date.now();

  // Early null/undefined check before accessing properties
  if (!brief || typeof brief !== 'object') {
    const metrics: RenderMetrics = {
      renderer: 'renderEmail',
      runId: 'unknown',
      startTime,
      endTime: Date.now(),
      success: false,
      error: 'Invalid brief: missing required fields',
    };
    logMetrics(metrics);
    throw new Error('Invalid brief: missing required fields');
  }

  const runId = brief.meta?.run_id || 'unknown';
  const metrics: RenderMetrics = {
    renderer: 'renderEmail',
    runId,
    startTime,
    success: false,
  };

  try {
    if (!validateBrief(brief)) {
      throw new Error('Invalid brief: missing required fields');
    }

    const subject = `Deal Prep Ready: ${brief.meta.organization_name}`;
    const bodyPlain = buildEmailPlainText(brief, briefUrl);
    const bodyHtml = buildEmailHtml(brief, briefUrl);

    metrics.success = true;
    metrics.endTime = Date.now();
    metrics.outputSize = bodyPlain.length + bodyHtml.length;
    logMetrics(metrics);

    return {
      subject,
      bodyPlain,
      bodyHtml,
    };
  } catch (error) {
    metrics.endTime = Date.now();
    metrics.error = error instanceof Error ? error.message : String(error);
    logMetrics(metrics);
    throw error;
  }
}

/**
 * Build plain text email body
 * Kept concise for skimming in under one minute (~200 words max)
 */
function buildEmailPlainText(brief: CanonicalDealPrepBrief, briefUrl?: string): string {
  const lines: string[] = [];

  lines.push(`Deal Prep Brief Ready: ${brief.meta.organization_name}`);
  lines.push('');
  lines.push('EXECUTIVE SUMMARY');
  lines.push('-'.repeat(40));
  lines.push('');
  lines.push(brief.executive_summary.summary);
  lines.push('');
  lines.push('TOP 3 OPPORTUNITIES');
  lines.push('-'.repeat(40));
  lines.push('');

  for (let i = 0; i < brief.executive_summary.top_opportunities.length; i++) {
    lines.push(`${i + 1}. ${brief.executive_summary.top_opportunities[i]}`);
    lines.push('');
  }

  if (briefUrl) {
    lines.push('VIEW FULL BRIEF');
    lines.push('-'.repeat(40));
    lines.push('');
    lines.push(briefUrl);
    lines.push('');
  } else {
    lines.push(`Reference: ${brief.meta.run_id}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('This is an automated deal preparation notification.');

  return lines.join('\n');
}

/**
 * Build HTML email body
 * Styled for readability and quick scanning
 */
function buildEmailHtml(brief: CanonicalDealPrepBrief, briefUrl?: string): string {
  const opportunitiesHtml = brief.executive_summary.top_opportunities
    .map((opp, i) => `<li><strong>${i + 1}.</strong> ${escapeHtml(opp)}</li>`)
    .join('\n        ');

  const briefReference = briefUrl
    ? `<p><a href="${sanitizeUrl(briefUrl)}" style="color: #2563eb; text-decoration: underline;">View Full Brief</a></p>`
    : `<p><small>Reference: ${escapeHtml(brief.meta.run_id)}</small></p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deal Prep: ${escapeHtml(brief.meta.organization_name)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 20px;">
    <h1 style="color: #111827; font-size: 20px; margin: 0 0 16px 0;">
      Deal Prep Ready: ${escapeHtml(brief.meta.organization_name)}
    </h1>

    <h2 style="color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px 0;">
      Executive Summary
    </h2>
    <p style="margin: 0 0 20px 0;">
      ${escapeHtml(brief.executive_summary.summary)}
    </p>

    <h2 style="color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px 0;">
      Top 3 Opportunities
    </h2>
    <ol style="margin: 0 0 20px 0; padding-left: 20px;">
        ${opportunitiesHtml}
    </ol>

    ${briefReference}
  </div>

  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
    This is an automated deal preparation notification.
  </p>
</body>
</html>`;
}

// ============================================================================
// Motion Task Renderer (Section 10.4)
// ============================================================================

/**
 * Render Motion task for deal preparation review
 *
 * Per Implementation Spec Section 10.4:
 * - Task title: "Deal Prep - {Organization Name}"
 * - Task body must include: top three opportunities, link to full brief
 * - If meeting time is known: due 2 hours before meeting
 * - If meeting time unknown: create without due date
 *
 * @param brief - The canonical deal preparation brief
 * @param input - The canonical input containing meeting time information
 * @param briefUrl - Optional URL to the full brief
 * @returns Motion task output with title, body, and optional due date
 * @throws Error if brief validation fails
 */
export function renderMotionTask(
  brief: CanonicalDealPrepBrief,
  input: CanonicalInput,
  briefUrl?: string
): MotionTaskOutput {
  const startTime = Date.now();

  // Early null/undefined check before accessing properties
  if (!brief || typeof brief !== 'object') {
    const metrics: RenderMetrics = {
      renderer: 'renderMotionTask',
      runId: 'unknown',
      startTime,
      endTime: Date.now(),
      success: false,
      error: 'Invalid brief: missing required fields',
    };
    logMetrics(metrics);
    throw new Error('Invalid brief: missing required fields');
  }

  const runId = brief.meta?.run_id || 'unknown';
  const metrics: RenderMetrics = {
    renderer: 'renderMotionTask',
    runId,
    startTime,
    success: false,
  };

  try {
    if (!validateBrief(brief)) {
      throw new Error('Invalid brief: missing required fields');
    }

    const title = `Deal Prep - ${brief.meta.organization_name}`;
    const body = buildMotionTaskBody(brief, briefUrl);
    const dueDate = calculateMotionDueDate(input);

    metrics.success = true;
    metrics.endTime = Date.now();
    metrics.outputSize = body.length;
    logMetrics(metrics);

    return {
      title,
      body,
      dueDate,
    };
  } catch (error) {
    metrics.endTime = Date.now();
    metrics.error = error instanceof Error ? error.message : String(error);
    logMetrics(metrics);
    throw error;
  }
}

/**
 * Build Motion task body with top 3 opportunities and brief link
 */
function buildMotionTaskBody(brief: CanonicalDealPrepBrief, briefUrl?: string): string {
  const lines: string[] = [];

  lines.push('Review deal preparation brief before meeting.');
  lines.push('');
  lines.push('TOP 3 OPPORTUNITIES:');
  lines.push('');

  for (let i = 0; i < brief.executive_summary.top_opportunities.length; i++) {
    lines.push(`${i + 1}. ${brief.executive_summary.top_opportunities[i]}`);
  }
  lines.push('');

  if (briefUrl) {
    lines.push(`Full Brief: ${briefUrl}`);
  } else {
    lines.push(`Reference: ${brief.meta.run_id}`);
  }

  return lines.join('\n');
}

/**
 * Calculate Motion task due date
 * Per Section 10.4: 2 hours before meeting if known, otherwise null
 */
function calculateMotionDueDate(input: CanonicalInput): string | null {
  const meetingTime = input.meta?.requested_meeting_at;

  if (!meetingTime) {
    return null;
  }

  try {
    const meetingDate = new Date(meetingTime);

    // Validate the date is valid
    if (isNaN(meetingDate.getTime())) {
      return null;
    }

    // Subtract 2 hours (2 * 60 * 60 * 1000 = 7200000 ms)
    const dueDate = new Date(meetingDate.getTime() - 2 * 60 * 60 * 1000);

    return dueDate.toISOString();
  } catch {
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format ISO date string for display
 */
function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return isoString;
  }
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char] || char);
}

/**
 * Sanitize URL for safe inclusion in href attributes
 * Validates URL scheme and removes dangerous characters
 */
function sanitizeUrl(url: string): string {
  // First escape HTML special characters
  const escaped = escapeHtml(url);

  // Also encode characters that could break out of attributes
  // This handles cases like: https://evil.com" onclick="alert(1)
  // The quote is already escaped to &quot; by escapeHtml
  // But we also need to handle other potential injection vectors

  // Validate URL has safe scheme
  const normalizedUrl = escaped.toLowerCase();
  if (
    !normalizedUrl.startsWith('https://') &&
    !normalizedUrl.startsWith('http://') &&
    !normalizedUrl.startsWith('mailto:')
  ) {
    // For safety, prepend https:// if no valid scheme
    if (!normalizedUrl.includes('://')) {
      return 'https://' + escaped;
    }
    // Invalid scheme - return safe placeholder
    return '#invalid-url';
  }

  return escaped;
}

// ============================================================================
// Legacy Renderer Functions (Preserved for Backwards Compatibility)
// ============================================================================

import type { DealPrepBrief, RenderedOutput, ModuleResult } from '../types/index.js';

export interface RenderConfig {
  templateVersion?: string;
  customFields?: Record<string, unknown>;
  includeSources?: boolean;
  includeMetadata?: boolean;
}

/**
 * @deprecated Use renderCRMNote instead
 * Render brief for CRM system (HubSpot/Salesforce)
 */
export function renderForCRM(
  brief: DealPrepBrief,
  config?: RenderConfig
): ModuleResult<RenderedOutput> {
  const timestamp = new Date().toISOString();
  try {
    const markdown = buildLegacyCRMMarkdown(brief, config);
    return {
      success: true,
      data: {
        format: 'crm',
        content: markdown,
        metadata: {
          renderedAt: timestamp,
          templateVersion: config?.templateVersion || '1.0.0',
        },
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RENDER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  }
}

/**
 * @deprecated Use renderEmail instead
 * Render brief as HTML email
 */
export function renderForEmail(
  brief: DealPrepBrief,
  config?: RenderConfig & { recipientName?: string }
): ModuleResult<RenderedOutput> {
  const timestamp = new Date().toISOString();
  try {
    const html = buildLegacyEmailHtml(brief, config);
    return {
      success: true,
      data: {
        format: 'email',
        content: html,
        metadata: {
          renderedAt: timestamp,
          templateVersion: config?.templateVersion || '1.0.0',
        },
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RENDER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  }
}

/**
 * @deprecated Use renderMotionTask instead
 * Render brief for Motion task manager
 */
export function renderForMotion(
  brief: DealPrepBrief,
  config?: RenderConfig & { dueDate?: string; assignee?: string }
): ModuleResult<RenderedOutput> {
  const timestamp = new Date().toISOString();
  try {
    const taskContent = buildLegacyMotionTask(brief, config);
    return {
      success: true,
      data: {
        format: 'motion',
        content: taskContent,
        metadata: {
          renderedAt: timestamp,
          templateVersion: config?.templateVersion || '1.0.0',
        },
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RENDER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  }
}

/**
 * @deprecated Use renderCRMNote instead
 * Render brief as Markdown document
 */
export function renderAsMarkdown(
  brief: DealPrepBrief,
  config?: RenderConfig
): ModuleResult<RenderedOutput> {
  return renderForCRM(brief, config);
}

/**
 * @deprecated Use renderEmail with bodyPlain instead
 * Render brief as plain text
 */
export function renderAsPlainText(
  brief: DealPrepBrief,
  config?: RenderConfig
): ModuleResult<RenderedOutput> {
  const timestamp = new Date().toISOString();
  try {
    const plainText = buildLegacyPlainText(brief, config);
    return {
      success: true,
      data: {
        format: 'markdown',
        content: plainText,
        metadata: {
          renderedAt: timestamp,
          templateVersion: config?.templateVersion || '1.0.0',
        },
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RENDER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  }
}

/**
 * Render brief as JSON (structured data)
 */
export function renderAsJSON(
  brief: DealPrepBrief,
  config?: RenderConfig & { pretty?: boolean }
): ModuleResult<RenderedOutput> {
  const timestamp = new Date().toISOString();
  try {
    const json = config?.pretty
      ? JSON.stringify(brief, null, 2)
      : JSON.stringify(brief);
    return {
      success: true,
      data: {
        format: 'crm',
        content: json,
        metadata: {
          renderedAt: timestamp,
          templateVersion: config?.templateVersion || '1.0.0',
        },
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RENDER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      metadata: {
        runId: brief.runId,
        module: 'renderers',
        timestamp,
      },
    };
  }
}

// ============================================================================
// Legacy Builder Functions
// ============================================================================

function buildLegacyCRMMarkdown(brief: DealPrepBrief, config?: RenderConfig): string {
  const lines: string[] = [];

  lines.push(`# Deal Preparation Brief: ${brief.prospect.companyName}`);
  lines.push('');
  lines.push(`**Run ID:** ${brief.runId}`);
  lines.push(`**Generated:** ${formatDateTime(brief.generatedAt)}`);
  lines.push(`**Confidence:** ${brief.confidence}`);
  lines.push('');

  if (brief.prospect.companyOverview) {
    lines.push('## Company Overview');
    lines.push('');
    lines.push(brief.prospect.companyOverview);
    lines.push('');
  }

  if (brief.contact) {
    lines.push('## Contact');
    lines.push('');
    lines.push(`- **Name:** ${brief.contact.name}`);
    if (brief.contact.title) lines.push(`- **Title:** ${brief.contact.title}`);
    if (brief.contact.background) {
      lines.push('');
      lines.push(brief.contact.background);
    }
    lines.push('');
  }

  if (brief.insights.opportunities && brief.insights.opportunities.length > 0) {
    lines.push('## Opportunities');
    lines.push('');
    for (const opp of brief.insights.opportunities) {
      lines.push(`- ${opp}`);
    }
    lines.push('');
  }

  if (brief.recommendations.talkingPoints && brief.recommendations.talkingPoints.length > 0) {
    lines.push('## Talking Points');
    lines.push('');
    for (const point of brief.recommendations.talkingPoints) {
      lines.push(`- ${point}`);
    }
    lines.push('');
  }

  if (config?.includeSources && brief.sources.length > 0) {
    lines.push('## Sources');
    lines.push('');
    for (const source of brief.sources) {
      lines.push(`- ${source.description}${source.url ? ` (${source.url})` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildLegacyEmailHtml(brief: DealPrepBrief, config?: RenderConfig & { recipientName?: string }): string {
  const greeting = config?.recipientName ? `Hi ${config.recipientName},` : 'Hi,';
  const opportunities = brief.insights.opportunities || [];

  return `<!DOCTYPE html>
<html>
<head><title>Deal Prep: ${escapeHtml(brief.prospect.companyName)}</title></head>
<body style="font-family: sans-serif; padding: 20px;">
  <p>${greeting}</p>
  <p>Your deal preparation brief for <strong>${escapeHtml(brief.prospect.companyName)}</strong> is ready.</p>
  ${opportunities.length > 0 ? `
  <h3>Key Opportunities</h3>
  <ul>
    ${opportunities.map(o => `<li>${escapeHtml(o)}</li>`).join('\n    ')}
  </ul>
  ` : ''}
  <p><small>Run ID: ${escapeHtml(brief.runId)}</small></p>
</body>
</html>`;
}

function buildLegacyMotionTask(brief: DealPrepBrief, config?: RenderConfig & { dueDate?: string; assignee?: string }): string {
  const lines: string[] = [];

  lines.push(`Task: Review Deal Prep - ${brief.prospect.companyName}`);
  lines.push('');

  if (config?.dueDate) {
    lines.push(`Due: ${config.dueDate}`);
  }
  if (config?.assignee) {
    lines.push(`Assignee: ${config.assignee}`);
  }
  lines.push('');

  if (brief.recommendations.talkingPoints && brief.recommendations.talkingPoints.length > 0) {
    lines.push('Talking Points:');
    for (const point of brief.recommendations.talkingPoints) {
      lines.push(`- ${point}`);
    }
  }

  lines.push('');
  lines.push(`Reference: ${brief.runId}`);

  return lines.join('\n');
}

function buildLegacyPlainText(brief: DealPrepBrief, _config?: RenderConfig): string {
  const lines: string[] = [];

  lines.push(`DEAL PREPARATION BRIEF: ${brief.prospect.companyName.toUpperCase()}`);
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Run ID: ${brief.runId}`);
  lines.push(`Generated: ${brief.generatedAt}`);
  lines.push(`Confidence: ${brief.confidence}`);
  lines.push('');

  if (brief.prospect.companyOverview) {
    lines.push('COMPANY OVERVIEW');
    lines.push('-'.repeat(30));
    lines.push(brief.prospect.companyOverview);
    lines.push('');
  }

  if (brief.insights.opportunities && brief.insights.opportunities.length > 0) {
    lines.push('OPPORTUNITIES');
    lines.push('-'.repeat(30));
    for (const opp of brief.insights.opportunities) {
      lines.push(`* ${opp}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
