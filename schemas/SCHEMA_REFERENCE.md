# Schema Reference Guide
## Level 2 Deal Preparation System

**Version:** 1.0.0
**Last Updated:** 2026-01-17
**Authority:** AI_Deal_Prep_Implementation_Spec + Deal_Prep_PRD.md

---

## Quick Reference

| Schema | Purpose | Required Fields | Hard Constraints |
|--------|---------|-----------------|------------------|
| **input-schema** | Run initiation | trigger_source, submitted_at, run_id | At least 1 of org.name or org.website |
| **scrape-output-schema** | Website extraction | scrape_meta, pages, errors | page_type enum, deduplicated URLs |
| **enrichment-output-schema** | Person enrichment | requester_profile, errors | "Not found" + "not_available" when missing |
| **brief-output-schema** | Deal Prep Brief (CANONICAL) | All 11 sections | 3 opportunities, 3 AI opps, 3 objections, char limits |
| **delivery-status-schema** | Delivery tracking | All 3 channels | status enum per channel |
| **run-artifact-schema** | Complete run record | All fields | Storage URLs, audit trail |

---

## Data Flow Through Schemas

```
┌─────────────────────┐
│  input-schema.json  │ ◄── Inbound/Outbound Trigger
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────┐
│ scrape-output-schema    │ ◄── Firecrawl/Website Research
│ enrichment-output-schema│ ◄── LinkedIn/Person Enrichment
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  brief-output-schema    │ ◄── LLM Synthesis (CANONICAL ARTIFACT)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ delivery-status-schema  │ ◄── CRM, Email, Motion delivery
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  run-artifact-schema    │ ◄── Complete audit record
└─────────────────────────┘
```

---

## Schema Specifications

### 1. Input Schema
**File:** `input-schema.json`
**Spec Reference:** Implementation Spec §4.1

**Purpose:** Define the canonical input payload for initiating a deal prep run.

**Required Validation:**
- At least one of `organization.name` or `organization.website` must be present
- If website is present, domain must be derived
- Trim whitespace from all strings
- Normalize emails to lowercase
- Normalize website URLs (add scheme, remove unsafe trailing slashes)

**Example:**
```json
{
  "meta": {
    "trigger_source": "inbound",
    "submitted_at": "2026-01-17T12:00:00Z",
    "run_id": "run_abc123",
    "requested_meeting_at": "2026-01-20T14:00:00Z",
    "timezone": "America/Los_Angeles"
  },
  "organization": {
    "name": "Example Nonprofit",
    "website": "https://example.org",
    "domain": "example.org"
  },
  "contact": {
    "full_name": "Jane Doe",
    "email": "jane@example.org"
  }
}
```

---

### 2. Scrape Output Schema
**File:** `scrape-output-schema.json`
**Spec Reference:** Implementation Spec §6.3

**Purpose:** Define website extraction output structure.

**Extraction Rules:**
- Maximum pages: 25 (default, configurable)
- Maximum depth: 3 (default, configurable)
- Remove navigation, footer, boilerplate
- Preserve headings and lists
- Deduplicate by final URL
- Retry: 2 times with exponential backoff (30s, 120s)

**Page Types:**
- home, about, programs, volunteer, donate, faq, staff, contact, other

---

### 3. Enrichment Output Schema
**File:** `enrichment-output-schema.json`
**Spec Reference:** Implementation Spec §7.3

**Purpose:** Define person enrichment output structure.

**Critical Rules:**
- When data unavailable: `summary = "Not found"`, `confidence = "not_available"`
- No scraping of restricted platforms
- No guessing or hallucination
- Confidence levels: high, medium, low, not_available

---

### 4. Brief Output Schema (CANONICAL ARTIFACT)
**File:** `brief-output-schema.json`
**Spec Reference:** Implementation Spec §9.2

**Purpose:** THE canonical artifact. All rendering derives from this.

**Hard Constraints (Non-Negotiable):**
```
executive_summary.summary          ≤ 600 characters
executive_summary.top_opportunities = exactly 3 items
artificial_intelligence_opportunities = exactly 3 items
demonstration_plan.steps           ≤ 6 items
objections_and_rebuttals          = exactly 3 items
opening_script                     ≤ 450 characters
follow_up_emails.short_version.body ≤ 120 words
follow_up_emails.warm_version.body  ≤ 180 words
```

**Evidence Requirements:**
- All claims must be grounded in scraped content
- Source URLs must be listed in `meta.source_urls`
- No facts may be invented
- If evidence is insufficient, state explicitly
- Missing information must be labeled "Not found"

**Retry Policy:**
- LLM output retry: 1 time for format or constraint violations

---

### 5. Delivery Status Schema
**File:** `delivery-status-schema.json`
**Spec Reference:** Implementation Spec §11.2

**Purpose:** Track delivery outcomes for idempotency.

**Delivery Rules:**
- Each channel attempted independently
- Failure in one channel does not block others
- Failed deliveries may be retried safely using run_id
- All outcomes persisted to run artifact

**Status Values:**
- `not_attempted` - Delivery not yet tried
- `success` - Delivery completed successfully
- `failed` - Delivery failed (see error field)

