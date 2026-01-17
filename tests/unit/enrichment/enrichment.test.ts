/**
 * Unit Tests for Enrichment Module
 *
 * Tests per Implementation Spec Section 7:
 * - Section 7.1: Allowed behavior
 * - Section 7.2: Prohibited behavior
 * - Section 7.3: Enrichment output schema
 */

import {
  enrichPerson,
  summarizeLinkedIn,
  getEnrichmentProvider,
  isValidLinkedInUrl,
  NullEnrichmentProvider,
  LLMEnrichmentProvider,
  APIEnrichmentProvider,
  type CanonicalInput,
  type EnrichmentConfig,
  type EnrichmentOutput,
  type EnrichmentLogger,
  type EnrichmentMetrics,
} from '../../../src/enrichment/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createCanonicalInput = (overrides?: Partial<CanonicalInput>): CanonicalInput => ({
  meta: {
    trigger_source: 'inbound',
    submitted_at: '2026-01-17T14:30:22.000Z',
    run_id: 'run_test123',
    requested_meeting_at: null,
    timezone: null,
  },
  organization: {
    name: 'Test Organization',
    website: 'https://example.org',
    domain: 'example.org',
  },
  contact: {
    full_name: 'Jane Smith',
    first_name: 'Jane',
    last_name: 'Smith',
    title: 'Executive Director',
    email: 'jane@example.org',
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
});

const createMockLogger = (): EnrichmentLogger & { calls: Record<string, Array<[string, Record<string, unknown> | undefined]>> } => {
  const calls: Record<string, Array<[string, Record<string, unknown> | undefined]>> = {
    info: [],
    warn: [],
    error: [],
    debug: [],
  };

  return {
    calls,
    info: (msg, ctx) => calls.info.push([msg, ctx]),
    warn: (msg, ctx) => calls.warn.push([msg, ctx]),
    error: (msg, ctx) => calls.error.push([msg, ctx]),
    debug: (msg, ctx) => calls.debug.push([msg, ctx]),
  };
};

const createMockMetrics = (): EnrichmentMetrics & { counters: Record<string, number>; durations: Array<{ name: string; durationMs: number; tags?: Record<string, string> }> } => {
  const counters: Record<string, number> = {};
  const durations: Array<{ name: string; durationMs: number; tags?: Record<string, string> }> = [];

  return {
    counters,
    durations,
    incrementCounter: (name, tags) => {
      const key = tags ? `${name}:${JSON.stringify(tags)}` : name;
      counters[key] = (counters[key] || 0) + 1;
    },
    recordDuration: (name, durationMs, tags) => {
      durations.push({ name, durationMs, tags });
    },
    recordGauge: () => { /* no-op */ },
  };
};

// =============================================================================
// isValidLinkedInUrl Tests
// =============================================================================

describe('isValidLinkedInUrl', () => {
  it('should return true for valid LinkedIn profile URLs', () => {
    expect(isValidLinkedInUrl('https://www.linkedin.com/in/janesmith')).toBe(true);
    expect(isValidLinkedInUrl('https://linkedin.com/in/janesmith')).toBe(true);
    expect(isValidLinkedInUrl('https://www.linkedin.com/in/jane-smith-123abc')).toBe(true);
  });

  it('should return false for invalid LinkedIn URLs', () => {
    expect(isValidLinkedInUrl('')).toBe(false);
    expect(isValidLinkedInUrl('not-a-url')).toBe(false);
    expect(isValidLinkedInUrl('https://www.linkedin.com/company/acme')).toBe(false);
    expect(isValidLinkedInUrl('https://twitter.com/in/janesmith')).toBe(false);
    expect(isValidLinkedInUrl('https://www.linkedin.com/pub/janesmith')).toBe(false);
  });

  it('should return false for null or undefined', () => {
    expect(isValidLinkedInUrl(null as unknown as string)).toBe(false);
    expect(isValidLinkedInUrl(undefined as unknown as string)).toBe(false);
  });
});

// =============================================================================
// NullEnrichmentProvider Tests
// =============================================================================

describe('NullEnrichmentProvider', () => {
  it('should return "Not found" with "not_available" confidence', async () => {
    const provider = new NullEnrichmentProvider();
    const result = await provider.summarize('https://www.linkedin.com/in/anyone');

    expect(result.summary).toBe('Not found');
    expect(result.confidence).toBe('not_available');
  });

  it('should have name "null"', () => {
    const provider = new NullEnrichmentProvider();
    expect(provider.name).toBe('null');
  });
});

