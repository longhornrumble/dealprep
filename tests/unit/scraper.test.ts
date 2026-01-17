/**
 * Scraper Module Unit Tests
 *
 * Tests for the Deal Prep Level 2 scraper module per Implementation Spec Section 6
 */

import { jest } from '@jest/globals';
import {
  classifyPageType,
  extractCTAs,
  extractPeopleMentions,
  extractDomain,
  normalizeUrl,
  isSameDomain,
  scrapeWebsite,
  type PageType,
  type PersonMention,
  type ScrapeOutput,
  type Logger,
  type Metrics,
} from '../../src/scraper/index.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock logger for testing
 */
function createMockLogger(): Logger & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {
    info: [],
    warn: [],
    error: [],
    debug: [],
  };
  return {
    calls,
    info: jest.fn((...args: unknown[]) => { calls.info.push(args); }) as Logger['info'],
    warn: jest.fn((...args: unknown[]) => { calls.warn.push(args); }) as Logger['warn'],
    error: jest.fn((...args: unknown[]) => { calls.error.push(args); }) as Logger['error'],
    debug: jest.fn((...args: unknown[]) => { calls.debug.push(args); }) as Logger['debug'],
  };
}

/**
 * Create a mock metrics collector for testing
 */
function createMockMetrics(): Metrics & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {
    increment: [],
    gauge: [],
    timing: [],
  };
  return {
    calls,
    increment: jest.fn((...args: unknown[]) => { calls.increment.push(args); }) as Metrics['increment'],
    gauge: jest.fn((...args: unknown[]) => { calls.gauge.push(args); }) as Metrics['gauge'],
    timing: jest.fn((...args: unknown[]) => { calls.timing.push(args); }) as Metrics['timing'],
  };
}

// ============================================================================
// Page Type Classification Tests
// ============================================================================

describe('classifyPageType', () => {
  describe('URL pattern matching', () => {
    const testCases: Array<{ url: string; expected: PageType; description: string }> = [
      // Home pages
      { url: 'https://example.org/', expected: 'home', description: 'root path' },
      { url: 'https://example.org/index.html', expected: 'home', description: 'index.html' },
      { url: 'https://example.org/home', expected: 'home', description: '/home path' },

      // About pages
      { url: 'https://example.org/about', expected: 'about', description: '/about' },
      { url: 'https://example.org/about-us', expected: 'about', description: '/about-us' },
      { url: 'https://example.org/who-we-are', expected: 'about', description: '/who-we-are' },
      { url: 'https://example.org/our-story', expected: 'about', description: '/our-story' },
      { url: 'https://example.org/mission', expected: 'about', description: '/mission' },

      // Programs/Services pages
      { url: 'https://example.org/programs', expected: 'programs', description: '/programs' },
      { url: 'https://example.org/services', expected: 'programs', description: '/services' },
      { url: 'https://example.org/what-we-do', expected: 'programs', description: '/what-we-do' },
      { url: 'https://example.org/our-programs', expected: 'programs', description: '/our-programs' },

      // Volunteer pages
      { url: 'https://example.org/volunteer', expected: 'volunteer', description: '/volunteer' },
      { url: 'https://example.org/get-involved', expected: 'volunteer', description: '/get-involved' },
      { url: 'https://example.org/join-us', expected: 'volunteer', description: '/join-us' },

      // Donate pages
      { url: 'https://example.org/donate', expected: 'donate', description: '/donate' },
      { url: 'https://example.org/give', expected: 'donate', description: '/give' },
      { url: 'https://example.org/support-us', expected: 'donate', description: '/support-us' },
      { url: 'https://example.org/fundraising', expected: 'donate', description: '/fundraising' },

      // FAQ pages
      { url: 'https://example.org/faq', expected: 'faq', description: '/faq' },
      { url: 'https://example.org/frequently-asked-questions', expected: 'faq', description: '/frequently-asked-questions' },

      // Staff/Leadership pages
      { url: 'https://example.org/staff', expected: 'staff', description: '/staff' },
      { url: 'https://example.org/team', expected: 'staff', description: '/team' },
      { url: 'https://example.org/leadership', expected: 'staff', description: '/leadership' },
      { url: 'https://example.org/board', expected: 'staff', description: '/board' },

      // Contact pages
      { url: 'https://example.org/contact', expected: 'contact', description: '/contact' },
      { url: 'https://example.org/contact-us', expected: 'contact', description: '/contact-us' },
      { url: 'https://example.org/get-in-touch', expected: 'contact', description: '/get-in-touch' },

      // Other pages
      { url: 'https://example.org/blog', expected: 'other', description: '/blog' },
      { url: 'https://example.org/news', expected: 'other', description: '/news' },
      { url: 'https://example.org/random-page', expected: 'other', description: '/random-page' },
    ];

    testCases.forEach(({ url, expected, description }) => {
      it(`classifies ${description} as "${expected}"`, () => {
        const result = classifyPageType(url, null, '');
        expect(result).toBe(expected);
      });
    });
  });

  describe('Content-based fallback classification', () => {
    it('classifies based on title when URL is ambiguous', () => {
      const result = classifyPageType(
        'https://example.org/page123',
        'About Us - Example Org',
        ''
      );
      expect(result).toBe('about');
    });

    it('classifies based on content when URL and title are ambiguous', () => {
      const result = classifyPageType(
        'https://example.org/page456',
        'Page Title',
        '# Our Mission\n\nWe are dedicated to...'
      );
      expect(result).toBe('about');
    });

    it('returns "other" when no classification matches', () => {
      const result = classifyPageType(
        'https://example.org/xyz',
        'Random Page',
        'Some random content that does not match any pattern.'
      );
      expect(result).toBe('other');
    });
  });
});

