/**
 * Scraper Module - Level 2 Deal Preparation
 *
 * Implements website scraping per Implementation Spec Section 6
 *
 * Features:
 * - Firecrawl API integration for web scraping
 * - Page type classification (home, about, programs, volunteer, donate, faq, staff, contact)
 * - CTA extraction from page content
 * - People mention extraction (names + roles from staff pages)
 * - Retry logic with exponential backoff (30s, 120s)
 * - Sitemap discovery with link traversal fallback
 * - Max pages (default 25) and max depth (default 3) constraints
 *
 * Usage:
 * ```typescript
 * const { scrapeWebsite } = await import('deal-prep-level-2/scraper');
 * const result = await scrapeWebsite('https://example.org', {
 *   maxPages: 25,
 *   maxDepth: 3,
 * });
 * ```
 */

import axios, { type AxiosInstance } from 'axios';
import type { RunId, StorageAdapter, ModuleResult } from '../types/index.js';

// ============================================================================
// Type Definitions (per Implementation Spec Section 6.3)
// ============================================================================

/**
 * Page type classification enum
 */
export type PageType =
  | 'home'
  | 'about'
  | 'programs'
  | 'volunteer'
  | 'donate'
  | 'faq'
  | 'staff'
  | 'contact'
  | 'other';

/**
 * Person mention with name and optional role
 */
export interface PersonMention {
  name: string;
  role: string | null;
}

/**
 * Scraped page data structure
 */
export interface ScrapedPage {
  url: string;
  final_url: string;
  page_type: PageType;
  title: string | null;
  extracted_markdown: string;
  ctas: string[];
  people_mentions: PersonMention[];
}

/**
 * Scrape metadata
 */
export interface ScrapeMeta {
  started_at: string;
  completed_at: string;
  source_domain: string;
  tool: string;
  pages_fetched: number;
}

/**
 * Canonical scrape output schema (per Implementation Spec Section 6.3)
 */
export interface ScrapeOutput {
  scrape_meta: ScrapeMeta;
  pages: ScrapedPage[];
  errors: string[];
}

/**
 * Configuration for the scraper
 */
export interface ScraperConfig {
  /** Firecrawl API key (from FIRECRAWL_API_KEY env var) */
  apiKey?: string;
  /** Firecrawl API URL (default: https://api.firecrawl.dev) */
  apiUrl?: string;
  /** Maximum pages to fetch (default: 25) */
  maxPages?: number;
  /** Maximum crawl depth (default: 3) */
  maxDepth?: number;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Maximum retries for failed requests (default: 2) */
  maxRetries?: number;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Internal config with all defaults applied
 */
interface ResolvedConfig {
  apiKey: string;
  apiUrl: string;
  maxPages: number;
  maxDepth: number;
  timeout: number;
  maxRetries: number;
  verbose: boolean;
}

/**
 * Logger interface for observability
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Metrics interface for observability
 */
export interface Metrics {
  increment(metric: string, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Default console logger implementation
 */
const defaultLogger: Logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ? JSON.stringify(meta) : ''),
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : ''),
};

/**
 * Default no-op metrics implementation
 */
