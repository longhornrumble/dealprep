/**
 * Delivery Adapters Unit Tests
 *
 * Tests Section 11 (Delivery Tracking) and Section 12 (External Interfaces)
 * from the AI Deal Prep Implementation Spec.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  NullCRMAdapter,
  NullEmailAdapter,
  NullMotionAdapter,
  SendGridEmailAdapter,
  MotionAPIAdapter,
  executeDeliveries,
  createInitialDeliveryStatus,
  calculateDeliveryMetrics,
  extractDomain,
  type CRMAdapter,
  type EmailAdapter,
  type MotionAdapter,
  type CRMResult,
  type EmailResult,
  type MotionResult,
  type DeliveryStatus,
  type CanonicalInput,
  type RenderedOutputs,
  type Logger,
  type OrgData,
  type ContactData,
  type RunMeta,
  type EmailMessage,
  type MotionTask,
} from '../../src/adapters/index.js';
import type { DealPrepBrief, StorageAdapter, ArtifactMetadata } from '../../src/types/index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockLogger = (): Logger & { logs: Array<{ level: string; msg: string; meta?: Record<string, unknown> }> } => {
  const logs: Array<{ level: string; msg: string; meta?: Record<string, unknown> }> = [];
  return {
    logs,
    info: (msg, meta) => logs.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => logs.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => logs.push({ level: 'error', msg, meta }),
    debug: (msg, meta) => logs.push({ level: 'debug', msg, meta }),
  };
};

const createMockStorageAdapter = (): StorageAdapter & { saved: Array<{ runId: string; artifactType: string; content: string }> } => {
  const saved: Array<{ runId: string; artifactType: string; content: string }> = [];
  return {
    saved,
    save: jest.fn<StorageAdapter['save']>().mockImplementation(async (runId, artifactType, content) => {
      saved.push({ runId, artifactType, content: String(content) });
      return {
        runId,
        artifactType,
        fileName: `${runId}/${artifactType}.json`,
        createdAt: new Date().toISOString(),
        contentType: 'application/json',
      } as ArtifactMetadata;
    }),
    load: jest.fn<StorageAdapter['load']>().mockResolvedValue({ content: '{}', metadata: {} as ArtifactMetadata }),
    exists: jest.fn<StorageAdapter['exists']>().mockResolvedValue(false),
    list: jest.fn<StorageAdapter['list']>().mockResolvedValue([]),
    delete: jest.fn<StorageAdapter['delete']>().mockResolvedValue(undefined),
  };
};

const createTestBrief = (): DealPrepBrief => ({
  runId: 'run_test_12345',
  prospect: {
    companyName: 'Test Company',
    companyOverview: 'A test company for testing',
    industry: 'Technology',
  },
  contact: {
    name: 'John Doe',
    title: 'CEO',
  },
  insights: {
    painPoints: ['Pain point 1', 'Pain point 2'],
    opportunities: ['Opportunity 1', 'Opportunity 2'],
  },
  recommendations: {
    talkingPoints: ['Talk about this', 'Talk about that'],
    questionsToAsk: ['Question 1?', 'Question 2?'],
  },
  sources: [
    { type: 'website', url: 'https://example.com', description: 'Company website' },
    { type: 'linkedin', description: 'LinkedIn profile' },
  ],
  generatedAt: '2024-01-15T10:00:00Z',
  confidence: 'high',
});

const createTestInput = (): CanonicalInput => ({
  meta: {
    trigger_source: 'inbound',
    submitted_at: '2024-01-15T09:00:00Z',
    run_id: 'run_test_12345',
    requested_meeting_at: '2024-01-16T14:00:00Z',
    timezone: 'America/New_York',
  },
  organization: {
    name: 'Test Company',
    website: 'https://www.example.com',
    domain: 'example.com',
  },
  contact: {
    full_name: 'John Doe',
    first_name: 'John',
    last_name: 'Doe',
    title: 'CEO',
    email: 'john@example.com',
    phone: '+1234567890',
    linkedin_url: 'https://linkedin.com/in/johndoe',
  },
  routing: {
    crm_target: 'hubspot',
    email_to: 'chris@myrecruiter.ai',
    email_cc: ['team@myrecruiter.ai'],
    motion_workspace: 'workspace_123',
  },
});

const createTestRenderedOutputs = (): RenderedOutputs => ({
  crm: {
    markdown: '# Deal Prep Brief\n\n## Company: Test Company\n\nInsights and recommendations...',
    briefUrl: 'https://storage.example.com/briefs/run_test_12345.md',
  },
  email: {
    subject: 'Deal Prep Brief: Test Company',
    textBody: 'Here is your deal prep brief for Test Company...',
    htmlBody: '<h1>Deal Prep Brief</h1><p>Here is your deal prep brief for Test Company...</p>',
  },
  motion: {
    title: 'Deal Prep - Test Company',
    description: 'Top opportunities:\n1. Opportunity 1\n2. Opportunity 2',
    dueDate: '2024-01-16T12:00:00Z',
  },
});

// ============================================================================
// NULL CRM ADAPTER TESTS
// ============================================================================

describe('NullCRMAdapter', () => {
  let adapter: NullCRMAdapter;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    adapter = new NullCRMAdapter(logger);
  });

  it('should return success for upsertOrganization without performing action', async () => {
    const result = await adapter.upsertOrganization('example.com', { domain: 'example.com', name: 'Test' });

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('organization');
    expect(result.metadata?.skipped).toBe(true);
    expect(result.metadata?.reason).toBe('CRM not configured');

    const warningLog = logger.logs.find((l) => l.level === 'warn' && l.msg.includes('CRM not configured'));
    expect(warningLog).toBeDefined();
  });

  it('should return success for upsertContact without performing action', async () => {
    const result = await adapter.upsertContact('test@example.com', { email: 'test@example.com' });

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('contact');
    expect(result.metadata?.skipped).toBe(true);
  });

  it('should return success for associateContactToOrganization without performing action', async () => {
    const result = await adapter.associateContactToOrganization('contact_123', 'org_456');

    expect(result.success).toBe(true);
    expect(result.metadata?.skipped).toBe(true);
  });

  it('should return success for attachBrief without performing action', async () => {
    const result = await adapter.attachBrief('org_123', '# Brief', 'https://example.com/brief.md');

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('note');
    expect(result.metadata?.skipped).toBe(true);
  });

  it('should return success for recordRunMetadata without performing action', async () => {
    const result = await adapter.recordRunMetadata('org_123', 'run_456', {
      triggerSource: 'inbound',
      generatedAt: '2024-01-15T10:00:00Z',
      completedAt: '2024-01-15T10:05:00Z',
      sourceUrls: ['https://example.com'],
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.skipped).toBe(true);
  });
});

// ============================================================================
// NULL EMAIL ADAPTER TESTS
// ============================================================================

describe('NullEmailAdapter', () => {
  let adapter: NullEmailAdapter;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    adapter = new NullEmailAdapter(logger);
  });

  it('should return false for wasEmailSent', async () => {
    const result = await adapter.wasEmailSent('run_123');
    expect(result).toBe(false);
  });

  it('should return success for sendEmail without performing action', async () => {
    const result = await adapter.sendEmail('run_123', {
      to: ['test@example.com'],
      subject: 'Test',
      textBody: 'Test body',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.skipped).toBe(true);
    expect(result.metadata?.reason).toBe('Email not configured');

    const warningLog = logger.logs.find((l) => l.level === 'warn' && l.msg.includes('Email not configured'));
    expect(warningLog).toBeDefined();
  });
});

// ============================================================================
// NULL MOTION ADAPTER TESTS
// ============================================================================

describe('NullMotionAdapter', () => {
  let adapter: NullMotionAdapter;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    adapter = new NullMotionAdapter(logger);
  });

  it('should return success for createTask without performing action', async () => {
    const result = await adapter.createTask({
      title: 'Test Task',
      description: 'Test description',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.skipped).toBe(true);
    expect(result.metadata?.reason).toBe('Motion not configured');

    const warningLog = logger.logs.find((l) => l.level === 'warn' && l.msg.includes('Motion not configured'));
    expect(warningLog).toBeDefined();
  });
});

// ============================================================================
// SENDGRID EMAIL ADAPTER TESTS
// ============================================================================

describe('SendGridEmailAdapter', () => {
  it('should throw error if API key is not provided', () => {
    expect(() => {
      new SendGridEmailAdapter({
        provider: 'sendgrid',
        fromEmail: 'test@example.com',
      });
    }).toThrow('SendGrid API key is required');
  });

  it('should throw error if from email is not provided', () => {
    expect(() => {
      new SendGridEmailAdapter({
        provider: 'sendgrid',
        apiKey: 'test_api_key',
        fromEmail: '',
      });
    }).toThrow('From email is required');
  });

  describe('with valid configuration', () => {
    let adapter: SendGridEmailAdapter;
    let logger: ReturnType<typeof createMockLogger>;
    let originalFetch: typeof global.fetch;
    let fetchMock: jest.Mock;

    beforeEach(() => {
      logger = createMockLogger();
      adapter = new SendGridEmailAdapter(
        {
          provider: 'sendgrid',
          apiKey: 'test_api_key',
          fromEmail: 'noreply@example.com',
          fromName: 'Test Sender',
        },
        logger
      );

      // Save original fetch and mock it
      originalFetch = global.fetch;
      fetchMock = jest.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'X-Message-Id': 'msg_123' }),
        text: () => Promise.resolve(''),
      } as Response);
      global.fetch = fetchMock;
    });

    afterEach(() => {
      // Restore original fetch
      global.fetch = originalFetch;
    });

    it('should send email successfully', async () => {
      const result = await adapter.sendEmail('run_123', {
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        textBody: 'Test body',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg_123');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test_api_key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should enforce idempotency - skip duplicate sends', async () => {
      // First send
      await adapter.sendEmail('run_123', {
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        textBody: 'Test body',
      });

      // Second send with same run_id should be skipped
      const result = await adapter.sendEmail('run_123', {
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        textBody: 'Test body',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.idempotent).toBe(true);
      expect(result.metadata?.reason).toBe('Email already sent for this run_id');

      // fetch should only be called once
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should report wasEmailSent correctly', async () => {
      expect(await adapter.wasEmailSent('run_new')).toBe(false);

      await adapter.sendEmail('run_new', {
        to: ['recipient@example.com'],
        subject: 'Test',
        textBody: 'Test',
      });

      expect(await adapter.wasEmailSent('run_new')).toBe(true);
    });

    it('should handle API errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as unknown as Response);

      const result = await adapter.sendEmail('run_error', {
        to: ['recipient@example.com'],
        subject: 'Test',
        textBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SendGrid API error: 401');

      const errorLog = logger.logs.find((l) => l.level === 'error');
      expect(errorLog).toBeDefined();
    });
  });
});

// ============================================================================
// MOTION API ADAPTER TESTS
// ============================================================================

describe('MotionAPIAdapter', () => {
  it('should throw error if API key is not provided', () => {
    expect(() => {
      new MotionAPIAdapter({
        apiKey: '',
        workspaceId: 'workspace_123',
      });
    }).toThrow('Motion API key is required');
  });

  it('should throw error if workspace ID is not provided', () => {
    expect(() => {
      new MotionAPIAdapter({
        apiKey: 'test_api_key',
        workspaceId: '',
      });
    }).toThrow('Motion workspace ID is required');
  });

  describe('with valid configuration', () => {
    let adapter: MotionAPIAdapter;
    let logger: ReturnType<typeof createMockLogger>;
    let originalFetch: typeof global.fetch;
    let fetchMock: jest.Mock;

    beforeEach(() => {
      logger = createMockLogger();
      adapter = new MotionAPIAdapter(
        {
          apiKey: 'test_motion_key',
          workspaceId: 'workspace_123',
        },
        logger
      );

      // Save original fetch and mock it
      originalFetch = global.fetch;
      fetchMock = jest.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'task_456' }),
      } as Response);
      global.fetch = fetchMock;
    });

    afterEach(() => {
      // Restore original fetch
      global.fetch = originalFetch;
    });

    it('should create task successfully', async () => {
      const result = await adapter.createTask({
        title: 'Test Task',
        description: 'Test description',
        priority: 'high',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task_456');
      expect(result.taskUrl).toBe('https://app.usemotion.com/task/task_456');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.usemotion.com/v1/tasks',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'test_motion_key',
            'Content-Type': 'application/json',
          }),
        })
      );

      // Verify payload
      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.name).toBe('Test Task');
      expect(body.description).toBe('Test description');
      expect(body.workspaceId).toBe('workspace_123');
      expect(body.priority).toBe('HIGH');
    });

    it('should handle API errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as unknown as Response);

      const result = await adapter.createTask({
        title: 'Test Task',
        description: 'Test description',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Motion API error: 500');

      const errorLog = logger.logs.find((l) => l.level === 'error');
      expect(errorLog).toBeDefined();
    });
  });
});

// ============================================================================
// DELIVERY ORCHESTRATOR TESTS
// ============================================================================

describe('executeDeliveries', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let storage: ReturnType<typeof createMockStorageAdapter>;
  let brief: DealPrepBrief;
  let input: CanonicalInput;
  let rendered: RenderedOutputs;

  beforeEach(() => {
    logger = createMockLogger();
    storage = createMockStorageAdapter();
    brief = createTestBrief();
    input = createTestInput();
    rendered = createTestRenderedOutputs();
  });

  it('should execute all deliveries independently using Promise.allSettled', async () => {
    const mockCRM: CRMAdapter = {
      upsertOrganization: jest.fn<CRMAdapter['upsertOrganization']>().mockResolvedValue({ success: true, entityId: 'org_123' }),
      upsertContact: jest.fn<CRMAdapter['upsertContact']>().mockResolvedValue({ success: true, entityId: 'contact_123' }),
      associateContactToOrganization: jest.fn<CRMAdapter['associateContactToOrganization']>().mockResolvedValue({ success: true }),
      attachBrief: jest.fn<CRMAdapter['attachBrief']>().mockResolvedValue({ success: true }),
      recordRunMetadata: jest.fn<CRMAdapter['recordRunMetadata']>().mockResolvedValue({ success: true }),
    };

    const mockEmail: EmailAdapter = {
      sendEmail: jest.fn<EmailAdapter['sendEmail']>().mockResolvedValue({ success: true, messageId: 'msg_123' }),
      wasEmailSent: jest.fn<EmailAdapter['wasEmailSent']>().mockResolvedValue(false),
    };

    const mockMotion: MotionAdapter = {
      createTask: jest.fn<MotionAdapter['createTask']>().mockResolvedValue({ success: true, taskId: 'task_123' }),
    };

    const result = await executeDeliveries(
      'run_test_12345',
      brief,
      input,
      rendered,
      { crm: mockCRM, email: mockEmail, motion: mockMotion },
      storage,
      logger
    );

    // All deliveries should succeed
    expect(result.deliveries.customer_relationship_management.status).toBe('success');
    expect(result.deliveries.email.status).toBe('success');
    expect(result.deliveries.motion.status).toBe('success');

    // All adapters should be called
    expect(mockCRM.upsertOrganization).toHaveBeenCalled();
    expect(mockEmail.sendEmail).toHaveBeenCalled();
    expect(mockMotion.createTask).toHaveBeenCalled();

    // Status should be persisted
    expect(storage.save).toHaveBeenCalledWith(
      'run_test_12345',
      'delivery_status',
      expect.any(String),
      expect.any(Object)
    );
  });

  it('should not block other deliveries when one fails (Section 11.3)', async () => {
    const mockCRM: CRMAdapter = {
      upsertOrganization: jest.fn<CRMAdapter['upsertOrganization']>().mockResolvedValue({ success: false, error: 'CRM API Error' }),
      upsertContact: jest.fn<CRMAdapter['upsertContact']>().mockResolvedValue({ success: true }),
      associateContactToOrganization: jest.fn<CRMAdapter['associateContactToOrganization']>().mockResolvedValue({ success: true }),
      attachBrief: jest.fn<CRMAdapter['attachBrief']>().mockResolvedValue({ success: true }),
      recordRunMetadata: jest.fn<CRMAdapter['recordRunMetadata']>().mockResolvedValue({ success: true }),
    };

    const mockEmail: EmailAdapter = {
      sendEmail: jest.fn<EmailAdapter['sendEmail']>().mockResolvedValue({ success: true, messageId: 'msg_123' }),
      wasEmailSent: jest.fn<EmailAdapter['wasEmailSent']>().mockResolvedValue(false),
    };

    const mockMotion: MotionAdapter = {
      createTask: jest.fn<MotionAdapter['createTask']>().mockResolvedValue({ success: true, taskId: 'task_123' }),
    };

    const result = await executeDeliveries(
      'run_test_12345',
      brief,
      input,
      rendered,
      { crm: mockCRM, email: mockEmail, motion: mockMotion },
      storage,
      logger
    );

    // CRM should fail, but others succeed
    expect(result.deliveries.customer_relationship_management.status).toBe('failed');
    expect(result.deliveries.customer_relationship_management.error).toBe('CRM API Error');
    expect(result.deliveries.email.status).toBe('success');
    expect(result.deliveries.motion.status).toBe('success');
  });

  it('should handle missing email recipients', async () => {
    const inputWithoutEmail = { ...input, routing: { ...input.routing, email_to: null } };

    const mockCRM = new NullCRMAdapter(logger);
    const mockEmail = new NullEmailAdapter(logger);
    const mockMotion = new NullMotionAdapter(logger);

    const result = await executeDeliveries(
      'run_test_12345',
      brief,
      inputWithoutEmail,
      rendered,
      { crm: mockCRM, email: mockEmail, motion: mockMotion },
      storage,
      logger
    );

    // Email should fail due to no recipients
    expect(result.deliveries.email.status).toBe('failed');
    expect(result.deliveries.email.error).toBe('No email recipients configured');
  });

  it('should handle missing domain for CRM', async () => {
    const inputWithoutDomain = {
      ...input,
      organization: { ...input.organization, domain: null, website: null },
    };

    const mockCRM = new NullCRMAdapter(logger);
    const mockEmail = new NullEmailAdapter(logger);
    const mockMotion = new NullMotionAdapter(logger);

    const result = await executeDeliveries(
      'run_test_12345',
      brief,
      inputWithoutDomain,
      rendered,
      { crm: mockCRM, email: mockEmail, motion: mockMotion },
      storage,
      logger
    );

    expect(result.deliveries.customer_relationship_management.status).toBe('failed');
    expect(result.deliveries.customer_relationship_management.error).toBe('No domain available for CRM upsert');
  });

  it('should handle adapter throwing exceptions', async () => {
    const mockCRM: CRMAdapter = {
      upsertOrganization: jest.fn<CRMAdapter['upsertOrganization']>().mockRejectedValue(new Error('Unexpected CRM error')),
      upsertContact: jest.fn<CRMAdapter['upsertContact']>(),
      associateContactToOrganization: jest.fn<CRMAdapter['associateContactToOrganization']>(),
      attachBrief: jest.fn<CRMAdapter['attachBrief']>(),
      recordRunMetadata: jest.fn<CRMAdapter['recordRunMetadata']>(),
    };

    const mockEmail: EmailAdapter = {
      sendEmail: jest.fn<EmailAdapter['sendEmail']>().mockRejectedValue(new Error('Unexpected Email error')),
      wasEmailSent: jest.fn<EmailAdapter['wasEmailSent']>().mockResolvedValue(false),
    };

    const mockMotion: MotionAdapter = {
      createTask: jest.fn<MotionAdapter['createTask']>().mockRejectedValue(new Error('Unexpected Motion error')),
    };

    const result = await executeDeliveries(
      'run_test_12345',
      brief,
      input,
      rendered,
      { crm: mockCRM, email: mockEmail, motion: mockMotion },
      storage,
      logger
    );

    // All should fail but not throw
    expect(result.deliveries.customer_relationship_management.status).toBe('failed');
    expect(result.deliveries.email.status).toBe('failed');
    expect(result.deliveries.motion.status).toBe('failed');
  });

  it('should persist delivery status to storage', async () => {
    const mockCRM = new NullCRMAdapter(logger);
    const mockEmail = new NullEmailAdapter(logger);
    const mockMotion = new NullMotionAdapter(logger);

    await executeDeliveries(
      'run_test_12345',
      brief,
      input,
      rendered,
      { crm: mockCRM, email: mockEmail, motion: mockMotion },
      storage,
      logger
    );

    expect(storage.save).toHaveBeenCalledWith(
      'run_test_12345',
      'delivery_status',
      expect.any(String),
      expect.objectContaining({
        contentType: 'application/json',
      })
    );

    // Verify the saved content is valid JSON
    const savedContent = storage.saved[0]?.content;
    expect(() => JSON.parse(savedContent ?? '')).not.toThrow();

    const savedStatus = JSON.parse(savedContent ?? '{}') as DeliveryStatus;
    expect(savedStatus.deliveries).toBeDefined();
    expect(savedStatus.deliveries.customer_relationship_management).toBeDefined();
    expect(savedStatus.deliveries.email).toBeDefined();
    expect(savedStatus.deliveries.motion).toBeDefined();
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('createInitialDeliveryStatus', () => {
  it('should create initial status with all channels as not_attempted', () => {
    const status = createInitialDeliveryStatus();

    expect(status.deliveries.customer_relationship_management.status).toBe('not_attempted');
    expect(status.deliveries.customer_relationship_management.attempted_at).toBeNull();
    expect(status.deliveries.customer_relationship_management.error).toBeNull();

    expect(status.deliveries.email.status).toBe('not_attempted');
    expect(status.deliveries.email.attempted_at).toBeNull();
    expect(status.deliveries.email.error).toBeNull();

    expect(status.deliveries.motion.status).toBe('not_attempted');
    expect(status.deliveries.motion.attempted_at).toBeNull();
    expect(status.deliveries.motion.error).toBeNull();
  });
});

describe('calculateDeliveryMetrics', () => {
  it('should calculate correct metrics for mixed results', () => {
    const status: DeliveryStatus = {
      deliveries: {
        customer_relationship_management: { status: 'success', attempted_at: '2024-01-15T10:00:00Z', error: null },
        email: { status: 'failed', attempted_at: '2024-01-15T10:00:00Z', error: 'Some error' },
        motion: { status: 'not_attempted', attempted_at: null, error: null },
      },
    };

    const startTime = Date.now() - 1000; // 1 second ago
    const metrics = calculateDeliveryMetrics('run_123', status, startTime);

    expect(metrics.runId).toBe('run_123');
    expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(1000);
    expect(metrics.crmStatus).toBe('success');
    expect(metrics.emailStatus).toBe('failed');
    expect(metrics.motionStatus).toBe('not_attempted');
    expect(metrics.successCount).toBe(1);
    expect(metrics.failureCount).toBe(1);
    expect(metrics.notAttemptedCount).toBe(1);
  });

  it('should calculate correct metrics for all success', () => {
    const status: DeliveryStatus = {
      deliveries: {
        customer_relationship_management: { status: 'success', attempted_at: '2024-01-15T10:00:00Z', error: null },
        email: { status: 'success', attempted_at: '2024-01-15T10:00:00Z', error: null },
        motion: { status: 'success', attempted_at: '2024-01-15T10:00:00Z', error: null },
      },
    };

    const metrics = calculateDeliveryMetrics('run_123', status, Date.now());

    expect(metrics.successCount).toBe(3);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.notAttemptedCount).toBe(0);
  });
});

describe('extractDomain', () => {
  it('should extract domain from full URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
  });

  it('should handle URLs without www', () => {
    expect(extractDomain('https://example.com')).toBe('example.com');
  });

  it('should handle URLs without protocol', () => {
    expect(extractDomain('example.com')).toBe('example.com');
  });

  it('should handle URLs with www prefix', () => {
    expect(extractDomain('www.example.com')).toBe('example.com');
  });

  it('should return empty string for invalid URLs', () => {
    expect(extractDomain('')).toBe('');
    expect(extractDomain('not a url')).toBe('');
  });

  it('should handle subdomains', () => {
    expect(extractDomain('https://subdomain.example.com')).toBe('subdomain.example.com');
  });
});

// ============================================================================
// MOCK CRM ADAPTER FOR INTEGRATION TESTS
// ============================================================================

describe('Mock CRM Adapter for Integration Testing', () => {
  /**
   * Example of creating a fully mock CRM adapter for testing.
   * This can be used in integration tests to verify the full delivery flow.
   */
  class MockCRMAdapter implements CRMAdapter {
    public calls: Array<{ method: string; args: unknown[] }> = [];
    public orgIdCounter = 0;
    public contactIdCounter = 0;

    async upsertOrganization(domain: string, data: OrgData): Promise<CRMResult> {
      this.calls.push({ method: 'upsertOrganization', args: [domain, data] });
      this.orgIdCounter++;
      return { success: true, entityId: `org_${this.orgIdCounter}`, entityType: 'organization' };
    }

    async upsertContact(email: string, data: ContactData): Promise<CRMResult> {
      this.calls.push({ method: 'upsertContact', args: [email, data] });
      this.contactIdCounter++;
      return { success: true, entityId: `contact_${this.contactIdCounter}`, entityType: 'contact' };
    }

    async associateContactToOrganization(contactId: string, orgId: string): Promise<CRMResult> {
      this.calls.push({ method: 'associateContactToOrganization', args: [contactId, orgId] });
      return { success: true };
    }

    async attachBrief(orgId: string, briefMarkdown: string, briefUrl: string): Promise<CRMResult> {
      this.calls.push({ method: 'attachBrief', args: [orgId, briefMarkdown, briefUrl] });
      return { success: true, entityType: 'note' };
    }

    async recordRunMetadata(orgId: string, runId: string, metadata: RunMeta): Promise<CRMResult> {
      this.calls.push({ method: 'recordRunMetadata', args: [orgId, runId, metadata] });
      return { success: true };
    }
  }

  it('should track all CRM operations in order', async () => {
    const mockCRM = new MockCRMAdapter();
    const mockEmail = new NullEmailAdapter();
    const mockMotion = new NullMotionAdapter();
    const logger = createMockLogger();
    const storage = createMockStorageAdapter();

    const brief = createTestBrief();
    const input = createTestInput();
    const rendered = createTestRenderedOutputs();

    await executeDeliveries(
      'run_test_12345',
      brief,
      input,
      rendered,
      { crm: mockCRM, email: mockEmail, motion: mockMotion },
      storage,
      logger
    );

    // Verify all CRM methods were called
    const methods = mockCRM.calls.map((c) => c.method);
    expect(methods).toContain('upsertOrganization');
    expect(methods).toContain('upsertContact');
    expect(methods).toContain('associateContactToOrganization');
    expect(methods).toContain('attachBrief');
    expect(methods).toContain('recordRunMetadata');

    // Verify upsertOrganization was called with correct data
    const orgCall = mockCRM.calls.find((c) => c.method === 'upsertOrganization');
    expect(orgCall?.args[0]).toBe('example.com');
  });
});