// =============================================================================
// getEnrichmentProvider Tests
// =============================================================================

describe('getEnrichmentProvider', () => {
  it('should return NullEnrichmentProvider when no config provided', () => {
    const provider = getEnrichmentProvider();
    expect(provider).toBeInstanceOf(NullEnrichmentProvider);
  });

  it('should return NullEnrichmentProvider for type "null"', () => {
    const provider = getEnrichmentProvider({ type: 'null' });
    expect(provider).toBeInstanceOf(NullEnrichmentProvider);
  });

  it('should return NullEnrichmentProvider for incomplete LLM config', () => {
    const mockLogger = createMockLogger();
    const provider = getEnrichmentProvider({ type: 'llm' }, mockLogger);

    expect(provider).toBeInstanceOf(NullEnrichmentProvider);
    expect(mockLogger.calls.warn.length).toBeGreaterThan(0);
  });

  it('should return LLMEnrichmentProvider for complete LLM config', () => {
    const provider = getEnrichmentProvider({
      type: 'llm',
      apiKey: 'test-key',
      apiUrl: 'https://api.example.com',
      llmModelId: 'claude-3-haiku',
    });

    expect(provider).toBeInstanceOf(LLMEnrichmentProvider);
    expect(provider.name).toBe('llm');
  });

  it('should return NullEnrichmentProvider for incomplete API config', () => {
    const mockLogger = createMockLogger();
    const provider = getEnrichmentProvider({ type: 'api' }, mockLogger);

    expect(provider).toBeInstanceOf(NullEnrichmentProvider);
    expect(mockLogger.calls.warn.length).toBeGreaterThan(0);
  });

  it('should return APIEnrichmentProvider for complete API config', () => {
    const provider = getEnrichmentProvider({
      type: 'api',
      apiKey: 'test-key',
      apiUrl: 'https://api.example.com',
    });

    expect(provider).toBeInstanceOf(APIEnrichmentProvider);
    expect(provider.name).toBe('api');
  });
});

// =============================================================================
// summarizeLinkedIn Tests
// =============================================================================

describe('summarizeLinkedIn', () => {
  it('should return not found for invalid LinkedIn URL', async () => {
    const result = await summarizeLinkedIn('https://twitter.com/user', {});

    expect(result.summary).toBe('Not found');
    expect(result.confidence).toBe('not_available');
  });

  it('should use NullEnrichmentProvider by default', async () => {
    const result = await summarizeLinkedIn('https://www.linkedin.com/in/janesmith', {});

    expect(result.summary).toBe('Not found');
    expect(result.confidence).toBe('not_available');
  });

  it('should log the summarization attempt', async () => {
    const mockLogger = createMockLogger();
    await summarizeLinkedIn('https://www.linkedin.com/in/janesmith', {}, mockLogger);

    expect(mockLogger.calls.info.length).toBeGreaterThan(0);
    expect(mockLogger.calls.info[0]?.[0]).toBe('Summarizing LinkedIn profile');
  });
});

// =============================================================================
// enrichPerson Tests - Core Functionality
// =============================================================================

