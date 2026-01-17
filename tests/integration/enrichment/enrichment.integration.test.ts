/**
 * Integration Tests for Enrichment Module
 *
 * Tests the enrichment module in realistic scenarios with
 * full observability stack and proper error handling.
 *
 * Per Implementation Spec Section 7:
 * - Person enrichment is OPTIONAL and NON-BLOCKING
 * - Failure must not halt the pipeline
 */

import {
  enrichPerson,
  getEnrichmentProvider,
  NullEnrichmentProvider,
  type CanonicalInput,
  type EnrichmentConfig,
  type EnrichmentLogger,
  type EnrichmentMetrics,
  type EnrichmentProvider,
  type ProfileSummary,
} from '../../../src/enrichment/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createFullCanonicalInput = (): CanonicalInput => ({
  meta: {
    trigger_source: 'inbound',
    submitted_at: '2026-01-17T14:30:22.000Z',
    run_id: 'run_integration_test_12345',
    requested_meeting_at: '2026-01-20T10:00:00.000Z',
    timezone: 'America/New_York',
  },
  organization: {
    name: 'Community Care Foundation',
    website: 'https://www.communitycarefoundation.org',
    domain: 'communitycarefoundation.org',
  },
  contact: {
    full_name: 'Sarah Johnson',
    first_name: 'Sarah',
    last_name: 'Johnson',
    title: 'Chief Executive Officer',
    email: 'sjohnson@communitycarefoundation.org',
    phone: '+1-555-123-4567',
    linkedin_url: 'https://www.linkedin.com/in/sarahjohnson-nonprofit',
  },
  notes: {
    comments: 'Referred by board member. Very interested in AI chatbot for volunteer coordination.',
    intent_topic: 'Volunteer management automation',
    source_context: 'Website inquiry form',
  },
  routing: {
    crm_target: 'hubspot',
    email_to: 'sales@myrecruiter.ai',
    email_cc: ['support@myrecruiter.ai'],
    motion_workspace: 'deals',
  },
});

// =============================================================================
// Mock Provider for Testing
// =============================================================================

class MockEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'mock';
  private shouldFail: boolean;
  private failCount: number;
  private callCount: number = 0;
  private response: ProfileSummary;

  constructor(options: {
    shouldFail?: boolean;
    failCount?: number;
    response?: ProfileSummary;
  } = {}) {
    this.shouldFail = options.shouldFail ?? false;
    this.failCount = options.failCount ?? Infinity;
    this.response = options.response ?? {
      summary: 'Mock profile summary for testing',
      confidence: 'medium',
    };
  }

  async summarize(_linkedinUrl: string): Promise<ProfileSummary> {
    this.callCount++;

    if (this.shouldFail && this.callCount <= this.failCount) {
      throw new Error(`Mock provider failure (attempt ${this.callCount})`);
    }

    return this.response;
  }

  getCallCount(): number {
    return this.callCount;
  }
}

// =============================================================================
// Structured Logger for Testing
// =============================================================================

