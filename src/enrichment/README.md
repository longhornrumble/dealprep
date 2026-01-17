# Person Enrichment Module

Implements person enrichment per **Implementation Spec Section 7**.

## Overview

The enrichment module provides optional, non-blocking person enrichment from LinkedIn profiles. It follows strict behavior constraints to ensure compliance with data privacy requirements.

### Key Behaviors

- Person enrichment is **OPTIONAL** and **NON-BLOCKING**
- Failure must not halt the pipeline
- Always returns valid `EnrichmentOutput` even on error
- Logs errors but never throws

### Allowed Behavior (Section 7.1)

- Summarize explicitly provided LinkedIn URLs
- Use configured safe enrichment providers

### Prohibited Behavior (Section 7.2)

- No scraping of restricted platforms as a requirement
- No guessing or hallucination

## API Reference

### `enrichPerson(input, config?, observability?)`

Main enrichment function that processes a canonical input and returns enrichment data.

```typescript
import { enrichPerson, type CanonicalInput, type EnrichmentConfig } from 'deal-prep-level-2/enrichment';

const input: CanonicalInput = {
  meta: {
    trigger_source: 'inbound',
    submitted_at: '2026-01-17T14:30:22.000Z',
    run_id: 'run_abc123',
  },
  organization: {
    name: 'Community Care Foundation',
    website: 'https://example.org',
    domain: 'example.org',
  },
  contact: {
    full_name: 'Jane Smith',
    linkedin_url: 'https://www.linkedin.com/in/janesmith',
  },
  notes: {},
  routing: {},
};

const config: EnrichmentConfig = {
  maxRetries: 1,
  retryBackoffMs: 30000,
  provider: {
    type: 'null', // or 'llm' or 'api'
  },
};

const result = await enrichPerson(input, config);
// result: EnrichmentOutput
```

### `summarizeLinkedIn(url, config, logger?)`

Lower-level function to summarize a specific LinkedIn profile URL.

```typescript
import { summarizeLinkedIn } from 'deal-prep-level-2/enrichment';

const summary = await summarizeLinkedIn(
  'https://www.linkedin.com/in/janesmith',
  { provider: { type: 'null' } }
);
// summary: { summary: string; confidence: 'high' | 'medium' | 'low' | 'not_available' }
```

### `getEnrichmentProvider(config?, logger?)`

Factory function to create an enrichment provider.

```typescript
import { getEnrichmentProvider } from 'deal-prep-level-2/enrichment';

// Default: NullEnrichmentProvider
const nullProvider = getEnrichmentProvider();

// LLM-based provider
const llmProvider = getEnrichmentProvider({
  type: 'llm',
  apiKey: 'your-api-key',
  apiUrl: 'https://api.anthropic.com/v1',
  llmModelId: 'claude-3-haiku-20240307',
});

// API-based provider
const apiProvider = getEnrichmentProvider({
  type: 'api',
  apiKey: 'your-api-key',
  apiUrl: 'https://api.enrichment-provider.com',
});
```

### `isValidLinkedInUrl(url)`

Validates that a URL is a valid LinkedIn profile URL.

```typescript
import { isValidLinkedInUrl } from 'deal-prep-level-2/enrichment';

isValidLinkedInUrl('https://www.linkedin.com/in/janesmith'); // true
isValidLinkedInUrl('https://www.linkedin.com/company/acme'); // false
isValidLinkedInUrl('https://twitter.com/user');             // false
```

## Output Schema (Section 7.3)

```typescript
interface EnrichmentOutput {
  requester_profile: {
    summary: string;           // "Not found" if unavailable
    confidence: 'high' | 'medium' | 'low' | 'not_available';
  };
  errors: string[];            // Array of error messages
}
```

When enrichment is unavailable:
- `summary` must be `"Not found"`
- `confidence` must be `"not_available"`

## Configuration

### EnrichmentConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `cacheEnabled` | boolean | undefined | Enable/disable caching |
| `cacheTTL` | number | undefined | Cache TTL in seconds |
| `timeout` | number | undefined | Request timeout in milliseconds |
| `maxRetries` | number | 1 | Maximum retry attempts per spec |
| `retryBackoffMs` | number | 30000 | Retry backoff (30s per spec) |
| `provider` | EnrichmentProviderConfig | undefined | Provider configuration |

### EnrichmentProviderConfig

| Property | Type | Description |
|----------|------|-------------|
| `type` | 'null' \| 'llm' \| 'api' | Provider type |
| `apiKey` | string | API key for external providers |
| `apiUrl` | string | API endpoint URL |
| `llmModelId` | string | LLM model ID (for 'llm' type) |

## Providers

### NullEnrichmentProvider

Default provider that returns "Not found" with "not_available" confidence. Use when:
- No enrichment is configured
- Testing the pipeline
- Enrichment is explicitly disabled

### LLMEnrichmentProvider

Uses an LLM to summarize publicly available LinkedIn data.

**Important:** This provider does NOT scrape LinkedIn directly (prohibited per Section 7.2). It expects pre-fetched profile data from a safe enrichment provider.

### APIEnrichmentProvider

Uses a configured safe enrichment API (e.g., Clearbit, Apollo, etc.) that is compliant with data privacy regulations.

## Observability

### Logging

The module accepts a custom logger implementing `EnrichmentLogger`:

```typescript
interface EnrichmentLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
```