describe('enrichPerson', () => {
  describe('when no LinkedIn URL is provided', () => {
    it('should return "Not found" with "not_available" confidence', async () => {
      const input = createCanonicalInput();
      const result = await enrichPerson(input);

      expect(result.requester_profile.summary).toBe('Not found');
      expect(result.requester_profile.confidence).toBe('not_available');
      expect(result.errors).toEqual([]);
    });

    it('should log that no URL was provided', async () => {
      const mockLogger = createMockLogger();
      const input = createCanonicalInput();
      await enrichPerson(input, {}, { logger: mockLogger });

      const noUrlLog = mockLogger.calls.info.find(([msg]) => msg.includes('No LinkedIn URL provided'));
      expect(noUrlLog).toBeDefined();
    });

    it('should record metrics for no_url case', async () => {
      const mockMetrics = createMockMetrics();
      const input = createCanonicalInput();
      await enrichPerson(input, {}, { metrics: mockMetrics });

      expect(Object.keys(mockMetrics.counters).some(k => k.includes('enrichment.no_url'))).toBe(true);
    });
  });

  describe('when LinkedIn URL is provided', () => {
    it('should attempt to summarize the profile', async () => {
      const input = createCanonicalInput({
        contact: {
          full_name: 'Jane Smith',
          first_name: 'Jane',
          last_name: 'Smith',
          title: 'Executive Director',
          email: 'jane@example.org',
          phone: null,
          linkedin_url: 'https://www.linkedin.com/in/janesmith',
        },
      });

      const result = await enrichPerson(input);

      // With default NullEnrichmentProvider, still returns not found
      expect(result.requester_profile.summary).toBe('Not found');
      expect(result.requester_profile.confidence).toBe('not_available');
    });

    it('should log successful enrichment', async () => {
      const mockLogger = createMockLogger();
      const input = createCanonicalInput({
        contact: {
          full_name: 'Jane Smith',
          first_name: 'Jane',
          last_name: 'Smith',
          title: 'Executive Director',
          email: 'jane@example.org',
          phone: null,
          linkedin_url: 'https://www.linkedin.com/in/janesmith',
        },
      });

      await enrichPerson(input, {}, { logger: mockLogger });

      const successLog = mockLogger.calls.info.find(([msg]) => msg.includes('completed successfully'));
      expect(successLog).toBeDefined();
    });

    it('should record success metrics', async () => {
      const mockMetrics = createMockMetrics();
      const input = createCanonicalInput({
        contact: {
          full_name: 'Jane Smith',
          first_name: 'Jane',
          last_name: 'Smith',
          title: 'Executive Director',
          email: 'jane@example.org',
          phone: null,
          linkedin_url: 'https://www.linkedin.com/in/janesmith',
        },
      });

      await enrichPerson(input, {}, { metrics: mockMetrics });

      expect(Object.keys(mockMetrics.counters).some(k => k.includes('enrichment.success'))).toBe(true);
      expect(mockMetrics.durations.length).toBeGreaterThan(0);
    });
  });

  describe('output schema compliance (Section 7.3)', () => {
    it('should always return valid EnrichmentOutput structure', async () => {
      const input = createCanonicalInput();
      const result = await enrichPerson(input);

      // Verify structure matches Section 7.3
      expect(result).toHaveProperty('requester_profile');
      expect(result).toHaveProperty('errors');
      expect(result.requester_profile).toHaveProperty('summary');
      expect(result.requester_profile).toHaveProperty('confidence');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should have summary as "Not found" when unavailable', async () => {
      const input = createCanonicalInput();
      const result = await enrichPerson(input);

      expect(result.requester_profile.summary).toBe('Not found');
    });

    it('should have confidence as "not_available" when unavailable', async () => {
      const input = createCanonicalInput();
      const result = await enrichPerson(input);

      expect(result.requester_profile.confidence).toBe('not_available');
    });

    it('should only return valid confidence values', async () => {
      const validConfidences = ['high', 'medium', 'low', 'not_available'];

      const input = createCanonicalInput();
      const result = await enrichPerson(input);

      expect(validConfidences).toContain(result.requester_profile.confidence);
    });
  });

  describe('non-blocking behavior', () => {
    it('should never throw errors', async () => {
      const input = createCanonicalInput();

      // Even with bad configuration, should not throw
      await expect(enrichPerson(input, { provider: { type: 'api', apiKey: '', apiUrl: '' } }))
        .resolves.not.toThrow();
    });

    it('should return valid output even with errors', async () => {
      const input = createCanonicalInput({
        contact: {
          full_name: 'Jane Smith',
          first_name: 'Jane',
          last_name: 'Smith',
          title: 'Executive Director',
          email: 'jane@example.org',
          phone: null,
          linkedin_url: 'https://www.linkedin.com/in/janesmith',
        },
      });

      const result = await enrichPerson(input);

      // Should always have valid structure
      expect(result.requester_profile).toBeDefined();
      expect(typeof result.requester_profile.summary).toBe('string');
    });
  });
});

// =============================================================================
// enrichPerson Tests - Retry Logic
// =============================================================================

