# Deal Prep Level 2 - Architecture Documentation

## System Overview

Deal Prep Level 2 is a production sales-enablement system that generates comprehensive Deal Preparation Briefs by orchestrating multiple data gathering, enrichment, and synthesis steps through n8n workflows.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           n8n Workflow                               │
│  (Orchestration Layer - Coordinates all modules via Code nodes)     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Deal Prep Level 2 Modules                        │
│                    (TypeScript ES Modules)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Normalizer  │  │ Run Manager  │  │   Storage    │              │
│  │              │  │              │  │   Adapter    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Scraper    │  │ Enrichment   │  │ Synthesizer  │              │
│  │ (Firecrawl)  │  │  (LinkedIn)  │  │   (Claude)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Validator   │  │  Renderers   │  │   Adapters   │              │
│  │              │  │              │  │ (CRM/Email)  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────┐ ┌──────────────┐
            │   AWS S3     │ │Firecrawl │ │   Claude     │
            │  (Artifacts) │ │   API    │ │     API      │
            └──────────────┘ └──────────┘ └──────────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    ▼              ▼              ▼
                            ┌───────────┐  ┌──────────┐  ┌──────────┐
                            │ HubSpot/  │  │SendGrid/ │  │  Motion  │
                            │Salesforce │  │   SES    │  │   API    │
                            └───────────┘  └──────────┘  └──────────┘
