/**
 * Schema Index
 *
 * Centralized exports for all Level 2 Deal Preparation schemas
 * Version: 1.0.0
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a schema from file
 */
function loadSchema(filename) {
  const schemaPath = join(__dirname, filename);
  const content = readFileSync(schemaPath, "utf-8");
  return JSON.parse(content);
}

// Export all schemas
export const inputSchema = loadSchema("input-schema.json");
export const scrapeOutputSchema = loadSchema("scrape-output-schema.json");
export const enrichmentOutputSchema = loadSchema("enrichment-output-schema.json");
export const briefOutputSchema = loadSchema("brief-output-schema.json");
export const deliveryStatusSchema = loadSchema("delivery-status-schema.json");
export const runArtifactSchema = loadSchema("run-artifact-schema.json");

// Export as default object
export default {
  input: inputSchema,
  scrapeOutput: scrapeOutputSchema,
  enrichmentOutput: enrichmentOutputSchema,
  briefOutput: briefOutputSchema,
  deliveryStatus: deliveryStatusSchema,
  runArtifact: runArtifactSchema
};

/**
 * Schema metadata
 */
export const schemaMetadata = {
  version: "1.0.0",
  specification: "AI_Deal_Prep_Implementation_Spec",
  jsonSchemaVersion: "https://json-schema.org/draft/2020-12/schema",
  schemas: {
    input: {
      file: "input-schema.json",
      title: "Deal Preparation Input Schema",
      specReference: "Implementation Spec §4.1"
    },
    scrapeOutput: {
      file: "scrape-output-schema.json",
      title: "Website Scrape Output Schema",
      specReference: "Implementation Spec §6.3"
    },
    enrichmentOutput: {
      file: "enrichment-output-schema.json",
      title: "Person Enrichment Output Schema",
      specReference: "Implementation Spec §7.3"
    },
    briefOutput: {
      file: "brief-output-schema.json",
      title: "Deal Preparation Brief Output Schema (CANONICAL)",
      specReference: "Implementation Spec §9.2"
    },
    deliveryStatus: {
      file: "delivery-status-schema.json",
      title: "Delivery Status Schema",
      specReference: "Implementation Spec §11.2"
    },
    runArtifact: {
      file: "run-artifact-schema.json",
      title: "Run Artifact Schema",
      specReference: "PRD Appendix H + Implementation Spec §11.2"
    }
  }
};
