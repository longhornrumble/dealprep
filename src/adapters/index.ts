/**
 * Delivery Adapters Module
 *
 * Implements Section 11 (Delivery Tracking) and Section 12 (External Interfaces)
 * from the AI Deal Prep Implementation Spec.
 *
 * Responsibilities:
 * - Integrate with external systems (CRM, Email, Motion)
 * - Handle API authentication and rate limiting
 * - Map internal data structures to external formats
 * - Provide error handling and retry logic
 * - Track delivery status per channel independently
 *
 * Usage in n8n:
 * const { executeDeliveries } = await import('deal-prep-level-2/adapters');
 * const status = await executeDeliveries(runId, brief, input, rendered, adapters, storage);
 */

import type { DealPrepBrief, StorageAdapter, RunId } from '../types/index.js';

// ============================================================================
// DELIVERY STATUS TYPES (Section 11.2)
// ============================================================================

export type DeliveryStatusValue = 'not_attempted' | 'success' | 'failed';

export interface DeliveryChannelStatus {
  status: DeliveryStatusValue;
  attempted_at: string | null;
  error: string | null;
}

export interface DeliveryStatus {
  deliveries: {
    customer_relationship_management: DeliveryChannelStatus;
    email: DeliveryChannelStatus;
    motion: DeliveryChannelStatus;
  };
}

// ============================================================================
// CRM ADAPTER TYPES (Section 12.1)
// ============================================================================

export interface OrgData {
  name?: string | undefined;
  website?: string | undefined;
  domain: string;
  industry?: string | undefined;
  description?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ContactData {
  email: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  fullName?: string | undefined;
  title?: string | undefined;
  phone?: string | undefined;
  linkedInUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RunMeta {
  triggerSource: 'inbound' | 'outbound';
  generatedAt: string;
  completedAt: string;
  briefUrl?: string | undefined;
  sourceUrls: string[];
}

export interface CRMResult {
  success: boolean;
  entityId?: string;
  entityType?: 'organization' | 'contact' | 'note' | 'artifact';
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CRM Adapter Interface (Section 12.1)
 *
 * Required operations:
 * - Upsert organization by domain or website
 * - Upsert contact by email when available
 * - Associate contact to organization
 * - Attach Deal Preparation Brief artifact
 * - Record run metadata
 *
 * No destructive updates are permitted.
 */
export interface CRMAdapter {
  /**
   * Create or update an organization record by domain
   * No destructive updates - only additive changes
   */
  upsertOrganization(domain: string, data: OrgData): Promise<CRMResult>;

  /**
   * Create or update a contact record by email
   * No destructive updates - only additive changes
   */
  upsertContact(email: string, data: ContactData): Promise<CRMResult>;

  /**
   * Associate a contact to an organization
   */
  associateContactToOrganization(contactId: string, orgId: string): Promise<CRMResult>;

  /**
   * Attach the Deal Preparation Brief as a note or document
   */
  attachBrief(orgId: string, briefMarkdown: string, briefUrl: string): Promise<CRMResult>;

  /**
   * Record run metadata (run_id, timestamps, sources)
   */
  recordRunMetadata(orgId: string, runId: string, metadata: RunMeta): Promise<CRMResult>;
}

// ============================================================================
// EMAIL ADAPTER TYPES (Section 12.2)
// ============================================================================

export interface EmailMessage {
  to: string[];
  cc?: string[] | undefined;
  subject: string;
  htmlBody?: string | undefined;
  textBody: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType: string;
  }> | undefined;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailConfig {
  provider: 'sendgrid' | 'smtp' | 'ses';
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromEmail: string;
  fromName?: string;
  timeout?: number;
}

/**
 * Email Adapter Interface (Section 12.2)
 *
 * Required capabilities:
 * - Send plain-text or HTML email
 * - Support subject and body
 * - Support multiple recipients
 * - Report delivery success or failure
 *
 * Email sending must be idempotent per run identifier.
 */
export interface EmailAdapter {
  /**
   * Send an email message
   * Must be idempotent per run_id
   */
  sendEmail(runId: string, message: EmailMessage): Promise<EmailResult>;

  /**
   * Check if an email was already sent for this run_id
   */
  wasEmailSent(runId: string): Promise<boolean>;
}

// ============================================================================
// MOTION ADAPTER TYPES (Section 12.3)
// ============================================================================

export interface MotionTask {
  title: string;
  description: string;
  dueDate?: string | undefined; // ISO-8601 timestamp
  workspaceId?: string | undefined;
  projectId?: string | undefined;
  priority?: 'low' | 'medium' | 'high' | 'asap' | undefined;
  labels?: string[] | undefined;
}

export interface MotionResult {
  success: boolean;
  taskId?: string;
  taskUrl?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface MotionConfig {
  apiKey: string;
  apiUrl?: string;
  workspaceId: string;
  timeout?: number;
}

/**
 * Motion Adapter Interface (Section 12.3)
 *
 * Required capabilities:
 * - Create task
 * - Set title and body
 * - Optionally set due date
 * - Associate task with correct workspace
 *
 * Motion failures must be logged but must not halt the run.
 */
export interface MotionAdapter {
  /**
   * Create a task in Motion
   * Failures should not halt the run
   */
  createTask(task: MotionTask): Promise<MotionResult>;
}

// ============================================================================
// RENDERED OUTPUT TYPES
// ============================================================================

export interface CRMNoteOutput {
  markdown: string;
  briefUrl?: string;
}

export interface EmailOutput {
  subject: string;
  htmlBody?: string;
  textBody: string;
}

export interface MotionTaskOutput {
  title: string;
  description: string;
  dueDate?: string;
}

export interface RenderedOutputs {
  crm: CRMNoteOutput;
  email: EmailOutput;
  motion: MotionTaskOutput;
}

// ============================================================================
// CANONICAL INPUT (for delivery context)
// ============================================================================

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
  routing: {
    crm_target?: string | null;
    email_to?: string | null;
    email_cc?: string[];
    motion_workspace?: string | null;
  };
}

// ============================================================================
// ADAPTERS CONFIGURATION
// ============================================================================

export interface AdaptersConfig {
  crm: CRMAdapter;
  email: EmailAdapter;
  motion: MotionAdapter;
}

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// Default console logger
const defaultLogger: Logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta || ''),
};

// ============================================================================
// NULL CRM ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * NullCRMAdapter
 *
 * Returns success but performs no action.
 * Logs "CRM not configured" warning.
 * Used when CRM integration is not enabled.
 */
export class NullCRMAdapter implements CRMAdapter {
  private logger: Logger;

