# Delivery Adapters Documentation

This document describes the delivery adapter system for the Level 2 Deal Preparation project, implementing Section 11 (Delivery Tracking) and Section 12 (External Interfaces) from the AI Deal Prep Implementation Spec.

## Overview

The delivery adapter system enables the Deal Prep pipeline to deliver generated briefs to multiple external systems independently:

- **CRM** - Customer Relationship Management (vendor-agnostic)
- **Email** - Email delivery via SendGrid
- **Motion** - Task management via Motion API

Each delivery channel operates independently - failure in one channel does not block others.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DeliveryOrchestrator                          │
│                    (executeDeliveries)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Promise.allSettled()
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   CRM Adapter   │  │  Email Adapter  │  │ Motion Adapter  │
│                 │  │                 │  │                 │
│ - NullCRMAdapter│  │ - SendGridEmail │  │ - MotionAPI     │
│ - (Future: Hub- │  │ - NullEmail     │  │ - NullMotion    │
│   spot, SF, etc)│  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Delivery Status Schema (Section 11.2)

```json
{
  "deliveries": {
    "customer_relationship_management": {
      "status": "not_attempted | success | failed",
      "attempted_at": "ISO-8601 timestamp | null",
      "error": "string | null"
    },
    "email": {
      "status": "not_attempted | success | failed",
      "attempted_at": "ISO-8601 timestamp | null",
      "error": "string | null"
    },
    "motion": {
      "status": "not_attempted | success | failed",
      "attempted_at": "ISO-8601 timestamp | null",
      "error": "string | null"
    }
  }
}
```

## Environment Variables

### SendGrid Email

```bash
# Required for email delivery
export SENDGRID_API_KEY="SG.xxxxxxxxxxxx"
export EMAIL_FROM="noreply@yourdomain.com"
export EMAIL_FROM_NAME="Deal Prep System"  # Optional
```

### Motion Task Management

```bash
# Required for Motion task creation
export MOTION_API_KEY="your-motion-api-key"
export MOTION_WORKSPACE_ID="your-workspace-id"
```

### CRM (Future)

```bash
# Future CRM configuration
export CRM_PROVIDER="hubspot | salesforce"
export HUBSPOT_API_KEY="your-hubspot-api-key"
# or
export SALESFORCE_TOKEN="your-salesforce-token"
```

## Usage

### Basic Usage

```typescript
import {
  executeDeliveries,
  createAdaptersFromEnv,
  type CanonicalInput,
  type RenderedOutputs,
  type DealPrepBrief,
} from 'deal-prep-level-2/adapters';
import { S3StorageAdapter } from 'deal-prep-level-2/storage';

// Create adapters from environment variables
const adapters = createAdaptersFromEnv();

// Execute deliveries
const deliveryStatus = await executeDeliveries(
  runId,
  brief,
  canonicalInput,
  renderedOutputs,
  adapters,
  storageAdapter
);

console.log('Delivery results:', deliveryStatus);
```

### Custom Adapters

```typescript
import {
  type CRMAdapter,
  type EmailAdapter,
  type MotionAdapter,
  executeDeliveries,
} from 'deal-prep-level-2/adapters';

// Create custom CRM adapter (e.g., HubSpot)
class HubSpotCRMAdapter implements CRMAdapter {
  async upsertOrganization(domain: string, data: OrgData) {
    // HubSpot API implementation
  }
  async upsertContact(email: string, data: ContactData) {
    // HubSpot API implementation
  }
  async associateContactToOrganization(contactId: string, orgId: string) {
    // HubSpot API implementation
  }
  async attachBrief(orgId: string, briefMarkdown: string, briefUrl: string) {
    // HubSpot API implementation
  }
  async recordRunMetadata(orgId: string, runId: string, metadata: RunMeta) {
    // HubSpot API implementation
  }
}

// Use custom adapters
const adapters = {
  crm: new HubSpotCRMAdapter(config),
  email: new SendGridEmailAdapter(emailConfig),
  motion: new MotionAPIAdapter(motionConfig),
};

await executeDeliveries(runId, brief, input, rendered, adapters, storage);
```

### Observability

```typescript
import { calculateDeliveryMetrics } from 'deal-prep-level-2/adapters';

const startTime = Date.now();
const status = await executeDeliveries(...);
const metrics = calculateDeliveryMetrics(runId, status, startTime);

console.log('Delivery Metrics:', {
  totalDurationMs: metrics.totalDurationMs,
  successCount: metrics.successCount,
  failureCount: metrics.failureCount,
  crmStatus: metrics.crmStatus,
  emailStatus: metrics.emailStatus,
  motionStatus: metrics.motionStatus,
});

// Log to CloudWatch or your preferred monitoring system
await cloudwatch.putMetricData({
  Namespace: 'DealPrep/Deliveries',
  MetricData: [
    { MetricName: 'DeliveryDuration', Value: metrics.totalDurationMs, Unit: 'Milliseconds' },
    { MetricName: 'SuccessCount', Value: metrics.successCount, Unit: 'Count' },
    { MetricName: 'FailureCount', Value: metrics.failureCount, Unit: 'Count' },
  ],
});
```

## Example curl Commands

### SendGrid API (Direct)

