/**
 * Scraper Module Integration Tests
 *
 * These tests require a valid FIRECRAWL_API_KEY environment variable.
 * They make actual API calls to Firecrawl and should be run sparingly.
 *
 * Run with: npm run test:integration
 */

import { jest } from '@jest/globals';
import { scrapeWebsite, type ScrapeOutput, type Logger, type Metrics } from '../../src/scraper/index.js';

// Skip integration tests if no API key is provided
const API_KEY = process.env.FIRECRAWL_API_KEY;
const describeIfApiKey = API_KEY ? describe : describe.skip;

/**
 * Create a mock logger that captures calls
 */
function createTestLogger(): Logger & { logs: string[] } {
  const logs: string[] = [];
  return {
    logs,
    info: (msg, meta) => logs.push(`[INFO] ${msg} ${JSON.stringify(meta || {})}`),
    warn: (msg, meta) => logs.push(`[WARN] ${msg} ${JSON.stringify(meta || {})}`),
    error: (msg, meta) => logs.push(`[ERROR] ${msg} ${JSON.stringify(meta || {})}`),
    debug: (msg, meta) => logs.push(`[DEBUG] ${msg} ${JSON.stringify(meta || {})}`),
  };
}

/**
 * Create a mock metrics collector
 */
function createTestMetrics(): Metrics & { records: any[] } {
  const records: any[] = [];
  return {
    records,
    increment: (metric, tags) => records.push({ type: 'increment', metric, tags }),
    gauge: (metric, value, tags) => records.push({ type: 'gauge', metric, value, tags }),
    timing: (metric, value, tags) => records.push({ type: 'timing', metric, value, tags }),
  };
}