// ============================================================================
// CTA Extraction Tests
// ============================================================================

describe('extractCTAs', () => {
  it('extracts donate CTAs from markdown links', () => {
    const markdown = `
      Check out our programs!
      [Donate Now](https://example.org/donate)
      [Give Today](https://example.org/give)
    `;
    const ctas = extractCTAs(markdown);
    expect(ctas).toContain('Donate Now');
    expect(ctas).toContain('Give Today');
  });

  it('extracts volunteer CTAs', () => {
    const markdown = `
      Want to help?
      [Volunteer With Us](https://example.org/volunteer)
      [Join Our Team](https://example.org/join)
    `;
    const ctas = extractCTAs(markdown);
    expect(ctas).toContain('Volunteer With Us');
    expect(ctas).toContain('Join Our Team');
  });

  it('extracts contact and learn more CTAs', () => {
    const markdown = `
      [Contact Us](https://example.org/contact)
      [Learn More About Our Work](https://example.org/about)
    `;
    const ctas = extractCTAs(markdown);
    expect(ctas).toContain('Contact Us');
    expect(ctas.some(cta => cta.toLowerCase().includes('learn more'))).toBe(true);
  });

  it('limits CTAs to 20', () => {
    const markdown = Array(30)
      .fill('[Donate Now](https://example.org/donate)')
      .join('\n');
    const ctas = extractCTAs(markdown);
    expect(ctas.length).toBeLessThanOrEqual(20);
  });

  it('returns empty array for content without CTAs', () => {
    const markdown = `
      # About Us
      We are a nonprofit organization.
      Founded in 2020.
    `;
    const ctas = extractCTAs(markdown);
    expect(ctas).toEqual([]);
  });
});

// ============================================================================
// People Mention Extraction Tests
// ============================================================================

