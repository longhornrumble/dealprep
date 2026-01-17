# Deal Prep Level 2

Production sales-enablement system for generating comprehensive Deal Preparation Briefs with n8n orchestration, Claude AI synthesis, and AWS infrastructure.

## Overview

Deal Prep Level 2 is a modular TypeScript system designed to:
1. Accept sales prospect information (company, contact, context)
2. Gather intelligence from web scraping and LinkedIn enrichment
3. Synthesize insights using Claude AI
4. Generate actionable Deal Preparation Briefs
5. Deliver formatted output to CRM, email, and task management systems

## Architecture

### Design Principles
- **Modular**: Each module is independently callable via n8n Code nodes
- **Artifact-based**: Modules communicate through S3-stored artifacts (no direct coupling)
- **Idempotent**: RunID-based deduplication prevents duplicate processing
- **Type-safe**: Full TypeScript with strict mode for reliability
- **Testable**: Adapter pattern enables easy mocking and testing

### Directory Structure

```
Deal_prep_level-2/
├── src/                          # Source code modules
│   ├── types/                    # Shared TypeScript type definitions
│   ├── normalizer/               # Input canonicalization
│   ├── run-manager/              # Run ID generation, idempotency
│   ├── storage/                  # StorageAdapter interface + S3 implementation
│   ├── scraper/                  # Website extraction via Firecrawl
│   ├── enrichment/               # LinkedIn person enrichment
│   ├── synthesizer/              # LLM brief generation with Claude
│   ├── validator/                # Schema and business rule validation
│   ├── renderers/                # Output formatting (CRM, Email, Motion, Markdown)
│   └── adapters/                 # External system integrations
├── schemas/                      # JSON Schema definitions
│   ├── normalized-input.schema.json
│   └── deal-prep-brief.schema.json
├── prompts/                      # LLM prompt templates
│   ├── synthesize-brief.md       # Main brief generation prompt
│   └── email-template.html       # HTML email template
├── n8n/                          # n8n workflow definitions (to be added)
├── tests/                        # Test harnesses
│   ├── unit/                     # Unit tests for individual modules
│   ├── integration/              # Integration tests
│   └── fixtures/                 # Test data fixtures
├── examples/                     # Example inputs and outputs
│   ├── sample-input.json         # Example normalized input
│   └── sample-brief.json         # Example generated brief
├── docs/                         # Documentation
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

## Module Boundaries

### 1. Normalizer (`src/normalizer/`)
**Responsibilities:**
- Accept raw input from n8n webhooks, APIs, or manual entry
- Canonicalize to `NormalizedInput` schema
- Validate required fields
- Apply default values and sanitization

**Key Functions:**
- `normalize(rawInput, config)` - Convert raw input to canonical format
- `validateInput(input)` - Validate normalized input

**Usage in n8n:**
```javascript
const { normalize } = await import('deal-prep-level-2/normalizer');
const result = normalize($input.all());
```

### 2. Run Manager (`src/run-manager/`)
**Responsibilities:**
- Generate unique RunIDs (format: `YYYYMMDD_HHMMSS_nanoid`)
- Implement idempotency checks
- Manage run lifecycle and state tracking

**Key Functions:**
- `generateRunId()` - Create unique run identifier
- `createRun(input, idempotencyKey)` - Start new run with deduplication
- `checkIdempotency(input)` - Check for existing runs
- `updateRunStatus(runId, status)` - Update run state
- `getRunMetadata(runId)` - Retrieve run information

**Usage in n8n:**
```javascript
const { createRun } = await import('deal-prep-level-2/run-manager');
const { data: runMetadata } = await createRun(normalizedInput);
```

### 3. Storage (`src/storage/`)
**Responsibilities:**
- Define `StorageAdapter` interface
- Implement S3-based artifact storage
- Handle artifact CRUD operations with metadata
- Support versioning and cleanup

**Key Classes:**
- `S3StorageAdapter` - Production S3 implementation
- `MemoryStorageAdapter` - In-memory implementation for testing

**Key Methods:**
- `save(runId, artifactType, content, metadata)` - Store artifact
- `load(runId, artifactType)` - Retrieve artifact
- `exists(runId, artifactType)` - Check existence
- `list(runId)` - List all artifacts for run
- `delete(runId, artifactType?)` - Remove artifacts

**Usage in n8n:**
```javascript
const { S3StorageAdapter } = await import('deal-prep-level-2/storage');
const storage = new S3StorageAdapter({
  bucket: 'deal-prep-artifacts',
  region: 'us-east-1'
});
await storage.save(runId, 'input', JSON.stringify(input));
```

### 4. Scraper (`src/scraper/`)
**Responsibilities:**
- Integrate with Firecrawl API
- Extract company website content
- Convert to markdown format
- Extract links and metadata

**Key Functions:**
- `scrapeWebsite(url, runId, storage, config)` - Scrape single page
- `crawlWebsite(url, runId, storage, config)` - Crawl entire site
- `extractSections(content)` - Parse key sections (about, products, etc.)

**Usage in n8n:**
```javascript
const { scrapeWebsite } = await import('deal-prep-level-2/scraper');
const result = await scrapeWebsite(
  companyWebsite,
  runId,
  storage,
  { apiKey: process.env.FIRECRAWL_API_KEY }
);
```

### 5. Enrichment (`src/enrichment/`)
**Responsibilities:**
- Extract LinkedIn profile data
- Generate person summaries
- Implement caching layer
- Handle rate limiting

**Key Functions:**
- `enrichPerson(linkedInUrl, runId, storage, config)` - Enrich person data
- `generatePersonSummary(enrichedPerson)` - Create concise summary
- `getCachedEnrichment(linkedInUrl, storage)` - Check cache
- `parseLinkedInProfile(content)` - Extract structured data

**Usage in n8n:**
```javascript
const { enrichPerson } = await import('deal-prep-level-2/enrichment');
const result = await enrichPerson(
  contactLinkedIn,
  runId,
  storage,
  { useFirecrawl: true, cacheEnabled: true }
);
```

### 6. Synthesizer (`src/synthesizer/`)
**Responsibilities:**
- Load and compile prompt templates
- Integrate with Claude API
- Generate Deal Preparation Briefs
- Structure LLM output to schema

**Key Functions:**
- `synthesizeBrief(runId, storage, config)` - Generate complete brief
- `buildPrompt(context, templateName)` - Compile prompt with data
- `callClaude(prompt, config)` - Call Claude API with retry
- `parseBriefResponse(response, context)` - Parse to structured format
- `calculateConfidence(brief, context)` - Assess output quality

**Usage in n8n:**
```javascript
const { synthesizeBrief } = await import('deal-prep-level-2/synthesizer');
const result = await synthesizeBrief(
  runId,
  storage,
  { apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-5-sonnet-20241022' }
);
```

### 7. Validator (`src/validator/`)
**Responsibilities:**
- Validate against JSON schemas
- Enforce business rules
- Quality checks for content
- Generate validation reports

**Key Functions:**
- `validateBrief(brief, config)` - Validate generated brief
- `validateInput(input, config)` - Validate normalized input
- `checkRequiredFields(brief)` - Verify completeness
- `checkContentQuality(brief)` - Assess quality metrics
- `applyCustomRules(data, rules)` - Custom validation logic

**Usage in n8n:**
```javascript
const { validateBrief } = await import('deal-prep-level-2/validator');
const result = validateBrief(brief, { strictMode: true });
if (!result.data.valid) {
  // Handle validation errors
}
```

### 8. Renderers (`src/renderers/`)
**Responsibilities:**
- Format briefs for different outputs
- CRM (HubSpot/Salesforce structured data)
- Email (HTML template)
- Motion (task list)
- Markdown (readable document)

**Key Functions:**
- `renderForCRM(brief, config)` - CRM-formatted output
- `renderForEmail(brief, config)` - HTML email output
- `renderForMotion(brief, config)` - Motion task format
- `renderAsMarkdown(brief, config)` - Markdown document
- `renderAsJSON(brief, config)` - Structured JSON

**Usage in n8n:**
```javascript
const { renderForEmail, renderForCRM } = await import('deal-prep-level-2/renderers');
const emailOutput = renderForEmail(brief, { recipientName: 'Sales Rep' });
const crmOutput = renderForCRM(brief);
```

### 9. Adapters (`src/adapters/`)
**Responsibilities:**
- Integrate with external systems
- Handle authentication and rate limiting
- Map data to external formats
- Provide error handling and retry logic

**Key Classes:**
- `CRMAdapter` - HubSpot/Salesforce integration
- `EmailAdapter` - SendGrid/SES integration
- `MotionAdapter` - Motion task management integration

**Key Methods:**
- `CRMAdapter.createDeal(brief, rendered)` - Create CRM deal
- `CRMAdapter.createContact(brief)` - Create/update contact
- `EmailAdapter.sendBrief(brief, rendered, recipients)` - Send email
- `MotionAdapter.createTasks(brief, rendered)` - Create tasks

**Usage in n8n:**
```javascript
const { CRMAdapter } = await import('deal-prep-level-2/adapters');
const crm = new CRMAdapter({
  provider: 'hubspot',
  apiKey: process.env.HUBSPOT_API_KEY
});
const result = await crm.createDeal(brief, renderedCRM);
```

## Data Flow

```
1. Raw Input (n8n webhook)
   ↓
2. Normalizer → NormalizedInput → S3
   ↓
3. Run Manager → RunMetadata → S3
   ↓
4. Scraper → ScrapedContent → S3
   ↓
5. Enrichment → EnrichedPerson → S3
   ↓
6. Synthesizer → DealPrepBrief → S3
   ↓
7. Validator → ValidationResult
   ↓
8. Renderers → RenderedOutput (multiple formats)
   ↓
9. Adapters → External Systems (CRM, Email, Motion)
```

## Getting Started

### Installation

```bash
cd /Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript to ES modules in the `dist/` directory.

### Development

```bash
npm run build:watch
```

Watches for changes and recompiles automatically.

### Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Configuration

### Environment Variables

Required for production:
- `AWS_REGION` - AWS region for S3 (default: us-east-1)
- `S3_BUCKET` - S3 bucket for artifact storage
- `FIRECRAWL_API_KEY` - API key for Firecrawl service
- `ANTHROPIC_API_KEY` - API key for Claude AI
- `HUBSPOT_API_KEY` - (Optional) HubSpot CRM integration
- `SENDGRID_API_KEY` - (Optional) SendGrid email integration
- `MOTION_API_KEY` - (Optional) Motion task management integration

### Firecrawl Infrastructure

This project leverages the Firecrawl infrastructure housed in the sibling `picasso-webscraping` repository:

```
../picasso-webscraping/
├── src/                  # FirecrawlApp SDK (TypeScript)
├── rag-scraper/          # RAG content preparation tools
├── firecrawl-server/     # Self-hosted Firecrawl (Docker Compose)
└── dist/                 # Built SDK output
```

**Options for Firecrawl usage:**
1. **Firecrawl Cloud API** - Use `FIRECRAWL_API_KEY` with `api.firecrawl.dev`
2. **Self-hosted** - Run `../picasso-webscraping/firecrawl-server/` locally via Docker Compose

For self-hosted setup:
```bash
cd ../picasso-webscraping/firecrawl-server
docker-compose up -d
# Set FIRECRAWL_API_URL=http://localhost:3002 in .env
```

See `../picasso-webscraping/README.md` for full Firecrawl SDK documentation.

### n8n Integration

**Production n8n Instance:** `https://integrate.myrecruiter.ai`

| Property | Value |
|----------|-------|
| URL | `https://integrate.myrecruiter.ai` |
| Webhook Base | `https://integrate.myrecruiter.ai/webhook/` |
| Platform | AWS EC2 (`i-04281d9886e3a6c41`) |

Each module is designed to be called from n8n Code nodes. Pipeline flow:

1. **Webhook Trigger** - Receive prospect data
2. **Normalize** - Canonicalize input
3. **Create Run** - Generate RunID with idempotency
4. **Scrape Website** - Extract company data
5. **Enrich Person** - Get LinkedIn data
6. **Synthesize Brief** - Generate AI brief
7. **Validate** - Check quality
8. **Render** - Format for outputs
9. **Deliver** - Send to CRM/Email/Motion

See `/n8n` directory for workflow JSON and import instructions.

## Type System

All modules use shared types from `src/types/index.ts`:

- `RunId` - Unique run identifier
- `NormalizedInput` - Canonical input structure
- `ArtifactMetadata` - Storage tracking
- `StorageAdapter` - Storage interface
- `ScrapedContent` - Website scraping output
- `EnrichedPerson` - LinkedIn enrichment output
- `DealPrepBrief` - Final brief structure
- `RenderedOutput` - Formatted output
- `ValidationResult` - Validation reports
- `ModuleResult<T>` - Standard result wrapper for n8n

## JSON Schemas

Validation schemas in `/schemas`:

- `normalized-input.schema.json` - Input validation
- `deal-prep-brief.schema.json` - Brief validation

## Examples

See `/examples` for:
- `sample-input.json` - Example input
- `sample-brief.json` - Example generated brief

## Contributing

### Adding a New Module

1. Create module directory in `/src`
2. Define interfaces and types
3. Export from module's `index.ts`
4. Add export to main `/src/index.ts`
5. Create tests in `/tests/unit/[module]`
6. Update this README with module documentation

### Code Style

- Use TypeScript strict mode
- Follow interface-first design
- Return `ModuleResult<T>` for n8n compatibility
- Include JSDoc comments on public functions
- Use Zod for runtime validation where needed

## License

UNLICENSED - Private internal tool for MyRecruiter

## Support

For questions or issues, contact the development team.

---

**Project Status:** Phase 1 Complete ✅

**Completed:**
- ✅ Core modules (normalizer, run-manager, storage)
- ✅ Firecrawl scraper integration
- ✅ Claude Sonnet 4 synthesizer with prompt templating
- ✅ Renderers for CRM, Email, Motion outputs
- ✅ n8n workflow definitions
- ✅ 375+ unit tests passing
- ✅ Constraint validator (all 9 hard constraints from Spec §9.3)

**Next Steps (Phase 1.1 - Quality & Reliability):**
1. Integration testing with live APIs
2. Improved extraction rules for edge cases
3. Prompt tuning based on real outputs
4. CRM adapter implementation (HubSpot or alternative)
