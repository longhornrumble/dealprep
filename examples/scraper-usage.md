# Scraper Module Usage Examples

This document provides usage examples for the Deal Prep Level 2 scraper module.

## Programmatic Usage (TypeScript/JavaScript)

### Basic Usage

```typescript
import { scrapeWebsite } from 'deal-prep-level-2/scraper';

// Scrape a website with default settings
const result = await scrapeWebsite('https://example.org');

console.log(`Pages fetched: ${result.scrape_meta.pages_fetched}`);
console.log(`Errors: ${result.errors.length}`);

for (const page of result.pages) {
  console.log(`${page.page_type}: ${page.url}`);
  console.log(`  Title: ${page.title}`);
  console.log(`  CTAs: ${page.ctas.join(', ')}`);
  console.log(`  People: ${page.people_mentions.map(p => p.name).join(', ')}`);
}
```

### With Configuration Options

```typescript
import { scrapeWebsite, type ScraperConfig } from 'deal-prep-level-2/scraper';

const config: ScraperConfig = {
  apiKey: process.env.FIRECRAWL_API_KEY,  // Or provide directly
  apiUrl: 'https://api.firecrawl.dev',     // Default
  maxPages: 25,                             // Max pages to crawl (default: 25)
  maxDepth: 3,                              // Max crawl depth (default: 3)
  timeout: 60000,                           // Request timeout in ms (default: 60000)
  maxRetries: 2,                            // Retry attempts (default: 2)
  verbose: false,                           // Enable verbose logging
};

const result = await scrapeWebsite('https://example.org', config);
```

### With Custom Logger and Metrics

```typescript
import { scrapeWebsite, type Logger, type Metrics } from 'deal-prep-level-2/scraper';

// Custom logger (e.g., for Datadog, CloudWatch, etc.)
const logger: Logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta),
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta),
};

// Custom metrics collector (e.g., for StatsD, Prometheus, etc.)
const metrics: Metrics = {
  increment: (metric, tags) => console.log(`Metric increment: ${metric}`, tags),
  gauge: (metric, value, tags) => console.log(`Metric gauge: ${metric} = ${value}`, tags),
  timing: (metric, value, tags) => console.log(`Metric timing: ${metric} = ${value}ms`, tags),
};

const result = await scrapeWebsite(
  'https://example.org',
  { maxPages: 10 },
  logger,
  metrics
);
```

### Legacy API (n8n Integration)

```typescript
import { crawlWebsite, type FirecrawlConfig, type ModuleResult } from 'deal-prep-level-2/scraper';
import { createStorageAdapter } from 'deal-prep-level-2/storage';

const storage = createStorageAdapter({
  type: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
});

const config: FirecrawlConfig = {
  apiKey: process.env.FIRECRAWL_API_KEY!,
};

const result = await crawlWebsite(
  'https://example.org',
  'run_abc123',
  storage,
  config,
  { maxPages: 15, maxDepth: 2 }
);

if (result.success) {
  console.log(`Scraped ${result.data.pages.length} pages`);
} else {
  console.error(`Error: ${result.error?.message}`);
}
```

## Output Schema

The scraper returns data conforming to Implementation Spec Section 6.3:

```json
{
  "scrape_meta": {
    "started_at": "2024-01-15T10:00:00.000Z",
    "completed_at": "2024-01-15T10:01:30.000Z",
    "source_domain": "example.org",
    "tool": "firecrawl",
    "pages_fetched": 12
  },
  "pages": [
    {
      "url": "https://example.org/",
      "final_url": "https://example.org/",
      "page_type": "home",
      "title": "Welcome to Example Org",
      "extracted_markdown": "# Welcome\n\nWe help communities...",
      "ctas": ["Donate Now", "Volunteer Today", "Learn More"],
      "people_mentions": []
    },
    {
      "url": "https://example.org/team",
      "final_url": "https://example.org/team",
      "page_type": "staff",
      "title": "Our Team",
      "extracted_markdown": "# Our Team\n\nJohn Smith, Executive Director...",
      "ctas": ["Contact Us"],
      "people_mentions": [
        { "name": "John Smith", "role": "Executive Director" },
        { "name": "Jane Doe", "role": "Program Manager" }
      ]
    }
  ],
  "errors": []
}
```

## Page Types

The scraper classifies pages into the following types per Implementation Spec Section 6.1:

| Type | URL Patterns | Keywords |
|------|--------------|----------|
| `home` | `/`, `/index.html`, `/home` | welcome, homepage |
| `about` | `/about`, `/who-we-are`, `/mission` | about us, our mission |
| `programs` | `/programs`, `/services`, `/what-we-do` | our programs, what we do |
| `volunteer` | `/volunteer`, `/get-involved` | volunteer, join us |
| `donate` | `/donate`, `/give`, `/support-us` | donate, give, support |
| `faq` | `/faq`, `/frequently-asked` | faq, questions |
| `staff` | `/staff`, `/team`, `/leadership` | our team, leadership |
| `contact` | `/contact`, `/get-in-touch` | contact us |
| `other` | (default) | - |

## Error Handling

Per Implementation Spec Section 6.5, errors do not halt execution:

```typescript
const result = await scrapeWebsite('https://example.org');

// Check for errors but continue processing
if (result.errors.length > 0) {
  console.warn('Some pages failed to scrape:');
  result.errors.forEach(err => console.warn(`  - ${err}`));
}

// Process successfully scraped pages
for (const page of result.pages) {
  // ... process page
}
```

## Testing with curl

You can test the Firecrawl API directly:

```bash
# Map website URLs
curl -X POST https://api.firecrawl.dev/v1/map \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -d '{
    "url": "https://example.org",
    "limit": 25,
    "ignoreSitemap": false
  }'

# Scrape a single URL
curl -X POST https://api.firecrawl.dev/v1/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -d '{
    "url": "https://example.org",
    "formats": ["markdown"],
    "onlyMainContent": true
  }'

# Start a full crawl
curl -X POST https://api.firecrawl.dev/v1/crawl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -d '{
    "url": "https://example.org",
    "limit": 25,
    "maxDepth": 3,
    "allowExternalLinks": false,
    "scrapeOptions": {
      "formats": ["markdown"],
      "onlyMainContent": true
    }
  }'

# Check crawl status (replace CRAWL_ID with actual ID)
curl https://api.firecrawl.dev/v1/crawl/CRAWL_ID \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIRECRAWL_API_KEY` | Yes | API key for Firecrawl service |

## Metrics Emitted

The scraper emits the following metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `scraper.started` | counter | Scrape job started |
| `scraper.duration` | timing | Total scrape duration in ms |
| `scraper.pages_fetched` | gauge | Number of pages fetched |
| `scraper.errors` | gauge | Number of errors encountered |
| `scraper.crawl.progress` | gauge | Pages completed (during crawl) |

## Logs Emitted

The scraper logs at the following levels:

- **INFO**: Starting scrape, crawl progress, completion
- **WARN**: Retry attempts, page failures, fallback strategies
- **ERROR**: Fatal errors, all strategies failed
- **DEBUG**: API calls, URL processing