const defaultMetrics: Metrics = {
  increment: () => {},
  gauge: () => {},
  timing: () => {},
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Omit<ResolvedConfig, 'apiKey'> = {
  apiUrl: 'https://api.firecrawl.dev',
  maxPages: 25,
  maxDepth: 3,
  timeout: 60000,
  maxRetries: 2,
  verbose: false,
};

/** Retry backoff delays in milliseconds per Implementation Spec Section 6.5 */
const RETRY_DELAYS_MS = [30000, 120000]; // 30s, 120s

/** Target page types per Implementation Spec Section 6.1 */
const _TARGET_PAGE_TYPES: PageType[] = [
  'home',
  'about',
  'programs',
  'volunteer',
  'donate',
  'faq',
  'staff',
  'contact',
];
void _TARGET_PAGE_TYPES; // Reserved for future prioritization logic

// ============================================================================
// Page Type Classification
// ============================================================================

/**
 * URL patterns for page type classification
 */
const PAGE_TYPE_PATTERNS: Record<PageType, RegExp[]> = {
  home: [/^\/$/, /^\/index\.html?$/i, /^\/home$/i],
  about: [
    /\/about/i,
    /\/who-we-are/i,
    /\/our-story/i,
    /\/mission/i,
    /\/history/i,
    /\/overview/i,
  ],
  programs: [
    /\/programs?$/i,
    /\/services?$/i,
    /programs/i, // Match programs anywhere in path
    /services/i, // Match services anywhere in path
    /\/what-we-do/i,
    /\/offerings?/i,
    /\/initiatives?/i,
    /\/projects?/i,
  ],
  volunteer: [
    /\/volunteer/i,
    /\/get-involved/i,
    /\/join-us/i,
    /\/opportunities/i,
    /\/help-out/i,
  ],
  donate: [
    /\/donate/i,
    /\/donation/i,
    /\/give/i,
    /\/support-us/i,
    /\/contribute/i,
    /\/fundrais/i,
  ],
  faq: [/\/faq/i, /\/frequently-asked/i, /\/questions/i, /\/help$/i, /\/support$/i],
  staff: [
    /\/staff/i,
    /\/team/i,
    /\/leadership/i,
    /\/board/i,
    /\/people/i,
    /\/executives?/i,
    /\/directors?$/i,
    /\/management/i,
  ],
  contact: [/\/contact/i, /\/reach-us/i, /\/get-in-touch/i, /\/locations?$/i],
  other: [],
};

/**
 * Title/content keywords for page type classification fallback
 */
const PAGE_TYPE_KEYWORDS: Record<PageType, string[]> = {
  home: ['welcome', 'homepage'],
  about: ['about us', 'our mission', 'who we are', 'our story', 'our history'],
  programs: ['our programs', 'our services', 'what we do', 'our offerings'],
  volunteer: ['volunteer', 'get involved', 'join us', 'help out'],
  donate: ['donate', 'give', 'support us', 'contribute', 'make a gift'],
  faq: ['frequently asked', 'faq', 'questions', 'help center'],
  staff: ['our team', 'our staff', 'leadership', 'board of directors', 'meet the team'],
  contact: ['contact us', 'get in touch', 'reach us', 'our location'],
  other: [],
};

/**
 * Classify a page based on its URL and content
 */
export function classifyPageType(
  url: string,
  title: string | null,
  markdown: string
): PageType {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname.toLowerCase();

  // First, check URL patterns
  for (const [pageType, patterns] of Object.entries(PAGE_TYPE_PATTERNS) as [
    PageType,
    RegExp[]
  ][]) {
    if (pageType === 'other') continue;
    for (const pattern of patterns) {
      if (pattern.test(pathname)) {
        return pageType;
      }
    }
  }

  // Check if root path (home page)
  if (pathname === '/' || pathname === '' || pathname === '/index.html') {
    return 'home';
  }

  // Fallback: check title and content for keywords
  const searchText = `${title || ''} ${markdown.substring(0, 2000)}`.toLowerCase();

  for (const [pageType, keywords] of Object.entries(PAGE_TYPE_KEYWORDS) as [
    PageType,
    string[]
  ][]) {
    if (pageType === 'other') continue;
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        return pageType;
      }
    }
  }

  return 'other';
}

// ============================================================================
// CTA Extraction
// ============================================================================

/**
 * Common CTA patterns to look for in content
 */
const CTA_PATTERNS: RegExp[] = [
  // Markdown links with action words
  /\[([^\]]*(?:donate|give|volunteer|join|sign up|subscribe|register|apply|contact|learn more|get started|request|schedule|book)[^\]]*)\]\([^)]+\)/gi,
  // Button-like text patterns
  /(?:^|\n)\s*(?:donate now|give now|volunteer today|join us|sign up|subscribe|apply now|contact us|learn more|get started|request info|schedule|book now)\s*(?:\n|$)/gim,
  // Action phrases
  /(?:click here to|tap to|press to)\s+([^.!?\n]+)/gi,
];

