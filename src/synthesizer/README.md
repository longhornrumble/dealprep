# Synthesizer Module

LLM synthesis module for generating Deal Preparation Briefs using Claude API.

## Overview

This module implements the synthesis step of the Level 2 Deal Preparation pipeline per Implementation Spec Sections 8 and 9. It takes normalized input, website scrape data, and enrichment output, then uses Claude to generate a structured Deal Preparation Brief.

## Installation

The module requires the `@anthropic-ai/sdk` package:

```bash
npm install @anthropic-ai/sdk
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | API key for Anthropic Claude API |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Model ID to use |
| `ANTHROPIC_MAX_TOKENS` | No | `4096` | Maximum tokens for response |

## Usage

### Basic Usage in n8n

```typescript
import { synthesizeBrief } from 'deal-prep-level-2/synthesizer';
import { S3StorageAdapter } from 'deal-prep-level-2/storage';

const storage = new S3StorageAdapter({
  bucket: 'deal-prep-artifacts',
  region: 'us-east-1',
});

const config = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
};

const result = await synthesizeBrief(runId, storage, config);

if (result.success) {
  console.log('Brief generated:', result.data);
} else {
  console.error('Synthesis failed:', result.error);
}
```

### Individual Functions

```typescript
import {
  buildPrompt,
  callClaude,
  parseBriefResponse,
  calculateConfidence,
} from 'deal-prep-level-2/synthesizer';

// Build prompt from context
const promptResult = await buildPrompt(context);

// Call Claude directly
const claudeResult = await callClaude(prompt, config);

// Parse and validate response
const briefResult = parseBriefResponse(response, context);

// Calculate confidence score
const confidence = calculateConfidence(brief, context);
```

## API Reference

### synthesizeBrief(runId, storage, config, logger?, metrics?)

Main entry point for brief synthesis.

**Parameters:**
- `runId` (string): Unique run identifier
- `storage` (StorageAdapter): Storage adapter for artifact persistence
- `config` (ClaudeConfig): Claude API configuration
- `logger` (Logger, optional): Custom logger for observability
- `metrics` (Metrics, optional): Custom metrics collector

**Returns:** `Promise<ModuleResult<DealPrepBrief>>`

### buildPrompt(context, templatePath?)

Loads and compiles the prompt template with context data.

**Parameters:**
- `context` (SynthesisContext): Context containing all input artifacts
- `templatePath` (string, optional): Custom template path

**Returns:** `Promise<ModuleResult<string>>`

### callClaude(prompt, config, systemPrompt?, logger?, metrics?)

Calls Claude API with rate limit handling.

**Parameters:**
- `prompt` (string): Compiled prompt to send
- `config` (ClaudeConfig): API configuration
- `systemPrompt` (string, optional): Custom system prompt
- `logger` (Logger, optional): Logger instance
- `metrics` (Metrics, optional): Metrics collector

**Returns:** `Promise<ModuleResult<string>>`

### parseBriefResponse(response, context)

Parses and validates Claude response against the brief schema.

**Parameters:**
- `response` (string): Raw response text from Claude
- `context` (SynthesisContext): Synthesis context for enrichment

**Returns:** `ModuleResult<DealPrepBrief>`

## Testing

### Run Unit Tests

```bash
# Run all synthesizer unit tests
npm test -- tests/unit/synthesizer.test.ts

# Run with verbose output
npm test -- tests/unit/synthesizer.test.ts --verbose
```

### Run Integration Tests

Integration tests require `ANTHROPIC_API_KEY` environment variable:

```bash
# Set API key
export ANTHROPIC_API_KEY="your-api-key"

# Run integration tests
npm run test:integration -- tests/integration/synthesizer.integration.test.ts
```

## Example curl Commands

### Test Claude API Directly

```bash
# Test basic Claude API connectivity
curl -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Say hello in JSON format: {\"greeting\": \"...\"}"}
    ]
  }'
```

### Test Brief Generation (via n8n webhook or test endpoint)

```bash
# Example payload for triggering synthesis
curl -X POST "http://localhost:5678/webhook/deal-prep/synthesize" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "run_test_12345",
    "config": {
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 4096
    }
  }'
```

### Validate Brief Schema

```bash
# Validate a brief JSON against the schema
node -e "
const { DealPrepBriefSchema } = require('./dist/synthesizer/index.js');
const brief = require('./tests/fixtures/sample-brief.json');
const result = DealPrepBriefSchema.safeParse(brief);
console.log(result.success ? 'Valid' : result.error.errors);
"
```

## Observability

### Logging

The module logs at these levels:
- `INFO`: Synthesis start/complete, API calls, retries
- `WARN`: Missing artifacts, rate limits, validation failures
- `ERROR`: API errors, storage errors, synthesis failures
- `DEBUG`: Artifact loading, prompt building, response parsing

### Metrics

Available metrics:
- `synthesizer.started` - Synthesis runs started
- `synthesizer.completed` - Successful completions
- `synthesizer.failed` - Failed synthesis runs
- `synthesizer.claude.calls` - Claude API calls
- `synthesizer.claude.errors` - API errors
- `synthesizer.claude.rate_limit` - Rate limit events
- `synthesizer.claude.duration` - API call duration
- `synthesizer.claude.input_tokens` - Input token count
- `synthesizer.claude.output_tokens` - Output token count
- `synthesizer.duration` - Total synthesis duration

## Hard Constraints (per Spec Section 9.3)

The brief output must satisfy:
- Exactly 3 `top_opportunities`
- Exactly 3 `artificial_intelligence_opportunities`
- Exactly 3 `objections_and_rebuttals`
- `executive_summary.summary` <= 600 characters
- `opening_script` <= 450 characters
- `demonstration_plan.steps` <= 6 items
- `follow_up_emails.short_version.body` <= 120 words
- `follow_up_emails.warm_version.body` <= 180 words
- Missing information labeled as "Not found"

## Error Handling

The module handles:
- Missing API key (`MISSING_API_KEY`)
- Template not found (`TEMPLATE_NOT_FOUND`)
- JSON parse errors (`JSON_PARSE_ERROR`)
- Schema validation errors (`SCHEMA_VALIDATION_ERROR`)
- Constraint violations (`CONSTRAINT_VIOLATION`)
- Claude API errors (`CLAUDE_API_ERROR`)
- Rate limits (automatic exponential backoff)
- Storage errors (`STORAGE_ERROR`)

One retry is allowed for format or constraint violations per spec Section 8.2.