```

## Architecture Principles

### 1. Artifact-Based Communication
Modules do NOT call each other directly. Instead:
- Each module stores its output as an artifact in S3
- Subsequent modules load artifacts from S3 as needed
- RunID provides the organizational key for all artifacts
- This enables:
  - Independent execution and testing
  - Easy debugging (inspect artifacts)
  - Retry and recovery capabilities
  - Audit trail of all processing steps

### 2. n8n Orchestration
- n8n workflow controls the execution sequence
- Each module is called via n8n Code node
- Workflow handles:
  - Error handling and retries
  - Conditional branching
  - Parallel execution where possible
  - User notifications and alerts

### 3. Idempotency
- RunID-based deduplication prevents duplicate processing
- Each run can be safely retried
- Same input produces same RunID (configurable)
- Enables graceful handling of:
  - Workflow failures
  - Network issues
  - User re-submissions

### 4. Type Safety
- Full TypeScript with strict mode
- Shared type definitions in `src/types/`
- JSON Schema validation for external data
- Zod for runtime validation
- Clear interfaces between modules

### 5. Adapter Pattern
- External integrations use adapter pattern
- Easy to mock for testing
- Swap implementations (e.g., S3 → MemoryStorage for tests)
- Consistent error handling across integrations

## Data Flow

### Detailed Processing Steps

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. INPUT STAGE                                                  │
│                                                                 │
│    Raw Input (Webhook/API)                                     │
│           │                                                     │
│           ▼                                                     │
│    [Normalizer Module]                                         │
│           │                                                     │
│           ▼                                                     │
│    NormalizedInput → S3                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. RUN INITIALIZATION                                           │
│                                                                 │
│    NormalizedInput (from S3)                                   │
│           │                                                     │
│           ▼                                                     │
│    [Run Manager Module]                                        │
│           │                                                     │
│           ├─→ Check Idempotency                               │
│           ├─→ Generate RunID                                  │
│           ├─→ Create Run Metadata                             │
│           │                                                     │
│           ▼                                                     │
│    RunMetadata → S3                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. DATA GATHERING (Parallel Execution)                         │
│                                                                 │
│    ┌────────────────────┐     ┌────────────────────┐          │
│    │ [Scraper Module]   │     │ [Enrichment Module]│          │
│    │                    │     │                    │          │
│    │ Input: Website URL │     │ Input: LinkedIn URL│          │
│    │ Process: Firecrawl │     │ Process: LinkedIn  │          │
│    │ Output: Markdown   │     │ Output: Profile    │          │
│    │                    │     │                    │          │
│    └──────┬─────────────┘     └──────┬─────────────┘          │
│           │                          │                         │
│           ▼                          ▼                         │
│    ScrapedContent → S3      EnrichedPerson → S3               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 4. SYNTHESIS                                                    │
│                                                                 │
│    All Artifacts (from S3)                                     │
│           │                                                     │
│           ├─→ NormalizedInput                                 │
│           ├─→ ScrapedContent                                  │
│           └─→ EnrichedPerson                                  │
│           │                                                     │
│           ▼                                                     │
│    [Synthesizer Module]                                        │
│           │                                                     │
│           ├─→ Build Prompt                                    │
│           ├─→ Call Claude API                                 │
│           ├─→ Parse Response                                  │
│           ├─→ Calculate Confidence                            │
│           │                                                     │
│           ▼                                                     │
│    DealPrepBrief → S3                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 5. VALIDATION                                                   │
│                                                                 │
│    DealPrepBrief (from S3)                                     │
│           │                                                     │
│           ▼                                                     │
│    [Validator Module]                                          │
│           │                                                     │
│           ├─→ Schema Validation                               │
│           ├─→ Required Fields Check                           │
│           ├─→ Quality Assessment                              │
│           │                                                     │
│           ▼                                                     │
│    ValidationResult                                            │
│           │                                                     │
│           ├─→ If Valid: Continue                              │
│           └─→ If Invalid: Alert & Retry/Abort                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 6. RENDERING (Parallel Execution)                              │
│                                                                 │
│    DealPrepBrief (from S3)                                     │
│           │                                                     │
│           ├─────────┬─────────┬─────────┬─────────┐           │
│           ▼         ▼         ▼         ▼         ▼           │
│       [CRM]    [Email]   [Motion]  [Markdown] [JSON]         │
│       Renderer Renderer  Renderer  Renderer  Renderer        │
│           │         │         │         │         │           │
│           ▼         ▼         ▼         ▼         ▼           │
│       CRM      Email     Motion    Markdown   JSON           │
│       Output   Output    Output    Output     Output         │
│           │         │         │         │         │           │
│           └─────────┴─────────┴─────────┴─────────┘           │
│                          │                                     │
│                          ▼                                     │
│                All Rendered Outputs → S3                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 7. DELIVERY (Parallel Execution)                               │
│                                                                 │
│    Rendered Outputs (from S3)                                  │
│           │                                                     │
│           ├─────────┬─────────┬─────────┐                     │
│           ▼         ▼         ▼         ▼                     │
│       [CRM      [Email    [Motion    [Storage]               │
│        Adapter]  Adapter]  Adapter]                           │
│           │         │         │                               │
│           ▼         ▼         ▼                               │
│      HubSpot/  SendGrid/   Motion                             │
│      Salesforce  SES       API                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Module Interfaces

### Standard Module Result

All modules return `ModuleResult<T>`:

```typescript
interface ModuleResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    runId: RunId;
    module: string;
    timestamp: string;
    duration?: number;
  };
}
```

This provides:
- Consistent error handling in n8n
- Metadata for logging and debugging
- Type-safe data access

### Storage Interface

```typescript
interface StorageAdapter {
  save(runId, artifactType, content, metadata?): Promise<ArtifactMetadata>;
  load(runId, artifactType): Promise<{ content, metadata }>;
  exists(runId, artifactType): Promise<boolean>;
  list(runId): Promise<ArtifactMetadata[]>;
  delete(runId, artifactType?): Promise<void>;
}
```

Implementations:
- `S3StorageAdapter` - Production (AWS S3)
- `MemoryStorageAdapter` - Testing (in-memory)

## Storage Organization

### S3 Bucket Structure

```
s3://deal-prep-artifacts/
  ├── deal-prep/
  │   ├── 20260117_143022_abc123xyz/
  │   │   ├── input.json
  │   │   ├── run-metadata.json
  │   │   ├── scraped-content.json
  │   │   ├── enriched-person.json
  │   │   ├── brief.json
  │   │   ├── rendered-crm.json
  │   │   ├── rendered-email.html
  │   │   ├── rendered-motion.json
  │   │   └── rendered-markdown.md
  │   │
  │   ├── 20260117_151045_def456uvw/
  │   │   └── ... (artifacts for another run)
  │   │
  │   └── ... (more runs)
  │
  └── cache/
      └── enrichment/
          └── linkedin/
              └── {hash-of-linkedin-url}.json