---

### 6. Run Artifact Schema
**File:** `run-artifact-schema.json`
**Spec Reference:** PRD Appendix H, Implementation Spec §11.2

**Purpose:** Complete audit record for the run.

**Run ID Generation:**
```
Algorithm (Implementation Spec §5.1):
1. Determine org identifier (domain > parsed domain > normalized name)
2. Construct: trigger_source | submitted_at_rounded | org_identifier
3. Round submitted_at:
   - inbound: nearest 5 minutes
   - outbound: nearest 60 minutes
4. Hash with SHA-256
5. Prefix with "run_"
```

**Idempotency:**
- Check for existing run artifact with same run_id
- If completed, exit without duplication
- If partial, resume only missing steps

---

## Field-Level Constraints Summary

### Character Limits
| Field | Limit | Type |
|-------|-------|------|
| executive_summary.summary | 600 | characters |
| opening_script | 450 | characters |
| follow_up_emails.short_version.body | 120 | words |
| follow_up_emails.warm_version.body | 180 | words |

### Array Constraints
| Field | Min | Max |
|-------|-----|-----|
| executive_summary.top_opportunities | 3 | 3 |
| artificial_intelligence_opportunities | 3 | 3 |
| objections_and_rebuttals | 3 | 3 |
| demonstration_plan.steps | - | 6 |

### Enum Values
| Field | Valid Values |
|-------|--------------|
| trigger_source | inbound, outbound |
| page_type | home, about, programs, volunteer, donate, faq, staff, contact, other |
| confidence | high, medium, low, not_available |
| delivery_status | not_attempted, success, failed |

---

## Validation Workflow

### 1. Schema Validation (Structural)
```javascript
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(data);
```

### 2. Business Rule Validation (Semantic)
- Word count for email bodies
- "Not found" consistency with confidence level
- Organization identifier requirement (name OR website)
- Evidence traceability to source_urls

### 3. Hard Constraint Validation (Critical)
- Array length constraints (exactly 3, ≤ 6)
- Character limits
- Required fields based on trigger source

---

## Common Validation Errors

### Input Schema
```
❌ Missing both organization.name and organization.website
❌ Invalid email format
❌ Invalid ISO-8601 timestamp
❌ trigger_source not in enum
```

### Brief Output Schema
```
❌ Executive summary exceeds 600 characters
❌ Not exactly 3 top_opportunities
❌ Opening script exceeds 450 characters
❌ Short email exceeds 120 words
❌ Demonstration plan has more than 6 steps
```

### Enrichment Output Schema
```
❌ summary is "Not found" but confidence is not "not_available"
❌ confidence not in enum [high, medium, low, not_available]
```

---

## Integration Examples

### n8n Workflow
```javascript
// 1. Validate input
const inputValid = await validateInput(inputData);
if (!inputValid) throw new Error("Input validation failed");

// 2. Execute scrape
const scrapeResult = await scrapeWebsite(inputData.organization.website);
const scrapeValid = await validateScrapeOutput(scrapeResult);

// 3. Execute enrichment
const enrichmentResult = await enrichPerson(inputData.contact);
const enrichmentValid = await validateEnrichmentOutput(enrichmentResult);

// 4. Execute LLM synthesis
const brief = await generateBrief(inputData, scrapeResult, enrichmentResult);
const briefValid = await validateBriefOutput(brief);
if (!briefValid) {
  // Retry once
  brief = await generateBrief(inputData, scrapeResult, enrichmentResult);
}

// 5. Deliver to channels
const deliveryStatus = await deliverToChannels(brief);
const deliveryValid = await validateDeliveryStatus(deliveryStatus);

// 6. Create run artifact
const runArtifact = await createRunArtifact({...});
await validateRunArtifact(runArtifact);
```

---

## Schema Maintenance

### Modification Checklist
- [ ] Update Implementation Specification first
- [ ] Update corresponding JSON Schema file
- [ ] Update validation code
- [ ] Update test fixtures
- [ ] Update this reference document
- [ ] Version bump if breaking change
- [ ] Document in changelog

### Never Do
- Add undocumented fields
- Remove required fields without spec update
- Relax hard constraints
- Invent default values

---

## File Locations

All schemas located at:
```
/Users/chrismiller/Desktop/Working_Folder/Deal_prep_level-2/schemas/
```

**Schema Files:**
- `input-schema.json`
- `scrape-output-schema.json`
- `enrichment-output-schema.json`
- `brief-output-schema.json`
- `delivery-status-schema.json`
- `run-artifact-schema.json`

**Documentation:**
- `README.md` - Schema overview and usage
- `SCHEMA_REFERENCE.md` - This file
- `validation-example.js` - Example validation code

**Authoritative Sources:**
- `/Deal_prep_level-2/AI_Deal_Prep_Implementation_Spec`
- `/Deal_prep_level-2/Deal_Prep_PRD.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-17 | Initial canonical schemas created from Implementation Spec |

---

**Questions or Issues?**
Refer to the Implementation Specification for authoritative definitions.
