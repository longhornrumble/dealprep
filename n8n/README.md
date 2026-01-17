# Level 2 Deal Preparation - n8n Workflow

This directory contains the n8n workflow JSON for the Level 2 Deal Preparation pipeline.

## Files

- `deal-prep-workflow.json` - Complete n8n workflow implementing the Deal Prep pipeline

## Importing the Workflow

### Method 1: n8n Web UI

1. Open your n8n instance (e.g., `http://localhost:5678`)
2. Click "Workflows" in the left sidebar
3. Click "Add Workflow" button
4. Click the three dots menu (top right) and select "Import from File"
5. Select `deal-prep-workflow.json`
6. The workflow will be imported and opened for editing

### Method 2: n8n CLI

```bash
# Export the workflow ID after importing via UI, or use:
n8n import:workflow --input=/path/to/deal-prep-workflow.json
```

### Method 3: REST API

```bash
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: your-api-key" \
  -d @deal-prep-workflow.json
```

## Workflow Overview

The workflow implements the complete Level 2 Deal Preparation pipeline as specified in `AI_Deal_Prep_Implementation_Spec`.

### Triggers

| Trigger | Purpose | Input |
|---------|---------|-------|
| Webhook (POST /deal-prep) | Inbound requests from CRM/forms | JSON body |
| Manual Trigger | Outbound prospecting (Chris) | JSON body |

### Pipeline Nodes

| # | Node | Purpose | Error Handling |
|---|------|---------|----------------|
| 1 | Merge Trigger Inputs | Combines webhook/manual inputs | - |
| 2 | Normalize Input | Canonicalizes and validates input | Halts on invalid |
| 3 | Generate Run ID | Creates deterministic run ID | - |
| 4 | Check Idempotency | Skips if run already complete | Returns cached |
| 5 | Initialize Run Artifact | Creates run tracking object | - |
| 6 | Website Scrape | Extracts website content | 2 retries, continues on fail |
| 7 | Person Enrichment | LinkedIn profile enrichment | Non-blocking |
| 8 | LLM Synthesis | Generates brief via Claude | 1 retry on validation |
| 9 | Validate Brief | Checks brief constraints | Logs warnings, continues |
| 10 | Render Outputs | Creates CRM/Email/Motion formats | - |
| 11 | Execute Deliveries | Sends to external systems | Independent (allSettled) |
| 12 | Finalize Run | Updates status, emits metrics | - |

## Input Schema

POST to webhook with this JSON structure:

```json
{
  "meta": {
    "requested_meeting_at": "2026-01-20T14:00:00Z",
    "timezone": "America/New_York"
  },
  "organization": {
    "name": "Acme Nonprofit",
    "website": "https://www.acmenonprofit.org"
  },
  "contact": {
    "full_name": "Jane Smith",
    "first_name": "Jane",
    "last_name": "Smith",
    "title": "Executive Director",
    "email": "jane@acmenonprofit.org",
    "linkedin_url": "https://linkedin.com/in/janesmith"
  },
  "notes": {
    "comments": "Interested in AI chatbot",
    "intent_topic": "Volunteer management",
    "source_context": "Referral from existing customer"
  },
  "routing": {
    "crm_target": "hubspot",
    "email_to": "sales@company.com",
    "email_cc": ["manager@company.com"],
    "motion_workspace": "workspace-123"
  }
}
```

**Required fields:**
- At least one of `organization.name` or `organization.website`

## Example curl Commands

### Inbound Request (via Webhook)

```bash
curl -X POST http://localhost:5678/webhook/deal-prep \
  -H "Content-Type: application/json" \
  -d '{
    "organization": {
      "name": "Test Nonprofit",
      "website": "https://www.testnonprofit.org"
    },
    "contact": {
      "full_name": "John Doe",
      "email": "john@testnonprofit.org"
    },
    "notes": {},
    "routing": {
      "email_to": "sales@myrecruiter.ai"
    }
  }'
```

### Response

```json
{
  "success": true,
  "runId": "run_abc123def456",
  "status": "completed_with_errors",
  "runArtifact": {
    "run_id": "run_abc123def456",
    "trigger_source": "inbound",
    "started_at": "2026-01-17T15:00:00.000Z",
    "completed_at": "2026-01-17T15:00:45.000Z",
    "status": "completed_with_errors",
    "deliveries": {
      "customer_relationship_management": { "status": "success" },
      "email": { "status": "success" },
      "motion": { "status": "failed", "error": "No Motion workspace configured" }
    }
  },
  "brief": { ... },
  "metrics": {
    "run_id": "run_abc123def456",
    "duration_ms": 45000,
    "trigger_source": "inbound",
    "organization": "testnonprofit.org"
  }
}
```

