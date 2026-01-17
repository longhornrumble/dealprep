# Level 2 Deal Preparation - Canonical JSON Schemas

This directory contains the authoritative JSON Schema definitions for the Level 2 Deal Preparation system.

All schemas use **JSON Schema Draft 2020-12** and enforce the constraints specified in the Implementation Specification.

---

## Schema Files

### 1. `input-schema.json`
**Canonical Input Contract** (Implementation Spec §4.1)

Defines the required input structure for initiating a deal prep run.

**Key Constraints:**
- At least one of `organization.name` or `organization.website` must be present
- `meta.submitted_at` and `meta.trigger_source` are required
- All other fields may be null
- Email fields use `format: "email"` validation
- Timezone must be IANA-compliant string

**Source:** Implementation Spec §4.1, §4.2

---

### 2. `scrape-output-schema.json`
**Website Extraction Output** (Implementation Spec §6.3)

Defines the structure of website scraping results.

**Key Constraints:**
- `page_type` must be one of: home, about, programs, volunteer, donate, faq, staff, contact, other
- `extracted_markdown` contains cleaned content with boilerplate removed
- `people_mentions` captures staff and leadership information
- `errors` array captures all scraping failures

**Source:** Implementation Spec §6.3, §6.4

---

### 3. `enrichment-output-schema.json`
**Person Enrichment Output** (Implementation Spec §7.3)

Defines the structure of person/contact enrichment results.

**Key Constraints:**
- `summary` must be "Not found" when unavailable
- `confidence` must be "not_available" when summary is "Not found"
- `confidence` enum: high, medium, low, not_available

**Source:** Implementation Spec §7.3

---

### 4. `brief-output-schema.json`
**Deal Preparation Brief Output** (Implementation Spec §9.2)

**This is the canonical artifact of the entire system.** All downstream rendering, delivery, and storage operations derive from this schema.

**Hard Constraints (Non-Negotiable):**
- `executive_summary.summary` ≤ 600 characters
- `executive_summary.top_opportunities` = exactly 3 items
- `artificial_intelligence_opportunities` = exactly 3 items
- `demonstration_plan.steps` ≤ 6 items
- `objections_and_rebuttals` = exactly 3 items
- `opening_script` ≤ 450 characters
- `follow_up_emails.short_version.body` ≤ 120 words (enforced at validation, not schema constraint)
- `follow_up_emails.warm_version.body` ≤ 180 words (enforced at validation, not schema constraint)
- Missing information must be explicitly labeled "Not found"

**Evidence Requirements:**
- All claims must be traceable to `meta.source_urls`
- No facts may be invented (Implementation Spec §9.4)

**Source:** Implementation Spec §9.2, §9.3, §9.4

---

### 5. `delivery-status-schema.json`
**Delivery Tracking Contract** (Implementation Spec §11.2)

Defines the structure for tracking delivery outcomes across channels.

**Key Constraints:**
- Each delivery channel (CRM, email, Motion) tracked independently
- `status` enum: not_attempted, success, failed
- `attempted_at` is null if status is "not_attempted"
- `error` is null unless status is "failed"

**Source:** Implementation Spec §11.2, §11.3

---

### 6. `run-artifact-schema.json`
**Complete Run Artifact** (PRD Appendix H + Implementation Spec §11.2)

Defines the complete run record for auditing and idempotency.

**Key Constraints:**
- `run_id` is deterministically generated (Implementation Spec §5.1)
- Storage URLs use `format: "uri"` validation
- `deliveries` tracks simplified success/failed outcomes
- `errors` captures all errors across the entire pipeline

**Source:** PRD Appendix H, Implementation Spec §11.2

---

## Validation Usage

### Node.js (Ajv)

```javascript
import Ajv from "ajv";
import addFormats from "ajv-formats";
import inputSchema from "./input-schema.json" assert { type: "json" };

const ajv = new Ajv();
addFormats(ajv);

const validate = ajv.compile(inputSchema);
const valid = validate(data);

if (!valid) {
  console.error(validate.errors);
}
```

### Python (jsonschema)

```python
import json
from jsonschema import validate, ValidationError

with open("input-schema.json") as f:
    schema = json.load(f)

try:
    validate(instance=data, schema=schema)
except ValidationError as e:
    print(e.message)
```

---

## Schema Modification Rules

These schemas are **authoritative** and must not be modified without updating the Implementation Specification.

**To modify a schema:**
1. Update the Implementation Specification first
2. Update the corresponding JSON Schema file
3. Update validation rules in code
4. Update test fixtures
5. Document the change in version control

**Never:**
- Add fields not specified in the Implementation Spec
- Remove required fields
- Relax constraints (e.g., changing minItems/maxItems)
- Invent default values not specified in the spec

---

## Word Count Constraints

Note that JSON Schema cannot enforce word count constraints directly. The following must be validated programmatically:

- `follow_up_emails.short_version.body` ≤ 120 words
- `follow_up_emails.warm_version.body` ≤ 180 words

Use a word-counting validator after schema validation for these fields.

---

## References

- **Implementation Specification:** `/Deal_prep_level-2/AI_Deal_Prep_Implementation_Spec`
- **Product Requirements:** `/Deal_prep_level-2/Deal_Prep_PRD.md`
- **JSON Schema Specification:** https://json-schema.org/draft/2020-12/json-schema-core

---

## Schema Versioning

Current Version: **1.0.0**

All schemas share the same version number. Breaking changes will increment the major version.
