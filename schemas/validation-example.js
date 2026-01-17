/**
 * Schema Validation Example
 *
 * Demonstrates how to validate data against the canonical schemas
 * for the Level 2 Deal Preparation system.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Ajv with format support
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: true
});
addFormats(ajv);

/**
 * Load and compile a schema
 */
async function loadSchema(schemaName) {
  const schemaPath = path.join(__dirname, `${schemaName}.json`);
  const schemaContent = await fs.readFile(schemaPath, "utf-8");
  const schema = JSON.parse(schemaContent);
  return ajv.compile(schema);
}

/**
 * Validate input payload
 */
async function validateInput(data) {
  const validate = await loadSchema("input-schema");
  const valid = validate(data);

  if (!valid) {
    console.error("Input validation errors:", validate.errors);
    return false;
  }

  // Additional business rule validation
  const org = data.organization;
  if (!org.name && !org.website) {
    console.error("At least one of organization.name or organization.website is required");
    return false;
  }

  return true;
}

/**
 * Validate scrape output
 */
async function validateScrapeOutput(data) {
  const validate = await loadSchema("scrape-output-schema");
  return validate(data);
}

/**
 * Validate enrichment output
 */
async function validateEnrichmentOutput(data) {
  const validate = await loadSchema("enrichment-output-schema");
  const valid = validate(data);

  if (!valid) {
    return false;
  }

  // Additional constraint: when summary is "Not found", confidence must be "not_available"
  if (data.requester_profile.summary === "Not found" &&
      data.requester_profile.confidence !== "not_available") {
    console.error("When summary is 'Not found', confidence must be 'not_available'");
    return false;
  }

  return true;
}

/**
 * Validate Deal Prep Brief output
 * Includes hard constraints from Implementation Spec §9.3
 */
async function validateBriefOutput(data) {
  const validate = await loadSchema("brief-output-schema");
  const valid = validate(data);

  if (!valid) {
    console.error("Brief validation errors:", validate.errors);
    return false;
  }

  // Hard constraint validations (Implementation Spec §9.3)
  const errors = [];

  // Executive summary ≤ 600 characters
  if (data.executive_summary.summary.length > 600) {
    errors.push(`Executive summary exceeds 600 characters: ${data.executive_summary.summary.length}`);
  }

  // Opening script ≤ 450 characters
  if (data.opening_script.length > 450) {
    errors.push(`Opening script exceeds 450 characters: ${data.opening_script.length}`);
  }

  // Demonstration plan ≤ 6 steps
  if (data.demonstration_plan.steps.length > 6) {
    errors.push(`Demonstration plan exceeds 6 steps: ${data.demonstration_plan.steps.length}`);
  }

  // Short email ≤ 120 words
  const shortEmailWords = data.follow_up_emails.short_version.body.split(/\s+/).length;
  if (shortEmailWords > 120) {
    errors.push(`Short email exceeds 120 words: ${shortEmailWords}`);
  }

  // Warm email ≤ 180 words
  const warmEmailWords = data.follow_up_emails.warm_version.body.split(/\s+/).length;
  if (warmEmailWords > 180) {
    errors.push(`Warm email exceeds 180 words: ${warmEmailWords}`);
  }

  if (errors.length > 0) {
    console.error("Hard constraint violations:", errors);
    return false;
  }

  return true;
}

/**
 * Validate delivery status
 */
async function validateDeliveryStatus(data) {
  const validate = await loadSchema("delivery-status-schema");
  return validate(data);
}

/**
 * Validate run artifact
 */
async function validateRunArtifact(data) {
  const validate = await loadSchema("run-artifact-schema");
  return validate(data);
}

// Example usage
async function main() {
  // Example input payload
  const exampleInput = {
    meta: {
      trigger_source: "inbound",
      submitted_at: "2026-01-17T12:00:00Z",
      run_id: "run_abc123",
      requested_meeting_at: "2026-01-20T14:00:00Z",
      timezone: "America/Los_Angeles"
    },
    organization: {
      name: "Example Nonprofit",
      website: "https://example.org",
      domain: "example.org"
    },
    contact: {
      full_name: "Jane Doe",
      first_name: "Jane",
      last_name: "Doe",
      title: "Executive Director",
      email: "jane@example.org",
      phone: "+1-555-0123",
      linkedin_url: "https://linkedin.com/in/janedoe"
    },
    notes: {
      comments: "Interested in volunteer management",
      intent_topic: "AI chatbot for volunteers",
      source_context: "Website demo form"
    },
    routing: {
      crm_target: "hubspot",
      email_to: "chris@myrecruiter.ai",
      email_cc: [],
      motion_workspace: "sales"
    }
  };

  console.log("Validating input payload...");
  const inputValid = await validateInput(exampleInput);
  console.log(`Input valid: ${inputValid}\n`);

  // Add more validation examples as needed
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  validateInput,
  validateScrapeOutput,
  validateEnrichmentOutput,
  validateBriefOutput,
  validateDeliveryStatus,
  validateRunArtifact
};