Default logger outputs structured JSON to console:

```json
{
  "level": "info",
  "module": "enrichment",
  "message": "Starting person enrichment",
  "runId": "run_abc123",
  "timestamp": "2026-01-17T14:30:22.000Z"
}
```

### Metrics

The module accepts a custom metrics collector implementing `EnrichmentMetrics`:

```typescript
interface EnrichmentMetrics {
  incrementCounter(name: string, tags?: Record<string, string>): void;
  recordDuration(name: string, durationMs: number, tags?: Record<string, string>): void;
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;
}
```

Emitted metrics:
- `enrichment.started` - Counter: enrichment attempt started
- `enrichment.success` - Counter: enrichment completed successfully
- `enrichment.no_url` - Counter: no LinkedIn URL provided
- `enrichment.failed` - Counter: all attempts failed
- `enrichment.error` - Counter: individual attempt failed
- `enrichment.retry` - Counter: retry attempt
- `enrichment.duration_ms` - Duration: total enrichment time

## Example Usage in n8n

```javascript
// n8n Code Node
const { enrichPerson } = await import('deal-prep-level-2/enrichment');

const canonicalInput = $input.first().json;

const enrichmentConfig = {
  maxRetries: 1,
  retryBackoffMs: 30000,
  provider: {
    type: process.env.ENRICHMENT_PROVIDER || 'null',
    apiKey: process.env.ENRICHMENT_API_KEY,
    apiUrl: process.env.ENRICHMENT_API_URL,
  },
};

const result = await enrichPerson(canonicalInput, enrichmentConfig);

return { json: result };
```

## Example curl Commands

### Testing the Module Directly

The enrichment module is designed for programmatic use within n8n workflows, not as a standalone HTTP endpoint. However, you can test the module behavior using Node.js:

```bash
# Test with Node.js REPL
cd /path/to/Deal_prep_level-2
node --experimental-vm-modules -e "
import { enrichPerson, isValidLinkedInUrl } from './dist/enrichment/index.js';

// Test URL validation
console.log('Valid URL:', isValidLinkedInUrl('https://www.linkedin.com/in/janesmith'));
console.log('Invalid URL:', isValidLinkedInUrl('https://twitter.com/user'));

// Test enrichment
const input = {
  meta: {
    trigger_source: 'inbound',
    submitted_at: new Date().toISOString(),
    run_id: 'run_test_' + Date.now(),
  },
  organization: { name: 'Test Org' },
  contact: { linkedin_url: 'https://www.linkedin.com/in/janesmith' },
  notes: {},
  routing: {},
};

const result = await enrichPerson(input);
console.log('Result:', JSON.stringify(result, null, 2));
"
```

### If Exposed via n8n Webhook

If you expose the enrichment module via an n8n webhook workflow:

```bash
# Request with LinkedIn URL
curl -X POST https://your-n8n-instance/webhook/enrich-person \
  -H "Content-Type: application/json" \
  -d '{
    "meta": {
      "trigger_source": "inbound",
      "submitted_at": "2026-01-17T14:30:22.000Z",
      "run_id": "run_abc123"
    },
    "organization": {
      "name": "Community Care Foundation",
      "website": "https://example.org",
      "domain": "example.org"
    },
    "contact": {
      "full_name": "Jane Smith",
      "linkedin_url": "https://www.linkedin.com/in/janesmith"
    },
    "notes": {},
    "routing": {}
  }'

# Expected Response (with NullEnrichmentProvider)
# {
#   "requester_profile": {
#     "summary": "Not found",
#     "confidence": "not_available"
#   },
#   "errors": []
# }

# Request without LinkedIn URL
curl -X POST https://your-n8n-instance/webhook/enrich-person \
  -H "Content-Type: application/json" \
  -d '{
    "meta": {
      "trigger_source": "outbound",
      "submitted_at": "2026-01-17T14:30:22.000Z",
      "run_id": "run_def456"
    },
    "organization": {
      "name": "Test Organization"
    },
    "contact": {
      "full_name": "John Doe",
      "email": "john@example.com"
    },
    "notes": {},
    "routing": {}
  }'

# Expected Response
# {
#   "requester_profile": {
#     "summary": "Not found",
#     "confidence": "not_available"
#   },
#   "errors": []
# }
```

## Error Handling

The module is designed to be non-blocking. All errors are:
1. Logged with full context
2. Recorded in metrics
3. Added to the `errors` array in the output
4. Never thrown to halt the pipeline

```typescript
// Example output with errors
{
  "requester_profile": {
    "summary": "Not found",
    "confidence": "not_available"
  },
  "errors": [
    "Enrichment attempt 1 failed: Network timeout",
    "Enrichment attempt 2 failed: Network timeout"
  ]
}
```

## Running Tests

```bash
# Run all enrichment tests
npm test -- tests/unit/enrichment/
npm test -- tests/integration/enrichment/

# Run with coverage
npm test -- tests/unit/enrichment/ --coverage
```

## Security Considerations

1. **No Direct Scraping**: The module does not scrape LinkedIn or any restricted platforms directly
2. **Input Validation**: All LinkedIn URLs are validated before processing
3. **Safe Providers Only**: Only configured, compliant enrichment providers are used
4. **No Hallucination**: If data is unavailable, it returns "Not found" rather than guessing
5. **API Key Protection**: API keys are never logged (only `hasApiKey: true/false`)