## Configuration

### Environment Variables

The workflow Code nodes expect these environment variables (set in n8n):

| Variable | Description | Required |
|----------|-------------|----------|
| `S3_BUCKET` | S3 bucket for artifact storage | Yes |
| `S3_REGION` | AWS region | Yes |
| `FIRECRAWL_API_KEY` | Firecrawl API key for scraping | Yes |
| `ANTHROPIC_API_KEY` | Claude API key for synthesis | Yes |
| `SENDGRID_API_KEY` | SendGrid API key for email | No |
| `MOTION_API_KEY` | Motion API key for tasks | No |
| `HUBSPOT_API_KEY` | HubSpot API key for CRM | No |

### n8n Credentials

Create these credentials in n8n:

1. **AWS S3** - For artifact storage
2. **HTTP Request (Bearer)** - For Firecrawl API
3. **HTTP Request (API Key)** - For Claude API
4. **SendGrid** - For email delivery (optional)
5. **HubSpot** - For CRM integration (optional)

## Production Setup

### 1. Replace Stub Implementations

The Code nodes contain stub implementations. Replace with actual module calls:

```javascript
// Replace this stub:
const scrapeResult = { ... };

// With actual module call:
const { scrapeWebsite } = require('./deal-prep-modules');
const scrapeResult = await scrapeWebsite(website, config);
```

### 2. Enable S3 Storage

Update each Code node to persist artifacts:

```javascript
const { S3StorageAdapter } = require('./deal-prep-modules');
const storage = new S3StorageAdapter(process.env.S3_BUCKET);
await storage.save(runId, 'scraped-content', scrapeResult);
```

### 3. Configure Error Workflow

Set up an error workflow for alerting:

1. Create a separate "Deal Prep Error Handler" workflow
2. Set it as the Error Workflow in Settings
3. Configure Slack/email notifications

### 4. Enable Idempotency

Uncomment the idempotency check in "Generate Run ID" node:

```javascript
const existingRun = await checkIdempotency(runId, storageAdapter);
if (existingRun && existingRun.status === 'completed') {
  return [{ json: { skipExecution: true, existingRun } }];
}
```

## Observability

### Logs

All nodes emit console logs with module prefix:

```
[Normalize] Input normalized successfully
[RunManager] Generated run_id: run_abc123
[Scraper] Attempt 1 of 3
[Synthesizer] Brief generated successfully
[Delivery] CRM: success
[Finalize] Run completed
```

### Metrics

The Finalize node emits a metrics object:

```json
{
  "run_id": "run_abc123",
  "status": "completed",
  "duration_ms": 45000,
  "trigger_source": "inbound",
  "organization": "testnonprofit.org",
  "deliveries": {
    "crm": "success",
    "email": "success",
    "motion": "failed"
  },
  "error_count": 1,
  "timestamp": "2026-01-17T15:00:45.000Z"
}
```

### Monitoring Recommendations

1. **CloudWatch Logs** - Stream n8n logs to CloudWatch
2. **Execution History** - Enable "Save Manual Executions" in workflow settings
3. **Error Alerting** - Configure error workflow for Slack notifications
4. **Dashboard** - Track success rate, duration, and error count

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook returns 404 | Workflow not activated | Click "Active" toggle |
| Scrape timeout | Website slow/blocking | Increase timeout, check Firecrawl logs |
| LLM synthesis fails | Invalid prompt/response | Check Claude API key, review prompt |
| Email not delivered | Missing email_to | Ensure routing.email_to is provided |

### Debug Mode

1. Enable "Save Successful Executions" in Settings
2. Click on any node to see input/output
3. Use "Execute Node" to test individual steps

## Security

- **Input Validation**: All inputs validated against schema
- **No Secrets in Logs**: API keys never logged
- **Idempotency**: Prevents duplicate processing
- **PII Handling**: Store artifacts in encrypted S3 bucket

## Related Documentation

- [AI_Deal_Prep_Implementation_Spec](/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/AI_Deal_Prep_Implementation_Spec) - Authoritative specification
- [ARCHITECTURE.md](/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/docs/ARCHITECTURE.md) - System architecture
- [schemas/](/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/schemas/) - JSON schemas
- [src/](/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/src/) - TypeScript modules