describe('extractPeopleMentions', () => {
  it('extracts names with roles', () => {
    // Note: Names must start at beginning of line for pattern matching
    const markdown = `# Our Team

John Smith, Executive Director
Jane Doe - Program Manager
**Robert Johnson**, Chief Operating Officer`;
    const mentions = extractPeopleMentions(markdown, 'staff');

    const johnMention = mentions.find(m => m.name === 'John Smith');
    expect(johnMention).toBeDefined();
    expect(johnMention?.role).toContain('Executive Director');

    const janeMention = mentions.find(m => m.name === 'Jane Doe');
    expect(janeMention).toBeDefined();
    expect(janeMention?.role).toContain('Program Manager');
  });

  it('extracts names without roles on staff pages', () => {
    // Note: Markdown headers must start at beginning of line
    const markdown = `# Our Board

## Sarah Williams
## Michael Brown
## Emily Davis`;
    const mentions = extractPeopleMentions(markdown, 'staff');

    expect(mentions.some(m => m.name === 'Sarah Williams')).toBe(true);
    expect(mentions.some(m => m.name === 'Michael Brown')).toBe(true);
    expect(mentions.some(m => m.name === 'Emily Davis')).toBe(true);
  });

  it('filters out non-person words', () => {
    const markdown = `## About Us
## Our Mission
## Contact Us
## John Smith`;
    const mentions = extractPeopleMentions(markdown, 'about');

    expect(mentions.every(m => m.name !== 'About Us')).toBe(true);
    expect(mentions.every(m => m.name !== 'Our Mission')).toBe(true);
    expect(mentions.every(m => m.name !== 'Contact Us')).toBe(true);
  });

  it('limits mentions to 50', () => {
    const names = Array(60)
      .fill(null)
      .map((_, i) => `## Person Name${i}`)
      .join('\n');
    const markdown = `# Staff\n${names}`;
    const mentions = extractPeopleMentions(markdown, 'staff');
    expect(mentions.length).toBeLessThanOrEqual(50);
  });

  it('returns empty array when no people found', () => {
    const markdown = `
      # About Our Programs

      We offer various services to the community.
      Our programs include education, healthcare, and housing support.
    `;
    const mentions = extractPeopleMentions(markdown, 'programs');
    expect(mentions).toEqual([]);
  });
});

// ============================================================================
// URL Utility Tests
// ============================================================================

describe('extractDomain', () => {
  it('extracts domain from full URL', () => {
    expect(extractDomain('https://www.example.org/page')).toBe('www.example.org');
    expect(extractDomain('https://example.org/page')).toBe('example.org');
    expect(extractDomain('http://sub.domain.example.org/')).toBe('sub.domain.example.org');
  });

  it('handles URLs without protocol', () => {
    expect(extractDomain('example.org/page')).toBe('example.org');
  });

  it('handles malformed URLs gracefully', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url');
  });
});

describe('normalizeUrl', () => {
  it('removes trailing slashes', () => {
    expect(normalizeUrl('https://example.org/page/')).toBe('https://example.org/page');
    expect(normalizeUrl('https://example.org/')).toBe('https://example.org');
  });

  it('converts to lowercase', () => {
    expect(normalizeUrl('https://EXAMPLE.ORG/Page')).toBe('https://example.org/page');
  });

  it('preserves path', () => {
    expect(normalizeUrl('https://example.org/about/team')).toBe('https://example.org/about/team');
  });
});

describe('isSameDomain', () => {
  it('returns true for exact domain match', () => {
    expect(isSameDomain('https://example.org/page', 'example.org')).toBe(true);
  });

  it('returns true for subdomain match', () => {
    expect(isSameDomain('https://www.example.org/page', 'example.org')).toBe(true);
    expect(isSameDomain('https://blog.example.org/page', 'example.org')).toBe(true);
  });

  it('returns false for different domain', () => {
    expect(isSameDomain('https://other.org/page', 'example.org')).toBe(false);
    expect(isSameDomain('https://example.com/page', 'example.org')).toBe(false);
  });
});

// ============================================================================
// Main Function Tests (with mocks)
// ============================================================================