```

### Artifact Lifecycle

1. **Creation**: Module saves artifact to S3 with metadata
2. **Access**: Subsequent modules load artifact by RunID + type
3. **Retention**: Configurable retention policy (e.g., 30 days)
4. **Cleanup**: Automated lifecycle policy removes old artifacts

## Error Handling Strategy

### Module-Level Errors

Modules return errors in `ModuleResult`:

```typescript
{
  success: false,
  error: {
    code: 'SCRAPER_FAILED',
    message: 'Failed to scrape website',
    details: { url: '...', statusCode: 403 }
  },
  metadata: { runId, module: 'scraper', timestamp }
}
```

### n8n Workflow Error Handling

```
[Module Execution]
       │
       ├─→ Success → Continue to next step
       │
       └─→ Error → Check error.code
                │
                ├─→ Retryable (network, timeout) → Retry with backoff
                │
                ├─→ Validation Error → Alert user, request correction
                │
                └─→ Fatal Error → Log, alert, abort workflow
```

### Retry Strategy

- **Network Errors**: Exponential backoff, max 3 retries
- **Rate Limits**: Wait and retry (respecting API limits)
- **Validation Errors**: No retry, alert user
- **Transient Errors**: Linear backoff, max 2 retries

## Security Considerations

### API Keys and Secrets
- Stored in n8n credentials manager
- Never logged or stored in artifacts
- Environment-specific keys (dev/staging/prod)

### Data Sensitivity
- PII (names, emails, LinkedIn URLs) stored in S3
- S3 bucket encryption at rest
- Access logs for audit compliance
- Retention policy for GDPR compliance

### Input Validation
- All external inputs validated against JSON Schema
- Sanitization in Normalizer module
- Rate limiting on webhook endpoints
- CORS and authentication on APIs

## Performance Considerations

### Parallel Execution
Where possible, n8n executes modules in parallel:
- Scraper + Enrichment run simultaneously
- All Renderers run in parallel
- All Adapters deliver in parallel

### Caching
- LinkedIn enrichment cached (TTL: 7 days)
- Firecrawl results cached (TTL: 24 hours)
- Claude responses NOT cached (always fresh)

### Resource Limits
- S3 storage: Unlimited (with lifecycle policy)
- Claude API: Rate-limited by tier
- Firecrawl API: Rate-limited by plan
- n8n: Workflow timeout (30 minutes)

## Monitoring and Observability

### Metrics to Track
- Run completion rate
- Average processing time per run
- Module-level success/failure rates
- API error rates (Firecrawl, Claude, CRM)
- S3 storage usage
- Cost per run (API calls + storage)

### Logging Strategy
- n8n execution logs (workflow level)
- Module metadata in `ModuleResult`
- S3 artifact metadata
- External API request/response logs

### Alerting
- Workflow failures → Slack notification
- Validation errors → Email to sales rep
- API quota warnings → DevOps alert
- High error rates → PagerDuty incident

## Deployment Architecture

### Development
- Local n8n instance
- Local TypeScript compilation
- S3 bucket: `deal-prep-dev`
- Test API keys

### Staging
- Cloud n8n instance (n8n.cloud or self-hosted)
- Built TypeScript modules deployed to n8n
- S3 bucket: `deal-prep-staging`
- Staging API keys

### Production
- Cloud n8n instance with HA
- Production TypeScript modules
- S3 bucket: `deal-prep-prod`
- Production API keys
- CloudWatch monitoring
- Backup and disaster recovery

## Future Enhancements

### Planned Improvements
1. **Batch Processing**: Handle multiple prospects in single run
2. **Template Management**: Custom brief templates per sales rep
3. **Feedback Loop**: Track brief usage and effectiveness
4. **ML Enhancement**: Learn from successful deals to improve briefs
5. **Real-time Updates**: Subscribe to company news/changes
6. **Competitive Intelligence**: Auto-gather competitor info
7. **Integration Expansion**: Add more CRM, email, and PM tools

### Scalability Considerations
- Current design scales to 1000+ runs/day
- For higher volume:
  - Add SQS queue for run requests
  - Implement Lambda functions for modules
  - Add DynamoDB for run metadata
  - Use CloudFront CDN for rendered outputs

## References

- [Deal Prep PRD](/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/Deal_Prep_PRD.md)
- [Deal Prep Playbook](/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/Deal_Prep_Playbook.md)
- [Implementation Spec](/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/AI_Deal_Prep_Implementation_Spec)
- [Module Documentation](../README.md)