/**
 * Extract CTAs (call-to-action) from page content
 */
export function extractCTAs(markdown: string): string[] {
  const ctas: Set<string> = new Set();

  for (const pattern of CTA_PATTERNS) {
    const matches = markdown.matchAll(pattern);
    for (const match of matches) {
      // Get the captured group or full match
      const ctaText = (match[1] || match[0]).trim();
      // Clean up and normalize
      const cleaned = ctaText
        .replace(/\[|\]|\(|\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length > 2 && cleaned.length < 100) {
        ctas.add(cleaned);
      }
    }
  }

  // Also look for markdown links that might be CTAs
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const linkMatches = markdown.matchAll(linkPattern);
  for (const match of linkMatches) {
    const linkTextRaw = match[1];
    if (!linkTextRaw) continue;
    const linkText = linkTextRaw.toLowerCase();
    const actionWords = [
      'donate',
      'give',
      'volunteer',
      'join',
      'sign up',
      'subscribe',
      'register',
      'apply',
      'contact',
      'learn',
      'get started',
      'request',
      'schedule',
      'book',
      'support',
    ];
    if (actionWords.some((word) => linkText.includes(word))) {
      ctas.add(linkTextRaw.trim());
    }
  }

  return Array.from(ctas).slice(0, 20); // Limit to 20 CTAs
}

// ============================================================================
// People Mention Extraction
// ============================================================================

/**
 * Common title/role patterns
 */
const ROLE_PATTERNS: RegExp[] = [
  // Title patterns like "Name, Title" or "Name - Title"
  /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*[,\-]\s*([A-Za-z\s]+(?:Director|Manager|CEO|CFO|COO|President|Vice President|VP|Executive|Officer|Founder|Co-Founder|Chair|Chairman|Chairwoman|Coordinator|Specialist|Lead|Head|Chief|Administrator|Supervisor)(?:\s+of\s+[A-Za-z\s]+)?)/gm,
  // Patterns like "Title: Name" or "Title - Name"
  /(?:^|\n)\s*([A-Za-z\s]+(?:Director|Manager|CEO|CFO|COO|President|Vice President|VP|Executive|Officer|Founder|Co-Founder|Chair|Chairman|Chairwoman|Coordinator|Specialist|Lead|Head|Chief|Administrator|Supervisor)(?:\s+of\s+[A-Za-z\s]+)?)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/gm,
  // Markdown bold names followed by role
  /\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\*\*\s*[,\-]?\s*([A-Za-z\s]+(?:Director|Manager|CEO|CFO|COO|President|Vice President|VP|Executive|Officer|Founder|Co-Founder|Chair|Chairman|Chairwoman|Coordinator|Specialist|Lead|Head|Chief|Administrator|Supervisor)(?:\s+of\s+[A-Za-z\s]+)?)/gm,
];

/**
 * Name-only patterns for staff pages
 */
const NAME_ONLY_PATTERNS: RegExp[] = [
  // Markdown headers with names
  /^#{1,4}\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/gm,
  // Bold names
  /\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\*\*/g,
  // Names in list items (staff lists)
  /^[\-\*]\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/gm,
];

/**
 * Common non-person words to filter out
 */
const NON_PERSON_WORDS = new Set([
  'the',
  'our',
  'about',
  'contact',
  'home',
  'donate',
  'volunteer',
  'programs',
  'services',
  'mission',
  'vision',
  'board',
  'staff',
  'team',
  'leadership',
  'join',
  'give',
  'support',
  'news',
  'events',
  'gallery',
  'resources',
  'faq',
  'questions',
  'meet',
  'learn',
  'more',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]);

/**
 * Validate if a string looks like a person's name
 */
function isLikelyPersonName(name: string): boolean {
  const words = name.toLowerCase().split(/\s+/);

  // Must have at least 2 words (first and last name)
  if (words.length < 2 || words.length > 4) {
    return false;
  }

  // Check if any word is a common non-person word
  if (words.some((word) => NON_PERSON_WORDS.has(word))) {
    return false;
  }

  // Each word should start with capital letter and be reasonable length
  const namePattern = /^[A-Z][a-z]{1,20}$/;
  const originalWords = name.split(/\s+/);
  return originalWords.every((word) => namePattern.test(word));
}

/**
 * Extract people mentions from page content
 */
export function extractPeopleMentions(
  markdown: string,
  pageType: PageType
): PersonMention[] {
  const mentions: Map<string, PersonMention> = new Map();

  // First, try role patterns
  for (const pattern of ROLE_PATTERNS) {
    const matches = markdown.matchAll(pattern);
    for (const match of matches) {
      let name: string;
      let role: string;

      // Determine which capture group is name vs role
      if (
        match[1] &&
        match[2] &&
        /^[A-Z][a-z]+/.test(match[1]) &&
        !/Director|Manager|CEO/i.test(match[1])
      ) {
        name = match[1].trim();
        role = match[2].trim();
      } else if (match[2] && match[1]) {
        name = match[2].trim();
        role = match[1].trim();
      } else {
        continue;
      }

      if (isLikelyPersonName(name) && !mentions.has(name)) {
        mentions.set(name, { name, role });
      }
    }
  }

  // For staff/leadership pages, also look for name-only patterns
  if (pageType === 'staff' || mentions.size < 3) {
    for (const pattern of NAME_ONLY_PATTERNS) {
      const matches = markdown.matchAll(pattern);
      for (const match of matches) {
        const nameMatch = match[1];
        if (!nameMatch) continue;
        const name = nameMatch.trim();
        if (isLikelyPersonName(name) && !mentions.has(name)) {
          mentions.set(name, { name, role: null });
        }
      }
    }
  }

  return Array.from(mentions.values()).slice(0, 50); // Limit to 50 people
}

// ============================================================================
// URL Utilities
// ============================================================================

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    // Try to extract domain from malformed URL
    const match = url.match(/(?:https?:\/\/)?([^\/]+)/);
    return match?.[1] ?? url;
  }
}

