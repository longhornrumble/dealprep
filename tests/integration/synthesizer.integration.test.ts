/**
 * Integration Tests for Synthesizer Module
 *
 * These tests require:
 * - ANTHROPIC_API_KEY environment variable
 * - Network access to Claude API
 *
 * Run with: npm run test:integration
 *
 * Skipped by default unless ANTHROPIC_API_KEY is set
 */

import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import {
  synthesizeBrief,
  callClaude,
  type ClaudeConfig,
  type Logger,
  type Metrics,
} from '../../src/synthesizer/index.js';
import { MemoryStorageAdapter } from '../../src/storage/index.js';
import type { CanonicalInput } from '../../src/normalizer/index.js';
import type { ScrapeOutput } from '../../src/scraper/index.js';

// ============================================================================
// Test Configuration
// ============================================================================

const SKIP_REASON = 'ANTHROPIC_API_KEY not set - skipping integration tests';
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

// Use shorter timeouts for CI
const TEST_TIMEOUT = 180000; // 3 minutes

// Mock logger that captures logs
const createMockLogger = (): Logger & { logs: string[] } => {
  const logs: string[] = [];
  return {
    logs,
    info: (msg, meta) => logs.push(`[INFO] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
    warn: (msg, meta) => logs.push(`[WARN] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
    error: (msg, meta) => logs.push(`[ERROR] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
    debug: (msg, meta) => logs.push(`[DEBUG] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
  };
};

// Mock metrics that tracks calls
const createMockMetrics = (): Metrics & { calls: Array<{ method: string; name: string; value?: number }> } => {
  const calls: Array<{ method: string; name: string; value?: number }> = [];
  return {
    calls,
    increment: (name) => calls.push({ method: 'increment', name }),
    gauge: (name, value) => calls.push({ method: 'gauge', name, value }),
    timing: (name, value) => calls.push({ method: 'timing', name, value }),
  };
};

// ============================================================================
// Test Fixtures
// ============================================================================

const testCanonicalInput: CanonicalInput = {
  meta: {
    trigger_source: 'inbound',
    submitted_at: new Date().toISOString(),
    run_id: `run_integration_${Date.now()}`,
    requested_meeting_at: null,
    timezone: 'America/New_York',
  },
  organization: {
    name: 'Community Care Alliance',
    website: 'https://communitycarealliance.org',
    domain: 'communitycarealliance.org',
  },
  contact: {
    full_name: 'Sarah Johnson',
    first_name: 'Sarah',
    last_name: 'Johnson',
    title: 'Program Director',
    email: 'sarah@communitycarealliance.org',
    phone: null,
    linkedin_url: null,
  },
  notes: {
    comments: 'Interested in automating volunteer screening process',
    intent_topic: 'Volunteer management',
    source_context: 'Webinar attendee',
  },
  routing: {
    crm_target: null,
    email_to: null,
    email_cc: [],
    motion_workspace: null,
  },
};

const testScrapeOutput: ScrapeOutput = {
  scrape_meta: {
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    source_domain: 'communitycarealliance.org',
    tool: 'firecrawl',
    pages_fetched: 4,
  },
  pages: [
    {
      url: 'https://communitycarealliance.org/',
      final_url: 'https://communitycarealliance.org/',
      page_type: 'home',
      title: 'Community Care Alliance - Serving Our Neighbors',
      extracted_markdown: `# Community Care Alliance

Welcome to Community Care Alliance! We are a nonprofit organization dedicated to serving our neighbors in need through food assistance, job training, and community support programs.

## Our Impact
- 10,000+ families served annually
- 500+ active volunteers
- 25 years of community service

[Donate Now](/donate) | [Volunteer](/volunteer) | [Get Help](/programs)`,
      ctas: ['Donate Now', 'Volunteer', 'Get Help'],
      people_mentions: [],
    },
    {
      url: 'https://communitycarealliance.org/about',
      final_url: 'https://communitycarealliance.org/about',
      page_type: 'about',
      title: 'About Us - Community Care Alliance',
      extracted_markdown: `## Our Mission

To strengthen our community by providing essential services and opportunities for those facing hardship.

## Our Team

**Dr. Michael Chen** - Executive Director
Dr. Chen has led Community Care Alliance for 8 years, expanding programs and partnerships.

**Sarah Johnson** - Program Director
Sarah oversees all community programs and volunteer coordination.

**Maria Garcia** - Volunteer Coordinator
Maria manages our team of 500+ dedicated volunteers.`,
      ctas: ['Join Our Team'],
      people_mentions: [
        { name: 'Michael Chen', role: 'Executive Director' },
        { name: 'Sarah Johnson', role: 'Program Director' },
        { name: 'Maria Garcia', role: 'Volunteer Coordinator' },
      ],
    },
    {
      url: 'https://communitycarealliance.org/volunteer',
      final_url: 'https://communitycarealliance.org/volunteer',
      page_type: 'volunteer',
      title: 'Volunteer - Community Care Alliance',
      extracted_markdown: `## Become a Volunteer

We need your help! Volunteers are the backbone of our organization.

### Volunteer Opportunities
- Food pantry assistance (weekdays 9am-5pm)
- Job training mentorship (flexible hours)
- Event support (occasional weekends)
- Administrative help (office hours)

### How to Get Started
1. Complete our online application
2. Attend an orientation session
3. Background check (required for all volunteers)
4. Start making a difference!

**Next Orientation**: First Saturday of each month at 10am

[Apply Now](/volunteer/apply)`,
      ctas: ['Apply Now'],
      people_mentions: [],
    },
    {
      url: 'https://communitycarealliance.org/programs',
      final_url: 'https://communitycarealliance.org/programs',
      page_type: 'programs',
      title: 'Our Programs - Community Care Alliance',
      extracted_markdown: `## Our Programs

### Food Assistance Program
Weekly food distribution serving 200+ families. Open Tuesdays and Thursdays, 2-6pm.

### Job Training Initiative
Free career development courses including resume writing, interview skills, and computer literacy.

### Emergency Assistance
One-time financial help for rent, utilities, and medical expenses for qualifying families.

### Youth Mentorship
Afterschool programs pairing at-risk youth with caring adult mentors.`,
      ctas: ['Get Help', 'Donate'],
      people_mentions: [],
    },
  ],
  errors: [],
};

const testEnrichmentOutput = {
  requester_profile: {
    summary: 'Sarah Johnson is a Program Director with 10 years experience in nonprofit management.',
    confidence: 'medium' as const,
  },
  errors: [],
};

// ============================================================================
// Integration Tests: callClaude
// ============================================================================

describe('callClaude Integration', () => {
  const conditionalTest = hasApiKey ? it : it.skip;

  conditionalTest(
    'should successfully call Claude API with a simple prompt',
    async () => {
      const config: ClaudeConfig = {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 100,
        temperature: 0,
      };

      const prompt = 'Respond with exactly: {"test": "success"}';
      const logger = createMockLogger();
      const metrics = createMockMetrics();

      const result = await callClaude(prompt, config, undefined, logger, metrics);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data).toContain('success');

      // Verify metrics were recorded
      expect(metrics.calls.some((c) => c.name === 'synthesizer.claude.calls')).toBe(true);
    },
    TEST_TIMEOUT
  );

  conditionalTest(
    'should handle JSON output request correctly',
    async () => {
      const config: ClaudeConfig = {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 500,
        temperature: 0,
      };

      const prompt = `Output a valid JSON object with these exact fields:
{
  "name": "Test Organization",
  "score": 42
}
Output ONLY the JSON, no other text.`;

      const result = await callClaude(prompt, config);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Should be valid JSON
      const parsed = JSON.parse(result.data!);
      expect(parsed.name).toBe('Test Organization');
      expect(parsed.score).toBe(42);
    },
    TEST_TIMEOUT
  );

  if (!hasApiKey) {
    it(SKIP_REASON, () => {
      console.log(SKIP_REASON);
    });
  }
});

// ============================================================================
// Integration Tests: synthesizeBrief (Full Pipeline)
// ============================================================================

describe('synthesizeBrief Integration', () => {
  const conditionalTest = hasApiKey ? it : it.skip;
  let storage: MemoryStorageAdapter;

  beforeAll(() => {
    storage = new MemoryStorageAdapter();
  });

  conditionalTest(
    'should generate a complete deal prep brief',
    async () => {
      const runId = `run_fulltest_${Date.now()}`;
      const config: ClaudeConfig = {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        temperature: 0.3,
      };

      const logger = createMockLogger();
      const metrics = createMockMetrics();

      // Set up test data in storage
      const inputWithRunId = {
        ...testCanonicalInput,
        meta: { ...testCanonicalInput.meta, run_id: runId },
      };

      await storage.save(runId, 'input', JSON.stringify(inputWithRunId));
      await storage.save(runId, 'scrape', JSON.stringify(testScrapeOutput));
      await storage.save(runId, 'enrichment', JSON.stringify(testEnrichmentOutput));

      // Run synthesis
      const result = await synthesizeBrief(runId, storage, config, logger, metrics);

      // Basic success check
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const brief = result.data!;

      // Check meta section
      expect(brief.meta.run_id).toBe(runId);
      expect(brief.meta.trigger_source).toBe('inbound');
      expect(brief.meta.organization_name).toBe('Community Care Alliance');

      // Check hard constraints
      expect(brief.executive_summary.top_opportunities).toHaveLength(3);
      expect(brief.artificial_intelligence_opportunities).toHaveLength(3);
      expect(brief.objections_and_rebuttals).toHaveLength(3);
      expect(brief.executive_summary.summary.length).toBeLessThanOrEqual(600);
      expect(brief.opening_script.length).toBeLessThanOrEqual(450);
      expect(brief.demonstration_plan.steps.length).toBeLessThanOrEqual(6);

      // Check content quality
      expect(brief.organization_understanding.mission).toBeTruthy();
      expect(brief.organization_understanding.programs.length).toBeGreaterThan(0);
      expect(brief.website_analysis.strengths.length).toBeGreaterThan(0);

      // Check that brief was stored
      const storedBrief = await storage.load(runId, 'brief');
      expect(storedBrief).toBeDefined();

      // Verify metrics
      expect(metrics.calls.some((c) => c.name === 'synthesizer.started')).toBe(true);
      expect(metrics.calls.some((c) => c.name === 'synthesizer.completed')).toBe(true);

      // Log for inspection
      console.log('Generated Brief Summary:');
      console.log('  Organization:', brief.meta.organization_name);
      console.log('  Top Opportunities:', brief.executive_summary.top_opportunities);
      console.log('  AI Opportunities:', brief.artificial_intelligence_opportunities.map((o) => o.title));
      console.log('  Confidence:', result.metadata.duration, 'ms');
    },
    TEST_TIMEOUT
  );

  conditionalTest(
    'should handle synthesis without website scrape',
    async () => {
      const runId = `run_noscrape_${Date.now()}`;
      const config: ClaudeConfig = {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        temperature: 0.3,
      };

      // Only provide canonical input, no scrape
      const inputWithRunId = {
        ...testCanonicalInput,
        meta: { ...testCanonicalInput.meta, run_id: runId },
      };
      await storage.save(runId, 'input', JSON.stringify(inputWithRunId));

      const result = await synthesizeBrief(runId, storage, config);

      // Should still succeed but with lower confidence
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Brief should still have required structure
      expect(result.data!.executive_summary.top_opportunities).toHaveLength(3);
    },
    TEST_TIMEOUT
  );

  conditionalTest(
    'should fail gracefully without canonical input',
    async () => {
      const runId = `run_noinput_${Date.now()}`;
      const config: ClaudeConfig = {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
      };

      // Don't save any input
      const result = await synthesizeBrief(runId, storage, config);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INPUT_NOT_FOUND');
    },
    30000
  );

  if (!hasApiKey) {
    it(SKIP_REASON, () => {
      console.log(SKIP_REASON);
    });
  }
});