  constructor(logger: Logger = defaultLogger) {
    this.logger = logger;
  }

  async upsertOrganization(domain: string, _data: OrgData): Promise<CRMResult> {
    this.logger.warn('CRM not configured - skipping upsertOrganization', { domain });
    return {
      success: true,
      entityType: 'organization',
      metadata: { skipped: true, reason: 'CRM not configured' },
    };
  }

  async upsertContact(email: string, _data: ContactData): Promise<CRMResult> {
    this.logger.warn('CRM not configured - skipping upsertContact', { email });
    return {
      success: true,
      entityType: 'contact',
      metadata: { skipped: true, reason: 'CRM not configured' },
    };
  }

  async associateContactToOrganization(contactId: string, orgId: string): Promise<CRMResult> {
    this.logger.warn('CRM not configured - skipping associateContactToOrganization', {
      contactId,
      orgId,
    });
    return {
      success: true,
      metadata: { skipped: true, reason: 'CRM not configured' },
    };
  }

  async attachBrief(orgId: string, _briefMarkdown: string, _briefUrl: string): Promise<CRMResult> {
    this.logger.warn('CRM not configured - skipping attachBrief', { orgId });
    return {
      success: true,
      entityType: 'note',
      metadata: { skipped: true, reason: 'CRM not configured' },
    };
  }

  async recordRunMetadata(orgId: string, runId: string, _metadata: RunMeta): Promise<CRMResult> {
    this.logger.warn('CRM not configured - skipping recordRunMetadata', { orgId, runId });
    return {
      success: true,
      metadata: { skipped: true, reason: 'CRM not configured' },
    };
  }
}

// ============================================================================
// SENDGRID EMAIL ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * SendGridEmailAdapter
 *
 * Implements email sending via SendGrid API.
 * Maintains idempotency per run_id using an in-memory Set
 * (in production, this should be backed by persistent storage).
 */
export class SendGridEmailAdapter implements EmailAdapter {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  private timeout: number;
  private sentRuns: Set<string>; // In production, use persistent storage
  private logger: Logger;
  private apiUrl: string;