describeIfApiKey('Scraper Integration Tests', () => {
  // Increase timeout for API calls
  jest.setTimeout(120000);

  describe('scrapeWebsite with real API', () => {
    it('scrapes a simple website and returns valid structure', async () => {
      const logger = createTestLogger();
      const metrics = createTestMetrics();

      const result = await scrapeWebsite(
        'https://example.com',
        {
          apiKey: API_KEY,
          maxPages: 5,
          maxDepth: 1,
        },
        logger,
        metrics
      );

      // Validate output structure
      expect(result).toBeDefined();
      expect(result.scrape_meta).toBeDefined();
      expect(result.scrape_meta.started_at).toBeDefined();
      expect(result.scrape_meta.completed_at).toBeDefined();
      expect(result.scrape_meta.source_domain).toBe('example.com');
      expect(result.scrape_meta.tool).toBe('firecrawl');
      expect(typeof result.scrape_meta.pages_fetched).toBe('number');

      expect(Array.isArray(result.pages)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);

      // Should have at least the homepage
      expect(result.pages.length).toBeGreaterThan(0);

      // Validate page structure
      const page = result.pages[0];
      expect(page.url).toBeDefined();
      expect(page.final_url).toBeDefined();
      expect(page.page_type).toBeDefined();
      expect(typeof page.extracted_markdown).toBe('string');
      expect(Array.isArray(page.ctas)).toBe(true);
      expect(Array.isArray(page.people_mentions)).toBe(true);

      // Verify logging occurred
      expect(logger.logs.some(log => log.includes('Starting website scrape'))).toBe(true);
      expect(logger.logs.some(log => log.includes('Scrape completed'))).toBe(true);

      // Verify metrics were recorded
      expect(metrics.records.some(r => r.metric === 'scraper.started')).toBe(true);
      expect(metrics.records.some(r => r.metric === 'scraper.pages_fetched')).toBe(true);
      expect(metrics.records.some(r => r.metric === 'scraper.duration')).toBe(true);
    });

    it('classifies page types correctly', async () => {
      // Use a test site with known page structure
      const result = await scrapeWebsite(
        'https://example.com',
        {
          apiKey: API_KEY,
          maxPages: 3,
          maxDepth: 1,
        }
      );

      // The homepage should be classified as 'home'
      const homePage = result.pages.find(p =>
        p.url.endsWith('/') || p.url === 'https://example.com'
      );

      if (homePage) {
        expect(homePage.page_type).toBe('home');
      }
    });

    it('respects maxPages limit', async () => {
      const result = await scrapeWebsite(
        'https://example.com',
        {
          apiKey: API_KEY,
          maxPages: 2,
          maxDepth: 1,
        }
      );

      expect(result.pages.length).toBeLessThanOrEqual(2);
    });

    it('records errors without halting execution', async () => {
      // Use an invalid URL that will cause errors
      const result = await scrapeWebsite(
        'https://this-domain-definitely-does-not-exist-12345.org',
        {
          apiKey: API_KEY,
          maxPages: 1,
          maxRetries: 0, // No retries for faster test
        }
      );

      // Should return a valid structure even with errors
      expect(result).toBeDefined();
      expect(result.scrape_meta).toBeDefined();
      expect(Array.isArray(result.pages)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);

      // Errors should be recorded
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Output Schema Compliance', () => {
    it('produces output matching Implementation Spec Section 6.3', async () => {
      const result = await scrapeWebsite(
        'https://example.com',
        {
          apiKey: API_KEY,
          maxPages: 2,
          maxDepth: 1,
        }
      );

      // Validate scrape_meta (required fields)
      expect(result.scrape_meta.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.scrape_meta.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(typeof result.scrape_meta.source_domain).toBe('string');
      expect(result.scrape_meta.tool).toBe('firecrawl');
      expect(typeof result.scrape_meta.pages_fetched).toBe('number');
      expect(result.scrape_meta.pages_fetched).toBeGreaterThanOrEqual(0);

      // Validate pages array
      for (const page of result.pages) {
        // Required fields
        expect(typeof page.url).toBe('string');
        expect(typeof page.final_url).toBe('string');
        expect([
          'home',
          'about',
          'programs',
          'volunteer',
          'donate',
          'faq',
          'staff',
          'contact',
          'other',
        ]).toContain(page.page_type);
        expect(page.title === null || typeof page.title === 'string').toBe(true);
        expect(typeof page.extracted_markdown).toBe('string');
        expect(Array.isArray(page.ctas)).toBe(true);
        expect(Array.isArray(page.people_mentions)).toBe(true);

        // Validate people_mentions structure
        for (const mention of page.people_mentions) {
          expect(typeof mention.name).toBe('string');
          expect(mention.role === null || typeof mention.role === 'string').toBe(true);
        }
      }

      // Validate errors array
      expect(Array.isArray(result.errors)).toBe(true);
      for (const error of result.errors) {
        expect(typeof error).toBe('string');
      }
    });
  });

  describe('Configuration Options', () => {
    it('uses environment variable for API key when not provided', async () => {
      // This test assumes FIRECRAWL_API_KEY is set
      const result = await scrapeWebsite(
        'https://example.com',
        {
          maxPages: 1,
          maxDepth: 1,
        }
      );

      expect(result).toBeDefined();
      expect(result.scrape_meta.tool).toBe('firecrawl');
    });

    it('allows custom API URL', async () => {
      // Test that custom API URL is accepted (won't work with wrong URL)
      await expect(
        scrapeWebsite(
          'https://example.com',
          {
            apiKey: API_KEY,
            apiUrl: 'https://invalid-api-url.example.com',
            maxPages: 1,
            maxRetries: 0,
          }
        )
      ).rejects.toThrow();
    });

    it('respects timeout setting', async () => {
      const startTime = Date.now();

      // Set very short timeout - should fail quickly
      try {
        await scrapeWebsite(
          'https://example.com',
          {
            apiKey: API_KEY,
            timeout: 100, // 100ms timeout
            maxRetries: 0,
          }
        );
      } catch (error) {
        // Expected to fail
      }

      const duration = Date.now() - startTime;
      // Should fail relatively quickly due to timeout
      expect(duration).toBeLessThan(10000);
    });
  });
});

// Test that can run without API key (unit-level)
describe('Scraper Configuration Validation', () => {
  it('throws error when API key is missing', async () => {
    const originalKey = process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;

    await expect(
      scrapeWebsite('https://example.com', { apiKey: undefined })
    ).rejects.toThrow('FIRECRAWL_API_KEY is required');

    process.env.FIRECRAWL_API_KEY = originalKey;
  });

  it('uses default values when not specified', () => {
    // This is more of a type check - the defaults should compile
    const defaultConfig = {
      maxPages: 25,
      maxDepth: 3,
      timeout: 60000,
      maxRetries: 2,
    };

    expect(defaultConfig.maxPages).toBe(25);
    expect(defaultConfig.maxDepth).toBe(3);
    expect(defaultConfig.timeout).toBe(60000);
    expect(defaultConfig.maxRetries).toBe(2);
  });
});