/**
 * Normalize URL for deduplication
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash, hash, and common tracking params
    let normalized = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    normalized = normalized.replace(/\/+$/, '');
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Check if URL is on the same domain
 */
export function isSameDomain(url: string, baseDomain: string): boolean {
  try {
    const urlDomain = extractDomain(url);
    return (
      urlDomain === baseDomain ||
      urlDomain.endsWith(`.${baseDomain}`) ||
      baseDomain.endsWith(`.${urlDomain}`)
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic per Implementation Spec Section 6.5
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  logger: Logger,
  context: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`${context} attempt ${attempt + 1} failed`, {
        error: lastError.message,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
      });

      if (attempt < maxRetries) {
        const delayMs = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 30000;
        logger.info(`Retrying ${context} in ${delayMs / 1000}s...`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error(`${context} failed after ${maxRetries + 1} attempts`);
}

// ============================================================================
// Firecrawl API Client
// ============================================================================

interface FirecrawlMapResponse {
  success: boolean;
  links?: string[];
  error?: string;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
      statusCode?: number;
    };
  };
  error?: string;
}

interface FirecrawlCrawlResponse {
  success: boolean;
  id?: string;
  error?: string;
}

interface FirecrawlCrawlStatusResponse {
  success: boolean;
  status: 'scraping' | 'completed' | 'failed' | 'cancelled';
  completed: number;
  total: number;
  data?: Array<{
    markdown?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
      statusCode?: number;
    };
  }>;
  error?: string;
}

/**
 * Create Firecrawl API client
 */
function createFirecrawlClient(config: ResolvedConfig): AxiosInstance {
  return axios.create({
    baseURL: config.apiUrl,
    timeout: config.timeout,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
  });
}

/**
 * Map website URLs using Firecrawl
 */