```bash
# Send email via SendGrid
curl --request POST \
  --url https://api.sendgrid.com/v3/mail/send \
  --header "Authorization: Bearer $SENDGRID_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
    "personalizations": [
      {
        "to": [{"email": "recipient@example.com"}],
        "cc": [{"email": "team@example.com"}]
      }
    ],
    "from": {
      "email": "noreply@yourdomain.com",
      "name": "Deal Prep System"
    },
    "subject": "Deal Prep Brief: Test Company",
    "content": [
      {
        "type": "text/plain",
        "value": "Here is your deal prep brief for Test Company..."
      },
      {
        "type": "text/html",
        "value": "<h1>Deal Prep Brief</h1><p>Here is your deal prep brief for Test Company...</p>"
      }
    ]
  }'
```

### Motion API (Direct)

```bash
# Create task in Motion
curl --request POST \
  --url https://api.usemotion.com/v1/tasks \
  --header "X-API-Key: $MOTION_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "Deal Prep - Test Company",
    "description": "Top opportunities:\n1. Opportunity 1\n2. Opportunity 2\n\nReview the full brief: https://storage.example.com/briefs/run_123.md",
    "workspaceId": "YOUR_WORKSPACE_ID",
    "dueDate": "2024-01-16T12:00:00Z",
    "priority": "HIGH"
  }'

# Get task details
curl --request GET \
  --url https://api.usemotion.com/v1/tasks/TASK_ID \
  --header "X-API-Key: $MOTION_API_KEY"

# List workspaces
curl --request GET \
  --url https://api.usemotion.com/v1/workspaces \
  --header "X-API-Key: $MOTION_API_KEY"
```

### Testing with Local Server

If running a local n8n or test server:

```bash
# Trigger delivery execution
curl --request POST \
  --url http://localhost:5678/webhook/deal-prep/deliver \
  --header 'Content-Type: application/json' \
  --data '{
    "run_id": "run_20240115_100000_abc123",
    "brief": {
      "runId": "run_20240115_100000_abc123",
      "prospect": {
        "companyName": "Test Company",
        "companyOverview": "A test company"
      },
      "generatedAt": "2024-01-15T10:00:00Z",
      "confidence": "high"
    },
    "input": {
      "meta": {
        "trigger_source": "inbound",
        "submitted_at": "2024-01-15T09:00:00Z",
        "run_id": "run_20240115_100000_abc123"
      },
      "organization": {
        "name": "Test Company",
        "domain": "example.com"
      },
      "contact": {
        "email": "john@example.com"
      },
      "routing": {
        "email_to": "chris@myrecruiter.ai"
      }
    },
    "rendered": {
      "crm": {
        "markdown": "# Deal Prep Brief\n\n..."
      },
      "email": {
        "subject": "Deal Prep Brief: Test Company",
        "textBody": "Here is your brief..."
      },
      "motion": {
        "title": "Deal Prep - Test Company",
        "description": "Top opportunities..."
      }
    }
  }'
```

## Adapter Interfaces

### CRMAdapter

```typescript
interface CRMAdapter {
  upsertOrganization(domain: string, data: OrgData): Promise<CRMResult>;
  upsertContact(email: string, data: ContactData): Promise<CRMResult>;
  associateContactToOrganization(contactId: string, orgId: string): Promise<CRMResult>;
  attachBrief(orgId: string, briefMarkdown: string, briefUrl: string): Promise<CRMResult>;
  recordRunMetadata(orgId: string, runId: string, metadata: RunMeta): Promise<CRMResult>;
}
```

### EmailAdapter

```typescript
interface EmailAdapter {
  sendEmail(runId: string, message: EmailMessage): Promise<EmailResult>;
  wasEmailSent(runId: string): Promise<boolean>;
}
```

### MotionAdapter

```typescript
interface MotionAdapter {
  createTask(task: MotionTask): Promise<MotionResult>;
}
```

## Delivery Rules (Section 11.3)

1. **Independence**: Each delivery channel is attempted independently
2. **Non-blocking**: Failure in one channel does not block others
3. **Retry Safety**: Failed deliveries may be safely retried using run_id
4. **Persistence**: All delivery outcomes are persisted to the Run Artifact
5. **Idempotency**: Email sending is idempotent per run_id

## Implementation Notes

### Idempotency

Email delivery implements idempotency using the run_id:

```typescript
// The adapter tracks sent run_ids
if (await adapter.wasEmailSent(runId)) {
  return { success: true, metadata: { idempotent: true } };
}
```

In production, this should be backed by persistent storage (DynamoDB, Redis, etc.) rather than in-memory tracking.

### Motion Failures

Per Section 12.3, Motion failures are logged but do not halt the run:

```typescript
if (!result.success) {
  logger.warn('Motion task creation failed but continuing', { runId, error: result.error });
  return { status: 'failed', error: result.error };
}
```

### Security Considerations

1. API keys should be stored in environment variables or secrets manager
2. No credentials should be logged
3. Input validation is performed before delivery
4. CRM operations are non-destructive (upsert only, no deletes)

## Testing

Run the adapter tests:

```bash
cd Deal_prep_level-2
npm test -- --testPathPattern="adapters.test.ts"
```

The test suite includes:
- Null adapter tests (NullCRMAdapter, NullEmailAdapter, NullMotionAdapter)
- SendGrid adapter tests with fetch mocking
- Motion API adapter tests with fetch mocking
- DeliveryOrchestrator integration tests
- Helper function tests (extractDomain, calculateDeliveryMetrics)

## File Locations

- **Adapter Implementation**: `/src/adapters/index.ts`
- **Tests**: `/tests/unit/adapters.test.ts`
- **Documentation**: `/docs/DELIVERY_ADAPTERS.md`
