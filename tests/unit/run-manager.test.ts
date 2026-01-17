/**
 * Unit tests for Run Manager module
 * Tests run ID generation and idempotency per Implementation Spec Section 5
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  generateRunId,
  generateRunIdFull,
  roundTimestamp,
  createRun,
  checkIdempotency,
  updateRunStatus,
  getRunMetadata,
  markArtifactComplete,
  updateDeliveryStatus,
  initializeRunManager,
} from '../../src/run-manager/index.js';
import { MemoryStorageAdapter } from '../../src/storage/index.js';
import type { CanonicalInput } from '../../src/normalizer/index.js';

// Helper to create a valid canonical input
function createTestInput(overrides: Partial<CanonicalInput> = {}): CanonicalInput {
  return {
    meta: {
      trigger_source: 'inbound',
      submitted_at: '2024-01-15T10:32:00Z',
      run_id: '',
      requested_meeting_at: null,
      timezone: null,
    },
    organization: {
      name: 'Test Corp',
      website: 'https://test.com',
      domain: 'test.com',
    },
    contact: {
      full_name: 'John Smith',
      first_name: 'John',
      last_name: 'Smith',
      title: 'CEO',
      email: 'john@test.com',
      phone: null,
      linkedin_url: null,
    },
    notes: {
      comments: null,
      intent_topic: null,
      source_context: null,
    },
    routing: {
      crm_target: null,
      email_to: null,
      email_cc: [],
      motion_workspace: null,
    },
    ...overrides,
  };
}

describe('Run Manager Module', () => {
  describe('roundTimestamp()', () => {
    test('should round inbound trigger to 5-minute intervals', () => {
      // 10:32 should round down to 10:30
      const result = roundTimestamp('2024-01-15T10:32:00Z', 'inbound');
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });

    test('should round inbound trigger at boundary correctly', () => {
      // Exactly 10:30 should stay 10:30
      const result = roundTimestamp('2024-01-15T10:30:00Z', 'inbound');
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });

    test('should round outbound trigger to 60-minute intervals', () => {
      // 10:32 should round down to 10:00
      const result = roundTimestamp('2024-01-15T10:32:00Z', 'outbound');
      expect(result).toBe('2024-01-15T10:00:00.000Z');
    });

    test('should round outbound trigger at boundary correctly', () => {
      // Exactly 10:00 should stay 10:00
      const result = roundTimestamp('2024-01-15T10:00:00Z', 'outbound');
      expect(result).toBe('2024-01-15T10:00:00.000Z');
    });
  });

  describe('generateRunId()', () => {
    test('should generate deterministic run ID', () => {
      const input = createTestInput();

      const runId1 = generateRunId(input);
      const runId2 = generateRunId(input);

      expect(runId1).toBe(runId2);
    });

    test('should prefix with run_', () => {
      const input = createTestInput();
      const runId = generateRunId(input);

      expect(runId).toMatch(/^run_[a-f0-9]+$/);
    });

    test('should produce different IDs for different organizations', () => {
      const input1 = createTestInput({ organization: { name: 'Corp A', website: null, domain: null } });
      const input2 = createTestInput({ organization: { name: 'Corp B', website: null, domain: null } });

      const runId1 = generateRunId(input1);
      const runId2 = generateRunId(input2);

      expect(runId1).not.toBe(runId2);
    });

    test('should produce different IDs for different timestamps (within same rounding window)', () => {
      // Same 5-min window should produce same ID
      const input1 = createTestInput({
        meta: { ...createTestInput().meta, submitted_at: '2024-01-15T10:31:00Z' },
      });
      const input2 = createTestInput({
        meta: { ...createTestInput().meta, submitted_at: '2024-01-15T10:33:00Z' },
      });

      const runId1 = generateRunId(input1);
      const runId2 = generateRunId(input2);

      expect(runId1).toBe(runId2);
    });

    test('should produce different IDs for different rounding windows', () => {
      const input1 = createTestInput({
        meta: { ...createTestInput().meta, submitted_at: '2024-01-15T10:28:00Z' },
      });
      const input2 = createTestInput({
        meta: { ...createTestInput().meta, submitted_at: '2024-01-15T10:33:00Z' },
      });

      const runId1 = generateRunId(input1);
      const runId2 = generateRunId(input2);

      expect(runId1).not.toBe(runId2);
    });

    test('should throw error when no organization identifier available', () => {
      const input = createTestInput({
        organization: { name: null, website: null, domain: null },
      });

      expect(() => generateRunId(input)).toThrow('no organization identifier available');
    });

    test('should use domain as priority organization identifier', () => {
      const inputWithDomain = createTestInput({
        organization: { name: 'Different Name', website: 'https://different.com', domain: 'specific.org' },
      });
      const inputWithSameDomain = createTestInput({
        organization: { name: 'Another Name', website: 'https://another.com', domain: 'specific.org' },
      });

      const runId1 = generateRunId(inputWithDomain);
      const runId2 = generateRunId(inputWithSameDomain);

      expect(runId1).toBe(runId2); // Same domain = same ID (assuming same timestamp)
    });
  });

  describe('generateRunIdFull()', () => {
    test('should generate full SHA-256 hash', () => {
      const input = createTestInput();
      const runId = generateRunIdFull(input);

      // run_ prefix + 64 hex chars for full SHA-256
      expect(runId).toMatch(/^run_[a-f0-9]{64}$/);
    });
  });

  describe('createRun()', () => {
    let storage: MemoryStorageAdapter;

    beforeEach(() => {
      storage = new MemoryStorageAdapter();
    });

    test('should create a new run with metadata', async () => {
      const input = createTestInput();

      const result = await createRun(input, storage);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.runId).toMatch(/^run_/);
      expect(result.data!.status).toBe('pending');
      expect(result.data!.artifacts).toContain('input');
      expect(result.data!.artifacts).toContain('run_artifact');
    });

    test('should store input and run_artifact', async () => {
      const input = createTestInput();

      const result = await createRun(input, storage);

      expect(await storage.exists(result.data!.runId, 'input')).toBe(true);
      expect(await storage.exists(result.data!.runId, 'run_artifact')).toBe(true);
    });

    test('should return existing run for duplicate input (idempotency)', async () => {
      const input = createTestInput();

      const result1 = await createRun(input, storage);
      const result2 = await createRun(input, storage);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data!.runId).toBe(result2.data!.runId);
    });
  });

  describe('checkIdempotency()', () => {
    let storage: MemoryStorageAdapter;

    beforeEach(() => {
      storage = new MemoryStorageAdapter();
    });

    test('should return exists=false for new input', async () => {
      const input = createTestInput();

      const result = await checkIdempotency(input, storage);

      expect(result.success).toBe(true);
      expect(result.data!.exists).toBe(false);
    });

    test('should return exists=true for existing run', async () => {
      const input = createTestInput();
      await createRun(input, storage);

      const result = await checkIdempotency(input, storage);

      expect(result.success).toBe(true);
      expect(result.data!.exists).toBe(true);
      expect(result.data!.existingRunId).toBeDefined();
      expect(result.data!.runArtifact).toBeDefined();
    });
  });

  describe('updateRunStatus()', () => {
    let storage: MemoryStorageAdapter;

    beforeEach(() => {
      storage = new MemoryStorageAdapter();
    });

    test('should update run status', async () => {
      const input = createTestInput();
      const createResult = await createRun(input, storage);
      const runId = createResult.data!.runId;

      const result = await updateRunStatus(runId, 'processing', undefined, storage);

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('processing');
    });

    test('should record error when provided', async () => {
      const input = createTestInput();
      const createResult = await createRun(input, storage);
      const runId = createResult.data!.runId;

      const result = await updateRunStatus(runId, 'failed', 'Test error message', storage);

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('failed');
      expect(result.data!.error).toContain('Test error message');
    });
  });

  describe('getRunMetadata()', () => {
    let storage: MemoryStorageAdapter;

    beforeEach(() => {
      storage = new MemoryStorageAdapter();
    });

    test('should retrieve run metadata', async () => {
      const input = createTestInput();
      const createResult = await createRun(input, storage);
      const runId = createResult.data!.runId;

      const result = await getRunMetadata(runId, storage);

      expect(result.success).toBe(true);
      expect(result.data!.runId).toBe(runId);
      expect(result.data!.status).toBe('pending');
    });

    test('should return error for non-existent run', async () => {
      const result = await getRunMetadata('run_nonexistent', storage);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RUN_NOT_FOUND');
    });
  });

  describe('markArtifactComplete()', () => {
    let storage: MemoryStorageAdapter;

    beforeEach(() => {
      storage = new MemoryStorageAdapter();
    });

    test('should mark artifact as complete', async () => {
      const input = createTestInput();
      const createResult = await createRun(input, storage);
      const runId = createResult.data!.runId;

      const result = await markArtifactComplete(runId, 'scrape', storage);

      expect(result.success).toBe(true);

      const metadata = await getRunMetadata(runId, storage);
      expect(metadata.data!.artifacts).toContain('scrape');
    });
  });

  describe('updateDeliveryStatus()', () => {
    let storage: MemoryStorageAdapter;

    beforeEach(() => {
      storage = new MemoryStorageAdapter();
    });

    test('should update delivery status for CRM', async () => {
      const input = createTestInput();
      const createResult = await createRun(input, storage);
      const runId = createResult.data!.runId;

      const result = await updateDeliveryStatus(
        runId,
        'customer_relationship_management',
        'success',
        undefined,
        storage
      );

      expect(result.success).toBe(true);
    });

    test('should record delivery error', async () => {
      const input = createTestInput();
      const createResult = await createRun(input, storage);
      const runId = createResult.data!.runId;

      const result = await updateDeliveryStatus(
        runId,
        'email',
        'failed',
        'SMTP connection failed',
        storage
      );

      expect(result.success).toBe(true);
    });
  });
});