async function mapWebsite(
  client: AxiosInstance,
  url: string,
  logger: Logger
): Promise<string[]> {
  logger.debug('Mapping website URLs', { url });

  const response = await client.post<FirecrawlMapResponse>('/v1/map', {
    url,
    limit: 100,
    ignoreSitemap: false,
    includeSubdomains: false,
  });

  if (!response.data.success) {
    throw new Error(`Map failed: ${response.data.error || 'Unknown error'}`);
  }

  return response.data.links || [];
}

/**
 * Scrape a single URL using Firecrawl
 */
async function scrapeUrl(
  client: AxiosInstance,
  url: string,
  logger: Logger
): Promise<FirecrawlScrapeResponse['data']> {
  logger.debug('Scraping URL', { url });

  const response = await client.post<FirecrawlScrapeResponse>('/v1/scrape', {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    excludeTags: ['nav', 'footer', 'header', 'aside', 'script', 'style', 'noscript'],
  });

  if (!response.data.success) {
    throw new Error(`Scrape failed: ${response.data.error || 'Unknown error'}`);
  }

  return response.data.data;
}

/**
 * Initiate async crawl using Firecrawl
 */
async function startCrawl(
  client: AxiosInstance,
  url: string,
  maxPages: number,
  maxDepth: number,
  logger: Logger
): Promise<string> {
  logger.debug('Starting crawl', { url, maxPages, maxDepth });

  const response = await client.post<FirecrawlCrawlResponse>('/v1/crawl', {
    url,
    limit: maxPages,
    maxDepth,
    allowExternalLinks: false,
    ignoreSitemap: false,
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      excludeTags: ['nav', 'footer', 'header', 'aside', 'script', 'style', 'noscript'],
    },
  });

  if (!response.data.success || !response.data.id) {
    throw new Error(`Crawl start failed: ${response.data.error || 'Unknown error'}`);
  }

  return response.data.id;
}

/**
 * Check crawl status and get results
 */
async function checkCrawlStatus(
  client: AxiosInstance,
  crawlId: string,
  logger: Logger
): Promise<FirecrawlCrawlStatusResponse> {
  logger.debug('Checking crawl status', { crawlId });

  const response = await client.get<FirecrawlCrawlStatusResponse>(`/v1/crawl/${crawlId}`);

  if (!response.data.success && response.data.status === 'failed') {
    throw new Error(`Crawl failed: ${response.data.error || 'Unknown error'}`);
  }

  return response.data;
}

/**
 * Poll crawl until completion
 */
async function waitForCrawl(
  client: AxiosInstance,
  crawlId: string,
  logger: Logger,
  metrics: Metrics,
  pollIntervalMs: number = 2000
): Promise<FirecrawlCrawlStatusResponse['data']> {
  const startTime = Date.now();
  let status: FirecrawlCrawlStatusResponse;

  while (true) {
    status = await checkCrawlStatus(client, crawlId, logger);

    logger.info('Crawl progress', {
      status: status.status,
      completed: status.completed,
      total: status.total,
    });

    metrics.gauge('scraper.crawl.progress', status.completed, { crawl_id: crawlId });

    if (status.status === 'completed') {
      break;
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(`Crawl ${status.status}: ${status.error || 'Unknown error'}`);
    }

    await sleep(pollIntervalMs);

    // Timeout after 5 minutes
    if (Date.now() - startTime > 300000) {
      throw new Error('Crawl timed out after 5 minutes');
    }
  }

  return status.data || [];
}

// ============================================================================
// Main Scraper Function
// ============================================================================

/**
 * Scrape a website and return structured output per Implementation Spec Section 6
 *
 * @param url - The website URL to scrape
 * @param config - Scraper configuration options
 * @param logger - Optional logger for observability
 * @param metrics - Optional metrics collector
 * @returns Canonical ScrapeOutput per spec Section 6.3
 */