  constructor(config: EmailConfig, logger: Logger = defaultLogger) {
    if (!config.apiKey) {
      throw new Error('SendGrid API key is required');
    }
    if (!config.fromEmail) {
      throw new Error('From email is required');
    }
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName ?? 'Deal Prep System';
    this.timeout = config.timeout ?? 30000;
    this.sentRuns = new Set();
    this.logger = logger;
    this.apiUrl = 'https://api.sendgrid.com/v3/mail/send';
  }

  async wasEmailSent(runId: string): Promise<boolean> {
    // In production, check persistent storage (e.g., DynamoDB, Redis)
    return this.sentRuns.has(runId);
  }

  async sendEmail(runId: string, message: EmailMessage): Promise<EmailResult> {
    // Idempotency check (Section 12.2)
    if (await this.wasEmailSent(runId)) {
      this.logger.info('Email already sent for this run_id - skipping', { runId });
      return {
        success: true,
        metadata: { idempotent: true, reason: 'Email already sent for this run_id' },
      };
    }

    try {
      const payload = {
        personalizations: [
          {
            to: message.to.map((email) => ({ email })),
            ...(message.cc && message.cc.length > 0
              ? { cc: message.cc.map((email) => ({ email })) }
              : {}),
          },
        ],
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: message.subject,
        content: [
          ...(message.textBody ? [{ type: 'text/plain', value: message.textBody }] : []),
          ...(message.htmlBody ? [{ type: 'text/html', value: message.htmlBody }] : []),
        ],
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`SendGrid API error: ${response.status} - ${errorBody}`);
      }

      // Get message ID from response headers
      const messageId = response.headers.get('X-Message-Id') ?? `sg-${runId}-${Date.now()}`;

      // Mark as sent for idempotency
      this.sentRuns.add(runId);

      this.logger.info('Email sent successfully', { runId, messageId, to: message.to });

      return {
        success: true,
        messageId,
        metadata: {
          provider: 'sendgrid',
          recipients: message.to,
          sentAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send email via SendGrid', { runId, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          provider: 'sendgrid',
          failedAt: new Date().toISOString(),
        },
      };
    }
  }
}

// ============================================================================
// NULL EMAIL ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * NullEmailAdapter
 *
 * Returns not_attempted status.
 * Used when email integration is not enabled.
 */
export class NullEmailAdapter implements EmailAdapter {
  private logger: Logger;

  constructor(logger: Logger = defaultLogger) {
    this.logger = logger;
  }

  async wasEmailSent(_runId: string): Promise<boolean> {
    return false;
  }

  async sendEmail(runId: string, _message: EmailMessage): Promise<EmailResult> {
    this.logger.warn('Email not configured - skipping sendEmail', { runId });
    return {
      success: true,
      metadata: { skipped: true, reason: 'Email not configured' },
    };
  }
}

// ============================================================================
// MOTION ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * MotionAPIAdapter
 *
 * Implements task creation via Motion API.
 * API Reference: https://docs.usemotion.com/reference
 */
export class MotionAPIAdapter implements MotionAdapter {
  private apiKey: string;
  private apiUrl: string;
  private workspaceId: string;
  private timeout: number;
  private logger: Logger;

  constructor(config: MotionConfig, logger: Logger = defaultLogger) {
    if (!config.apiKey) {
      throw new Error('Motion API key is required');
    }
    if (!config.workspaceId) {
      throw new Error('Motion workspace ID is required');
    }
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl ?? 'https://api.usemotion.com/v1';
    this.workspaceId = config.workspaceId;
    this.timeout = config.timeout ?? 30000;
    this.logger = logger;
  }

  async createTask(task: MotionTask): Promise<MotionResult> {
    try {
      const payload: Record<string, unknown> = {
        name: task.title,
        description: task.description,
        workspaceId: task.workspaceId ?? this.workspaceId,
      };

      // Add optional fields
      if (task.dueDate) {
        payload['dueDate'] = task.dueDate;
      }
      if (task.projectId) {
        payload['projectId'] = task.projectId;
      }
      if (task.priority) {
        // Motion API uses uppercase priorities
        payload['priority'] = task.priority.toUpperCase();
      }
      if (task.labels && task.labels.length > 0) {
        payload['labels'] = task.labels;
      }

      const response = await fetch(`${this.apiUrl}/tasks`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Motion API error: ${response.status} - ${errorBody}`);
      }

      const data = (await response.json()) as { id?: string; task?: { id?: string } };
      const taskId = data.id ?? data.task?.id ?? `motion-${Date.now()}`;
      const taskUrl = `https://app.usemotion.com/task/${taskId}`;

      this.logger.info('Motion task created successfully', { taskId, title: task.title });

      return {
        success: true,
        taskId,
        taskUrl,
        metadata: {
          provider: 'motion',
          createdAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create Motion task', { error: errorMessage, title: task.title });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          provider: 'motion',
          failedAt: new Date().toISOString(),
        },
      };
    }
  }
}

// ============================================================================
// NULL MOTION ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * NullMotionAdapter
 *
 * Returns not_attempted status.
 * Used when Motion integration is not enabled.
 */
export class NullMotionAdapter implements MotionAdapter {
  private logger: Logger;