describe('scrapeWebsite', () => {
  it('throws error when API key is missing', async () => {
    const originalEnv = process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;

    await expect(scrapeWebsite('https://example.org', {})).rejects.toThrow(
      'FIRECRAWL_API_KEY is required'
    );

    process.env.FIRECRAWL_API_KEY = originalEnv;
  });

  it('uses custom logger when provided', async () => {
    const mockLogger = createMockLogger();
    const mockMetrics = createMockMetrics();

    const originalEnv = process.env.FIRECRAWL_API_KEY;
    process.env.FIRECRAWL_API_KEY = 'test-key';

    // Use a short timeout to make test faster - we just want to verify logging starts
    const promise = scrapeWebsite(
      'https://example.org',
      { timeout: 100, maxRetries: 0 },
      mockLogger,
      mockMetrics
    );

    // Let it fail quickly
    try {
      await promise;
    } catch {
      // Expected to fail without real API or timeout
    }

    // Verify logger was called with initial message
    expect(mockLogger.calls.info.length).toBeGreaterThan(0);
    expect(mockLogger.calls.info[0][0]).toBe('Starting website scrape');

    process.env.FIRECRAWL_API_KEY = originalEnv;
  }, 15000); // Increase test timeout

  it('records metrics when provided', async () => {
    const mockLogger = createMockLogger();
    const mockMetrics = createMockMetrics();

    const originalEnv = process.env.FIRECRAWL_API_KEY;
    process.env.FIRECRAWL_API_KEY = 'test-key';

    // Use a short timeout to make test faster
    try {
      await scrapeWebsite(
        'https://example.org',
        { timeout: 100, maxRetries: 0 },
        mockLogger,
        mockMetrics
      );
    } catch {
      // Expected to fail without real API or timeout
    }

    // Verify metrics were recorded
    expect(mockMetrics.calls.increment.some(call => call[0] === 'scraper.started')).toBe(true);

    process.env.FIRECRAWL_API_KEY = originalEnv;
  }, 15000); // Increase test timeout
});

// ============================================================================
// Output Schema Validation Tests
// ============================================================================

describe('ScrapeOutput schema', () => {
  it('produces valid output structure', () => {
    // Create a sample output that matches the schema
    const output: ScrapeOutput = {
      scrape_meta: {
        started_at: '2024-01-15T10:00:00.000Z',
        completed_at: '2024-01-15T10:01:00.000Z',
        source_domain: 'example.org',
        tool: 'firecrawl',
        pages_fetched: 5,
      },
      pages: [
        {
          url: 'https://example.org/',
          final_url: 'https://example.org/',
          page_type: 'home',
          title: 'Welcome to Example Org',
          extracted_markdown: '# Welcome\n\nWe are a nonprofit.',
          ctas: ['Donate Now', 'Volunteer Today'],
          people_mentions: [],
        },
        {
          url: 'https://example.org/team',
          final_url: 'https://example.org/team',
          page_type: 'staff',
          title: 'Our Team',
          extracted_markdown: '# Our Team\n\nJohn Smith, CEO',
          ctas: [],
          people_mentions: [{ name: 'John Smith', role: 'CEO' }],
        },
      ],
      errors: [],
    };

    // Validate structure
    expect(output.scrape_meta).toBeDefined();
    expect(output.scrape_meta.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(output.scrape_meta.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(output.scrape_meta.tool).toBe('firecrawl');
    expect(typeof output.scrape_meta.pages_fetched).toBe('number');

    expect(Array.isArray(output.pages)).toBe(true);
    expect(Array.isArray(output.errors)).toBe(true);

    // Validate page structure
    const page = output.pages[0];
    expect(page.url).toBeDefined();
    expect(page.final_url).toBeDefined();
    expect(page.page_type).toBeDefined();
    expect(Array.isArray(page.ctas)).toBe(true);
    expect(Array.isArray(page.people_mentions)).toBe(true);
  });

  it('allows null title', () => {
    const output: ScrapeOutput = {
      scrape_meta: {
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        source_domain: 'example.org',
        tool: 'firecrawl',
        pages_fetched: 1,
      },
      pages: [
        {
          url: 'https://example.org/',
          final_url: 'https://example.org/',
          page_type: 'home',
          title: null,
          extracted_markdown: 'Content',
          ctas: [],
          people_mentions: [],
        },
      ],
      errors: [],
    };

    expect(output.pages[0].title).toBeNull();
  });

  it('allows null role in people_mentions', () => {
    const mention: PersonMention = {
      name: 'John Smith',
      role: null,
    };

    expect(mention.name).toBe('John Smith');
    expect(mention.role).toBeNull();
  });
});