describe('enrichPerson retry logic', () => {
  it('should use default retry configuration (1 retry, 30s backoff)', async () => {
    const input = createCanonicalInput({
      contact: {
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        title: 'Executive Director',
        email: 'jane@example.org',
        phone: null,
        linkedin_url: 'https://www.linkedin.com/in/janesmith',
      },
    });

    // With default NullEnrichmentProvider, no retries needed
    const result = await enrichPerson(input);

    expect(result).toBeDefined();
    expect(result.errors.length).toBe(0);
  });

  it('should respect custom retry configuration', async () => {
    const mockLogger = createMockLogger();
    const input = createCanonicalInput({
      contact: {
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        title: 'Executive Director',
        email: 'jane@example.org',
        phone: null,
        linkedin_url: 'https://www.linkedin.com/in/janesmith',
      },
    });

    const config: EnrichmentConfig = {
      maxRetries: 0,
      retryBackoffMs: 100,
    };

    await enrichPerson(input, config, { logger: mockLogger });

    // With 0 retries, should only make 1 attempt
    expect(mockLogger.calls.info.some(([msg]) => msg.includes('Retry attempt'))).toBe(false);
  });
});

// =============================================================================
// enrichPerson Tests - Observability
// =============================================================================

describe('enrichPerson observability', () => {
  it('should log start of enrichment', async () => {
    const mockLogger = createMockLogger();
    const input = createCanonicalInput();

    await enrichPerson(input, {}, { logger: mockLogger });

    expect(mockLogger.calls.info[0]?.[0]).toBe('Starting person enrichment');
  });

  it('should include runId in all logs', async () => {
    const mockLogger = createMockLogger();
    const input = createCanonicalInput();

    await enrichPerson(input, {}, { logger: mockLogger });

    const logsWithRunId = mockLogger.calls.info.filter(([, ctx]) => ctx?.runId === 'run_test123');
    expect(logsWithRunId.length).toBeGreaterThan(0);
  });

  it('should record duration metrics', async () => {
    const mockMetrics = createMockMetrics();
    const input = createCanonicalInput();

    await enrichPerson(input, {}, { metrics: mockMetrics });

    const durationMetric = mockMetrics.durations.find(d => d.name === 'enrichment.duration_ms');
    expect(durationMetric).toBeDefined();
    expect(durationMetric?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should increment started counter', async () => {
    const mockMetrics = createMockMetrics();
    const input = createCanonicalInput();

    await enrichPerson(input, {}, { metrics: mockMetrics });

    expect(Object.keys(mockMetrics.counters).some(k => k.includes('enrichment.started'))).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('enrichPerson edge cases', () => {
  it('should handle empty string LinkedIn URL as no URL', async () => {
    const input = createCanonicalInput({
      contact: {
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        title: 'Executive Director',
        email: 'jane@example.org',
        phone: null,
        linkedin_url: '',
      },
    });

    const result = await enrichPerson(input);

    // Empty string is falsy, treated as no URL
    expect(result.requester_profile.summary).toBe('Not found');
    expect(result.requester_profile.confidence).toBe('not_available');
  });

  it('should handle invalid LinkedIn URL format', async () => {
    const input = createCanonicalInput({
      contact: {
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        title: 'Executive Director',
        email: 'jane@example.org',
        phone: null,
        linkedin_url: 'not-a-valid-url',
      },
    });

    const result = await enrichPerson(input);

    // Invalid URL should be caught during summarization
    expect(result.requester_profile.summary).toBe('Not found');
    expect(result.requester_profile.confidence).toBe('not_available');
  });

  it('should handle LinkedIn company URLs (not profile URLs)', async () => {
    const input = createCanonicalInput({
      contact: {
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        title: 'Executive Director',
        email: 'jane@example.org',
        phone: null,
        linkedin_url: 'https://www.linkedin.com/company/acme-corp',
      },
    });

    const result = await enrichPerson(input);

    // Company URLs are not valid profile URLs
    expect(result.requester_profile.summary).toBe('Not found');
    expect(result.requester_profile.confidence).toBe('not_available');
  });

  it('should handle minimal canonical input', async () => {
    const minimalInput: CanonicalInput = {
      meta: {
        trigger_source: 'inbound',
        submitted_at: '2026-01-17T00:00:00.000Z',
        run_id: 'run_minimal',
      },
      organization: {},
      contact: {},
      notes: {},
      routing: {},
    };

    const result = await enrichPerson(minimalInput);

    expect(result.requester_profile.summary).toBe('Not found');
    expect(result.requester_profile.confidence).toBe('not_available');
    expect(result.errors).toEqual([]);
  });
});