  constructor(logger: Logger = defaultLogger) {
    this.logger = logger;
  }

  async createTask(task: MotionTask): Promise<MotionResult> {
    this.logger.warn('Motion not configured - skipping createTask', { title: task.title });
    return {
      success: true,
      metadata: { skipped: true, reason: 'Motion not configured' },
    };
  }
}

// ============================================================================
// DELIVERY ORCHESTRATOR (Section 11.3)
// ============================================================================

/**
 * Creates the initial delivery status object
 */
export function createInitialDeliveryStatus(): DeliveryStatus {
  return {
    deliveries: {
      customer_relationship_management: {
        status: 'not_attempted',
        attempted_at: null,
        error: null,
      },
      email: {
        status: 'not_attempted',
        attempted_at: null,
        error: null,
      },
      motion: {
        status: 'not_attempted',
        attempted_at: null,
        error: null,
      },
    },
  };
}

/**
 * Execute CRM delivery
 */
async function executeCRMDelivery(
  runId: string,
  brief: DealPrepBrief,
  input: CanonicalInput,
  rendered: CRMNoteOutput,
  crmAdapter: CRMAdapter,
  logger: Logger
): Promise<DeliveryChannelStatus> {
  const attemptedAt = new Date().toISOString();

  try {
    const domain = input.organization.domain ?? extractDomain(input.organization.website ?? '');

    if (!domain) {
      return {
        status: 'failed',
        attempted_at: attemptedAt,
        error: 'No domain available for CRM upsert',
      };
    }

    // 1. Upsert organization
    const orgResult = await crmAdapter.upsertOrganization(domain, {
      name: input.organization.name ?? undefined,
      website: input.organization.website ?? undefined,
      domain,
    });

    if (!orgResult.success) {
      return {
        status: 'failed',
        attempted_at: attemptedAt,
        error: orgResult.error ?? 'Failed to upsert organization',
      };
    }

    const orgId = orgResult.entityId ?? domain;

    // 2. Upsert contact if email available
    let contactId: string | undefined;
    if (input.contact.email) {
      const contactResult = await crmAdapter.upsertContact(input.contact.email, {
        email: input.contact.email,
        firstName: input.contact.first_name ?? undefined,
        lastName: input.contact.last_name ?? undefined,
        fullName: input.contact.full_name ?? undefined,
        title: input.contact.title ?? undefined,
        phone: input.contact.phone ?? undefined,
        linkedInUrl: input.contact.linkedin_url ?? undefined,
      });

      if (contactResult.success && contactResult.entityId) {
        contactId = contactResult.entityId;

        // 3. Associate contact to organization
        await crmAdapter.associateContactToOrganization(contactId, orgId);
      }
    }

    // 4. Attach brief
    const briefResult = await crmAdapter.attachBrief(orgId, rendered.markdown, rendered.briefUrl ?? '');

    if (!briefResult.success) {
      return {
        status: 'failed',
        attempted_at: attemptedAt,
        error: briefResult.error ?? 'Failed to attach brief',
      };
    }

    // 5. Record run metadata
    await crmAdapter.recordRunMetadata(orgId, runId, {
      triggerSource: input.meta.trigger_source,
      generatedAt: brief.generatedAt,
      completedAt: new Date().toISOString(),
      briefUrl: rendered.briefUrl,
      sourceUrls: brief.sources.map((s) => s.url ?? '').filter(Boolean),
    });

    logger.info('CRM delivery completed successfully', { runId, orgId, contactId });

    return {
      status: 'success',
      attempted_at: attemptedAt,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('CRM delivery failed', { runId, error: errorMessage });

    return {
      status: 'failed',
      attempted_at: attemptedAt,
      error: errorMessage,
    };
  }
}

/**
 * Execute Email delivery
 */
async function executeEmailDelivery(
  runId: string,
  input: CanonicalInput,
  rendered: EmailOutput,
  emailAdapter: EmailAdapter,
  logger: Logger
): Promise<DeliveryChannelStatus> {
  const attemptedAt = new Date().toISOString();

  try {
    const recipients: string[] = [];

    if (input.routing.email_to) {
      recipients.push(input.routing.email_to);
    }

    if (recipients.length === 0) {
      return {
        status: 'failed',
        attempted_at: attemptedAt,
        error: 'No email recipients configured',
      };
    }

    const result = await emailAdapter.sendEmail(runId, {
      to: recipients,
      cc: input.routing.email_cc,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });

    if (!result.success) {
      return {
        status: 'failed',
        attempted_at: attemptedAt,
        error: result.error ?? 'Email delivery failed',
      };
    }

    logger.info('Email delivery completed successfully', {
      runId,
      messageId: result.messageId,
      recipients,
    });

    return {
      status: 'success',
      attempted_at: attemptedAt,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Email delivery failed', { runId, error: errorMessage });

    return {
      status: 'failed',
      attempted_at: attemptedAt,
      error: errorMessage,
    };
  }
}

/**
 * Execute Motion delivery
 */
async function executeMotionDelivery(
  runId: string,
  input: CanonicalInput,
  rendered: MotionTaskOutput,
  motionAdapter: MotionAdapter,
  logger: Logger
): Promise<DeliveryChannelStatus> {
  const attemptedAt = new Date().toISOString();

  try {
    const result = await motionAdapter.createTask({
      title: rendered.title,
      description: rendered.description,
      dueDate: rendered.dueDate,
      workspaceId: input.routing.motion_workspace ?? undefined,
    });

    if (!result.success) {
      // Motion failures must be logged but must not halt the run (Section 12.3)
      logger.warn('Motion task creation failed but continuing', {
        runId,
        error: result.error,
      });

      return {
        status: 'failed',
        attempted_at: attemptedAt,
        error: result.error ?? 'Motion task creation failed',
      };
    }

    logger.info('Motion delivery completed successfully', {
      runId,
      taskId: result.taskId,
      taskUrl: result.taskUrl,
    });

    return {
      status: 'success',
      attempted_at: attemptedAt,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Motion delivery failed', { runId, error: errorMessage });

    // Motion failures logged but don't halt (Section 12.3)
    return {
      status: 'failed',
      attempted_at: attemptedAt,
      error: errorMessage,
    };
  }
}

/**
 * Helper to extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * DeliveryOrchestrator
 *
 * Executes all three deliveries independently using Promise.allSettled (Section 11.3).
 *
 * Rules:
 * - Each channel attempted independently
 * - Failure in one must NOT block others
 * - Failed deliveries may be retried using run_id
 * - All outcomes persisted to Run Artifact
 */
export async function executeDeliveries(
  runId: RunId,
  brief: DealPrepBrief,
  input: CanonicalInput,
  rendered: RenderedOutputs,
  adapters: AdaptersConfig,
  storage: StorageAdapter,
  logger: Logger = defaultLogger
): Promise<DeliveryStatus> {
  logger.info('Starting delivery orchestration', { runId });

  const deliveryStatus = createInitialDeliveryStatus();

  // Execute all three deliveries independently using Promise.allSettled
  const [crmResult, emailResult, motionResult] = await Promise.allSettled([
    executeCRMDelivery(runId, brief, input, rendered.crm, adapters.crm, logger),
    executeEmailDelivery(runId, input, rendered.email, adapters.email, logger),
    executeMotionDelivery(runId, input, rendered.motion, adapters.motion, logger),
  ]);

  // Process CRM result
  if (crmResult.status === 'fulfilled') {
    deliveryStatus.deliveries.customer_relationship_management = crmResult.value;
  } else {
    deliveryStatus.deliveries.customer_relationship_management = {
      status: 'failed',
      attempted_at: new Date().toISOString(),
      error: crmResult.reason?.message ?? 'Unknown error',
    };
  }

  // Process Email result
  if (emailResult.status === 'fulfilled') {
    deliveryStatus.deliveries.email = emailResult.value;
  } else {
    deliveryStatus.deliveries.email = {
      status: 'failed',
      attempted_at: new Date().toISOString(),
      error: emailResult.reason?.message ?? 'Unknown error',
    };
  }

  // Process Motion result
  if (motionResult.status === 'fulfilled') {
    deliveryStatus.deliveries.motion = motionResult.value;
  } else {
    deliveryStatus.deliveries.motion = {
      status: 'failed',
      attempted_at: new Date().toISOString(),
      error: motionResult.reason?.message ?? 'Unknown error',
    };
  }

  // Persist delivery status to Run Artifact
  try {
    await storage.save(runId, 'delivery_status', JSON.stringify(deliveryStatus, null, 2), {
      contentType: 'application/json',
      updatedAt: new Date().toISOString(),
    });
    logger.info('Delivery status persisted to storage', { runId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to persist delivery status', { runId, error: errorMessage });
  }

  logger.info('Delivery orchestration completed', {
    runId,
    crm: deliveryStatus.deliveries.customer_relationship_management.status,
    email: deliveryStatus.deliveries.email.status,
    motion: deliveryStatus.deliveries.motion.status,
  });

  return deliveryStatus;
}

// ============================================================================
// ADAPTER FACTORY FUNCTIONS
// ============================================================================

/**
 * Create adapters from environment configuration
 */
export function createAdaptersFromEnv(logger: Logger = defaultLogger): AdaptersConfig {
  // CRM Adapter
  let crmAdapter: CRMAdapter;
  // For now, we only have NullCRMAdapter
  // Future: check CRM_PROVIDER, HUBSPOT_API_KEY, SALESFORCE_TOKEN, etc.
  crmAdapter = new NullCRMAdapter(logger);

  // Email Adapter
  let emailAdapter: EmailAdapter;
  const sendgridApiKey = process.env['SENDGRID_API_KEY'];
  const fromEmail = process.env['EMAIL_FROM'] ?? 'noreply@example.com';
  const fromName = process.env['EMAIL_FROM_NAME'] ?? 'Deal Prep System';

  if (sendgridApiKey) {
    emailAdapter = new SendGridEmailAdapter(
      {
        provider: 'sendgrid',
        apiKey: sendgridApiKey,
        fromEmail,
        fromName,
      },
      logger
    );
  } else {
    emailAdapter = new NullEmailAdapter(logger);
  }

  // Motion Adapter
  let motionAdapter: MotionAdapter;
  const motionApiKey = process.env['MOTION_API_KEY'];
  const motionWorkspaceId = process.env['MOTION_WORKSPACE_ID'];

  if (motionApiKey && motionWorkspaceId) {
    motionAdapter = new MotionAPIAdapter(
      {
        apiKey: motionApiKey,
        workspaceId: motionWorkspaceId,
      },
      logger
    );
  } else {
    motionAdapter = new NullMotionAdapter(logger);
  }

  return {
    crm: crmAdapter,
    email: emailAdapter,
    motion: motionAdapter,
  };
}

// ============================================================================
// OBSERVABILITY METRICS
// ============================================================================

export interface DeliveryMetrics {
  runId: string;
  totalDurationMs: number;
  crmDurationMs?: number;
  emailDurationMs?: number;
  motionDurationMs?: number;
  crmStatus: DeliveryStatusValue;
  emailStatus: DeliveryStatusValue;
  motionStatus: DeliveryStatusValue;
  successCount: number;
  failureCount: number;
  notAttemptedCount: number;
}

/**
 * Calculate delivery metrics from status
 */
export function calculateDeliveryMetrics(
  runId: string,
  status: DeliveryStatus,
  startTime: number
): DeliveryMetrics {
  const statuses = [
    status.deliveries.customer_relationship_management.status,
    status.deliveries.email.status,
    status.deliveries.motion.status,
  ];

  return {
    runId,
    totalDurationMs: Date.now() - startTime,
    crmStatus: status.deliveries.customer_relationship_management.status,
    emailStatus: status.deliveries.email.status,
    motionStatus: status.deliveries.motion.status,
    successCount: statuses.filter((s) => s === 'success').length,
    failureCount: statuses.filter((s) => s === 'failed').length,
    notAttemptedCount: statuses.filter((s) => s === 'not_attempted').length,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Classes and functions are exported at their declarations
// Re-export types for backward compatibility
export type { CRMAdapter as CRMAdapterInterface };
export type { EmailAdapter as EmailAdapterInterface };
export type { MotionAdapter as MotionAdapterInterface };