export async function scrapeWebsite(
  url: string,
  config: ScraperConfig = {},
  logger: Logger = defaultLogger,
  metrics: Metrics = defaultMetrics
): Promise<ScrapeOutput> {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  // Resolve configuration with defaults
  const resolvedConfig: ResolvedConfig = {
    apiKey: config.apiKey || process.env.FIRECRAWL_API_KEY || '',
    apiUrl: config.apiUrl || DEFAULT_CONFIG.apiUrl,
    maxPages: config.maxPages ?? DEFAULT_CONFIG.maxPages,
    maxDepth: config.maxDepth ?? DEFAULT_CONFIG.maxDepth,
    timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
    verbose: config.verbose ?? DEFAULT_CONFIG.verbose,
  };

  if (!resolvedConfig.apiKey) {
    throw new Error('FIRECRAWL_API_KEY is required. Set it in config or environment variable.');
  }

  const domain = extractDomain(url);
  const errors: string[] = [];
  const pages: ScrapedPage[] = [];
  const seenUrls = new Set<string>();

  logger.info('Starting website scrape', {
    url,
    domain,
    maxPages: resolvedConfig.maxPages,
    maxDepth: resolvedConfig.maxDepth,
  });

  metrics.increment('scraper.started', { domain });

  const client = createFirecrawlClient(resolvedConfig);

  try {
    // Strategy 1: Try full crawl first
    logger.info('Attempting full website crawl');

    const crawlId = await withRetry(
      () => startCrawl(client, url, resolvedConfig.maxPages, resolvedConfig.maxDepth, logger),
      resolvedConfig.maxRetries,
      logger,
      'Start crawl'
    );

    const crawlData = await waitForCrawl(client, crawlId, logger, metrics);

    // Process crawl results
    for (const page of crawlData || []) {
      if (!page.metadata?.sourceURL || !page.markdown) {
        continue;
      }

      const pageUrl = page.metadata.sourceURL;
      const normalizedUrl = normalizeUrl(pageUrl);

      // Deduplicate by final URL
      if (seenUrls.has(normalizedUrl)) {
        continue;
      }
      seenUrls.add(normalizedUrl);

      // Skip external domains
      if (!isSameDomain(pageUrl, domain)) {
        continue;
      }

      const pageType = classifyPageType(pageUrl, page.metadata.title || null, page.markdown);
      const ctas = extractCTAs(page.markdown);
      const peopleMentions = extractPeopleMentions(page.markdown, pageType);

      pages.push({
        url: pageUrl,
        final_url: pageUrl,
        page_type: pageType,
        title: page.metadata.title || null,
        extracted_markdown: page.markdown,
        ctas,
        people_mentions: peopleMentions,
      });
    }

    logger.info('Crawl completed', {
      pagesFound: pages.length,
      duration: Date.now() - startTime,
    });
  } catch (crawlError) {
    const errorMessage =
      crawlError instanceof Error ? crawlError.message : String(crawlError);
    errors.push(`Crawl error: ${errorMessage}`);
    logger.warn('Full crawl failed, falling back to map + individual scrapes', {
      error: errorMessage,
    });

    // Strategy 2: Fall back to map + individual URL scraping
    try {
      const mappedUrls = await withRetry(
        () => mapWebsite(client, url, logger),
        resolvedConfig.maxRetries,
        logger,
        'Map website'
      );

      logger.info('Website mapped', { urlCount: mappedUrls.length });

      // Filter to same domain and prioritize target page types
      const filteredUrls = mappedUrls
        .filter((mappedUrl) => isSameDomain(mappedUrl, domain))
        .slice(0, resolvedConfig.maxPages);

      // Scrape each URL individually
      for (const pageUrl of filteredUrls) {
        const normalizedUrl = normalizeUrl(pageUrl);
        if (seenUrls.has(normalizedUrl)) {
          continue;
        }

        try {
          const pageData = await withRetry(
            () => scrapeUrl(client, pageUrl, logger),
            resolvedConfig.maxRetries,
            logger,
            `Scrape ${pageUrl}`
          );

          if (pageData && pageData.markdown) {
            seenUrls.add(normalizedUrl);

            const pageType = classifyPageType(
              pageUrl,
              pageData.metadata?.title || null,
              pageData.markdown
            );
            const ctas = extractCTAs(pageData.markdown);
            const peopleMentions = extractPeopleMentions(pageData.markdown, pageType);

            pages.push({
              url: pageUrl,
              final_url: pageData.metadata?.sourceURL || pageUrl,
              page_type: pageType,
              title: pageData.metadata?.title || null,
              extracted_markdown: pageData.markdown,
              ctas,
              people_mentions: peopleMentions,
            });
          }
        } catch (scrapeError) {
          const scrapeErrorMsg =
            scrapeError instanceof Error ? scrapeError.message : String(scrapeError);
          errors.push(`Failed to scrape ${pageUrl}: ${scrapeErrorMsg}`);
          logger.warn('Page scrape failed', { url: pageUrl, error: scrapeErrorMsg });
        }
      }
    } catch (mapError) {
      const mapErrorMsg = mapError instanceof Error ? mapError.message : String(mapError);
      errors.push(`Map error: ${mapErrorMsg}`);
      logger.error('Map fallback also failed', { error: mapErrorMsg });
    }
  }

  const completedAt = new Date().toISOString();
  const duration = Date.now() - startTime;

  // Record metrics
  metrics.timing('scraper.duration', duration, { domain });
  metrics.gauge('scraper.pages_fetched', pages.length, { domain });
  metrics.gauge('scraper.errors', errors.length, { domain });

  logger.info('Scrape completed', {
    domain,
    pagesFetched: pages.length,
    errorCount: errors.length,
    durationMs: duration,
  });

  return {
    scrape_meta: {
      started_at: startedAt,
      completed_at: completedAt,
      source_domain: domain,
      tool: 'firecrawl',
      pages_fetched: pages.length,
    },
    pages,
    errors,
  };
}