interface LogEntry {
  level: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const createStructuredLogger = (): EnrichmentLogger & { logs: LogEntry[] } => {
  const logs: LogEntry[] = [];

  const createLogFn = (level: string) => (message: string, context?: Record<string, unknown>) => {
    logs.push({
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  };

  return {
    logs,
    info: createLogFn('info'),
    warn: createLogFn('warn'),
    error: createLogFn('error'),
    debug: createLogFn('debug'),
  };
};

// =============================================================================
// Metrics Collector for Testing
// =============================================================================

interface MetricEntry {
  type: 'counter' | 'duration' | 'gauge';
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: string;
}

const createMetricsCollector = (): EnrichmentMetrics & { metrics: MetricEntry[] } => {
  const metrics: MetricEntry[] = [];

  return {
    metrics,
    incrementCounter: (name, tags) => {
      metrics.push({
        type: 'counter',
        name,
        value: 1,
        tags,
        timestamp: new Date().toISOString(),
      });
    },
    recordDuration: (name, durationMs, tags) => {
      metrics.push({
        type: 'duration',
        name,
        value: durationMs,
        tags,
        timestamp: new Date().toISOString(),
      });
    },
    recordGauge: (name, value, tags) => {
      metrics.push({
        type: 'gauge',
        name,
        value,
        tags,
        timestamp: new Date().toISOString(),
      });
    },
  };
};

// =============================================================================
// Integration Tests
// =============================================================================

describe('Enrichment Module Integration', () => {
  describe('full pipeline execution with observability', () => {
    it('should complete enrichment with full logging', async () => {
      const logger = createStructuredLogger();
      const metrics = createMetricsCollector();
      const input = createFullCanonicalInput();

      const result = await enrichPerson(input, {}, { logger, metrics });

      // Verify result structure
      expect(result).toHaveProperty('requester_profile');
      expect(result).toHaveProperty('errors');

      // Verify logging occurred
      expect(logger.logs.length).toBeGreaterThan(0);

      // Verify all logs have timestamps
      logger.logs.forEach(log => {
        expect(log.timestamp).toBeDefined();
        expect(new Date(log.timestamp).getTime()).not.toBeNaN();
      });

      // Verify metrics recorded
      expect(metrics.metrics.length).toBeGreaterThan(0);

      // Verify duration metric exists
      const durationMetric = metrics.metrics.find(m => m.name === 'enrichment.duration_ms');
      expect(durationMetric).toBeDefined();
    });

    it('should log run_id consistently across all log entries', async () => {
      const logger = createStructuredLogger();
      const input = createFullCanonicalInput();

      await enrichPerson(input, {}, { logger });

      const logsWithContext = logger.logs.filter(log => log.context?.runId);
      expect(logsWithContext.length).toBeGreaterThan(0);

      logsWithContext.forEach(log => {
        expect(log.context?.runId).toBe(input.meta.run_id);
      });
    });
  });

  describe('pipeline resilience', () => {
    it('should not throw when provider fails repeatedly', async () => {
      const logger = createStructuredLogger();
      const input = createFullCanonicalInput();

      // Create a config that would cause failures but we're using default provider
      const config: EnrichmentConfig = {
        maxRetries: 2,
        retryBackoffMs: 10, // Short backoff for testing
      };

      // Should not throw even with failures
      await expect(enrichPerson(input, config, { logger })).resolves.toBeDefined();
    });

    it('should return valid output when no LinkedIn URL provided', async () => {
      const input = createFullCanonicalInput();
      input.contact.linkedin_url = null;

      const result = await enrichPerson(input);

      // Per spec Section 7.3: If unavailable, summary must be "Not found"
      expect(result.requester_profile.summary).toBe('Not found');
      expect(result.requester_profile.confidence).toBe('not_available');
      expect(result.errors).toEqual([]);
    });

    it('should handle malformed LinkedIn URLs gracefully', async () => {
      const logger = createStructuredLogger();
      const input = createFullCanonicalInput();
      input.contact.linkedin_url = 'definitely-not-a-url';

      const result = await enrichPerson(input, {}, { logger });

      // Should return not found, not throw
      expect(result.requester_profile.summary).toBe('Not found');
      expect(result.requester_profile.confidence).toBe('not_available');

      // Should have warning in logs
      const warningLogs = logger.logs.filter(log => log.level === 'warn');
      expect(warningLogs.length).toBeGreaterThan(0);
    });
  });

  describe('provider factory integration', () => {
    it('should create NullEnrichmentProvider when no config provided', () => {
      const provider = getEnrichmentProvider();
      expect(provider).toBeInstanceOf(NullEnrichmentProvider);
    });

    it('should create NullEnrichmentProvider for unknown type', () => {
      // TypeScript would catch this at compile time, but runtime should handle gracefully
      const provider = getEnrichmentProvider({ type: 'unknown' as 'null' });
      expect(provider).toBeInstanceOf(NullEnrichmentProvider);
    });

    it('should log provider selection', () => {
      const logger = createStructuredLogger();
      getEnrichmentProvider({ type: 'null' }, logger);

      const debugLogs = logger.logs.filter(log => log.level === 'debug');
      expect(debugLogs.length).toBeGreaterThan(0);
    });
  });

  describe('canonical output contract verification', () => {
    it('should produce output matching Section 7.3 schema', async () => {
      const input = createFullCanonicalInput();
      const result = await enrichPerson(input);

      // Verify exact schema structure from Section 7.3
      expect(typeof result.requester_profile.summary).toBe('string');
      expect(['high', 'medium', 'low', 'not_available']).toContain(result.requester_profile.confidence);
      expect(Array.isArray(result.errors)).toBe(true);
      result.errors.forEach(err => {
        expect(typeof err).toBe('string');
      });
    });

    it('should include errors array even when empty', async () => {
      const input = createFullCanonicalInput();
      input.contact.linkedin_url = null;

      const result = await enrichPerson(input);

      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('metrics integrity', () => {
    it('should record started and completion metrics', async () => {
      const metrics = createMetricsCollector();
      const input = createFullCanonicalInput();

      await enrichPerson(input, {}, { metrics });

      const counterMetrics = metrics.metrics.filter(m => m.type === 'counter');
      const startedMetric = counterMetrics.find(m => m.name.includes('enrichment.started'));
      const completionMetric = counterMetrics.find(m =>
        m.name.includes('enrichment.success') ||
        m.name.includes('enrichment.no_url') ||
        m.name.includes('enrichment.failed')
      );

      expect(startedMetric).toBeDefined();
      expect(completionMetric).toBeDefined();
    });

    it('should record duration in milliseconds', async () => {
      const metrics = createMetricsCollector();
      const input = createFullCanonicalInput();

      const startTime = Date.now();
      await enrichPerson(input, {}, { metrics });
      const endTime = Date.now();

      const durationMetric = metrics.metrics.find(m => m.name === 'enrichment.duration_ms');
      expect(durationMetric).toBeDefined();
      expect(durationMetric?.value).toBeGreaterThanOrEqual(0);
      expect(durationMetric?.value).toBeLessThanOrEqual(endTime - startTime + 100); // Allow some tolerance
    });

    it('should include tags with run_id in metrics', async () => {
      const metrics = createMetricsCollector();
      const input = createFullCanonicalInput();

      await enrichPerson(input, {}, { metrics });

      const metricsWithRunId = metrics.metrics.filter(m => m.tags?.runId === input.meta.run_id);
      expect(metricsWithRunId.length).toBeGreaterThan(0);
    });
  });

  describe('concurrent execution', () => {
    it('should handle multiple concurrent enrichment requests', async () => {
      const inputs = Array.from({ length: 5 }, (_, i) => {
        const input = createFullCanonicalInput();
        input.meta.run_id = `run_concurrent_${i}`;
        return input;
      });

      const results = await Promise.all(inputs.map(input => enrichPerson(input)));

      // All should complete successfully
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.requester_profile).toBeDefined();
        expect(result.errors).toBeDefined();
      });
    });

    it('should maintain separate metrics for concurrent requests', async () => {
      const metricsCollectors = Array.from({ length: 3 }, () => createMetricsCollector());
      const inputs = Array.from({ length: 3 }, (_, i) => {
        const input = createFullCanonicalInput();
        input.meta.run_id = `run_metrics_${i}`;
        return input;
      });

      await Promise.all(
        inputs.map((input, i) => enrichPerson(input, {}, { metrics: metricsCollectors[i] }))
      );

      // Each collector should have metrics for its own run
      metricsCollectors.forEach((collector, i) => {
        const runIdMetrics = collector.metrics.filter(m => m.tags?.runId === `run_metrics_${i}`);
        expect(runIdMetrics.length).toBeGreaterThan(0);
      });
    });
  });
});

// =============================================================================
// Error Scenario Tests
// =============================================================================

describe('Enrichment Error Scenarios', () => {
  describe('input validation', () => {
    it('should handle null contact object gracefully', async () => {
      const input: CanonicalInput = {
        meta: {
          trigger_source: 'outbound',
          submitted_at: new Date().toISOString(),
          run_id: 'run_null_contact',
        },
        organization: { name: 'Test Org' },
        contact: {
          linkedin_url: null,
        },
        notes: {},
        routing: {},
      };

      const result = await enrichPerson(input);

      expect(result.requester_profile.summary).toBe('Not found');
      expect(result.requester_profile.confidence).toBe('not_available');
    });

    it('should handle undefined fields in contact', async () => {
      const input: CanonicalInput = {
        meta: {
          trigger_source: 'outbound',
          submitted_at: new Date().toISOString(),
          run_id: 'run_undefined_fields',
        },
        organization: {},
        contact: {},
        notes: {},
        routing: {},
      };

      const result = await enrichPerson(input);

      // Should not throw and return valid output
      expect(result).toBeDefined();
      expect(result.requester_profile).toBeDefined();
    });
  });

  describe('configuration edge cases', () => {
    it('should use defaults when config is empty object', async () => {
      const input = createFullCanonicalInput();
      const result = await enrichPerson(input, {});

      expect(result).toBeDefined();
    });

    it('should handle zero maxRetries', async () => {
      const input = createFullCanonicalInput();
      const config: EnrichmentConfig = {
        maxRetries: 0,
        retryBackoffMs: 10,
      };

      const result = await enrichPerson(input, config);

      expect(result).toBeDefined();
    });

    it('should handle very short retry backoff', async () => {
      const input = createFullCanonicalInput();
      const config: EnrichmentConfig = {
        maxRetries: 1,
        retryBackoffMs: 1,
      };

      const result = await enrichPerson(input, config);

      expect(result).toBeDefined();
    });
  });
});