// ============================================================================
// Legacy API (for backward compatibility with existing scaffold)
// ============================================================================

/**
 * Legacy config interface
 */
export interface FirecrawlConfig {
  apiKey: string;
  apiUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Legacy scrape options
 */
export interface ScrapeOptions {
  formats?: Array<'markdown' | 'html' | 'screenshot'>;
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  maxDepth?: number;
}

/**
 * Legacy interface - preserved for n8n integration compatibility
 * @deprecated Use scrapeWebsite() directly instead
 */
export async function crawlWebsite(
  url: string,
  runId: RunId,
  storage: StorageAdapter,
  config: FirecrawlConfig,
  options?: ScrapeOptions & { maxPages?: number }
): Promise<ModuleResult<ScrapeOutput>> {
  const startTime = Date.now();

  try {
    const scraperConfig: ScraperConfig = {
      apiKey: config.apiKey,
    };
    if (config.apiUrl) scraperConfig.apiUrl = config.apiUrl;
    if (config.timeout) scraperConfig.timeout = config.timeout;
    if (config.maxRetries) scraperConfig.maxRetries = config.maxRetries;
    if (options?.maxPages) scraperConfig.maxPages = options.maxPages;
    if (options?.maxDepth) scraperConfig.maxDepth = options.maxDepth;

    const result = await scrapeWebsite(url, scraperConfig);

    // Store artifact if storage is provided
    if (storage) {
      await storage.save(runId, 'scraped', JSON.stringify(result, null, 2), {
        contentType: 'application/json',
        domain: result.scrape_meta.source_domain,
        pageCount: result.pages.length,
      });
    }

    return {
      success: true,
      data: result,
      metadata: {
        runId,
        module: 'scraper',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: 'SCRAPE_ERROR',
        message: errorMessage,
        details: error,
      },
      metadata: {
        runId,
        module: 'scraper',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      },
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  scrapeWebsite,
  crawlWebsite,
  classifyPageType,
  extractCTAs,
  extractPeopleMentions,
  extractDomain,
  normalizeUrl,
  isSameDomain,
};
