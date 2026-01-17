/**
 * Run Manager Module
 *
 * Responsibilities per Implementation Spec Section 5:
 * - Generate deterministic RunIDs using SHA-256
 * - Implement idempotency checks (prevent duplicate runs)
 * - Manage artifact lifecycle
 * - Track run state and metadata
 *
 * Algorithm per Section 5.1:
 * 1. Determine organization identifier (domain > website domain > normalized name)
 * 2. Construct input: trigger_source | submitted_at_rounded | organization_identifier
 * 3. Round submitted_at: inbound = 5 min, outbound = 60 min
 * 4. Hash using SHA-256
 * 5. Prefix with "run_"
 *
 * Usage in n8n:
 * const { createRun, checkIdempotency } = await import('deal-prep-level-2/run-manager');
 * const runId = await createRun(normalizedInput);
 */

import { createHash } from 'crypto';
import type { RunId, ModuleResult, StorageAdapter } from '../types/index.js';
import type { CanonicalInput, TriggerSource } from '../normalizer/index.js';
import { deriveOrganizationIdentifier } from '../normalizer/index.js';

/**
 * Run status tracking per Implementation Spec Section 11
 */
export type RunStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Run metadata structure
 */
export interface RunMetadata {
  runId: RunId;
  createdAt: string;
  status: RunStatus;
  input: CanonicalInput;
  artifacts: string[];
  error?: string;
  completedAt?: string;
}

/**
 * Run artifact structure for storage
 */
export interface RunArtifact {
  run_id: string;
  status: RunStatus;
  created_at: string;
  completed_at: string | null;
  input: CanonicalInput;
  artifacts: {
    input: boolean;
    scrape: boolean;
    enrichment: boolean;
    brief: boolean;
    run_artifact: boolean;
  };
  deliveries: {
    customer_relationship_management: {
      status: 'not_attempted' | 'success' | 'failed';
      attempted_at: string | null;
      error: string | null;
    };
    email: {
      status: 'not_attempted' | 'success' | 'failed';
      attempted_at: string | null;
      error: string | null;
    };
    motion: {
      status: 'not_attempted' | 'success' | 'failed';
      attempted_at: string | null;
      error: string | null;
    };
  };
  errors: string[];
}

/**
 * Configuration for run manager
 */
export interface RunManagerConfig {
  storage: StorageAdapter;
}

/**
 * Rounding intervals in milliseconds
 */
const ROUNDING_INTERVALS = {
  inbound: 5 * 60 * 1000,   // 5 minutes
  outbound: 60 * 60 * 1000, // 60 minutes
} as const;

/**
 * Round timestamp to nearest interval
 * Per Implementation Spec Section 5.1:
 * - inbound triggers: nearest five minutes
 * - outbound triggers: nearest sixty minutes
 *
 * @param timestamp - ISO-8601 timestamp string
 * @param triggerSource - 'inbound' or 'outbound'
 * @returns Rounded ISO-8601 timestamp string
 */
export function roundTimestamp(timestamp: string, triggerSource: TriggerSource): string {
  const date = new Date(timestamp);
  const intervalMs = ROUNDING_INTERVALS[triggerSource];
  const roundedMs = Math.floor(date.getTime() / intervalMs) * intervalMs;
  return new Date(roundedMs).toISOString();
}

/**
 * Generate deterministic run ID using SHA-256
 * Per Implementation Spec Section 5.1
 *
 * Algorithm:
 * 1. Determine organization identifier
 * 2. Construct input string: trigger_source | submitted_at_rounded | organization_identifier
 * 3. Hash using SHA-256
 * 4. Prefix with "run_"
 *
 * @param input - Canonical input payload
 * @returns Deterministic run ID prefixed with "run_"
 */
export function generateRunId(input: CanonicalInput): RunId {
  // Step 1: Derive organization identifier per Section 5.1 precedence
  const orgIdentifier = deriveOrganizationIdentifier(input);

  if (!orgIdentifier) {
    throw new Error('Cannot generate run ID: no organization identifier available');
  }

  // Step 2: Round submitted_at based on trigger source
  const roundedTimestamp = roundTimestamp(
    input.meta.submitted_at,
    input.meta.trigger_source
  );

  // Step 3: Construct input string with pipe separator
  const hashInput = [
    input.meta.trigger_source,
    roundedTimestamp,
    orgIdentifier,
  ].join('|');

  // Step 4: Hash using SHA-256
  const hash = createHash('sha256').update(hashInput).digest('hex');

  // Step 5: Prefix with "run_" and take first 16 characters of hash for reasonable length
  return `run_${hash.substring(0, 16)}`;
}

/**
 * Generate run ID with full hash (for cases requiring complete uniqueness guarantee)
 *
 * @param input - Canonical input payload
 * @returns Deterministic run ID with full SHA-256 hash
 */
export function generateRunIdFull(input: CanonicalInput): RunId {
  const orgIdentifier = deriveOrganizationIdentifier(input);

  if (!orgIdentifier) {
    throw new Error('Cannot generate run ID: no organization identifier available');
  }

  const roundedTimestamp = roundTimestamp(
    input.meta.submitted_at,
    input.meta.trigger_source
  );

  const hashInput = [
    input.meta.trigger_source,
    roundedTimestamp,
    orgIdentifier,
  ].join('|');

  const hash = createHash('sha256').update(hashInput).digest('hex');
  return `run_${hash}`;
}

// Module-level storage reference for stateful operations
let _storage: StorageAdapter | null = null;

/**
 * Initialize the run manager with a storage adapter
 *
 * @param config - Configuration containing storage adapter
 */
export function initializeRunManager(config: RunManagerConfig): void {
  _storage = config.storage;
}

/**
 * Get the configured storage adapter
 *
 * @returns Storage adapter or throws if not initialized
 */
function getStorage(): StorageAdapter {
  if (!_storage) {
    throw new Error('Run manager not initialized. Call initializeRunManager() first.');
  }
  return _storage;
}

/**
 * Create a new run artifact with initial state
 *
 * @param runId - Generated run ID
 * @param input - Canonical input payload
 * @returns Run artifact object
 */
function createRunArtifact(runId: RunId, input: CanonicalInput): RunArtifact {
  return {
    run_id: runId,
    status: 'pending',
    created_at: new Date().toISOString(),
    completed_at: null,
    input,
    artifacts: {
      input: false,
      scrape: false,
      enrichment: false,
      brief: false,
      run_artifact: false,
    },
    deliveries: {
      customer_relationship_management: {
        status: 'not_attempted',
        attempted_at: null,
        error: null,
      },
      email: {
        status: 'not_attempted',
        attempted_at: null,
        error: null,
      },
      motion: {
        status: 'not_attempted',
        attempted_at: null,
        error: null,
      },
    },
    errors: [],
  };
}

/**
 * Check if a run with the same input already exists (idempotency check)
 * Per Implementation Spec Section 5.2
 *
 * @param input - Canonical input to check
 * @param storage - Optional storage adapter override
 * @returns ModuleResult with existence status and existing run ID if found
 */
export async function checkIdempotency(
  input: CanonicalInput,
  storage?: StorageAdapter
): Promise<ModuleResult<{ exists: boolean; existingRunId?: RunId; runArtifact?: RunArtifact }>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const storageAdapter = storage ?? getStorage();

  try {
    // Generate the deterministic run ID for this input
    const runId = generateRunId(input);

    // Check if run artifact exists
    const exists = await storageAdapter.exists(runId, 'run_artifact');

    if (exists) {
      // Load the existing run artifact to check status
      const { content } = await storageAdapter.load(runId, 'run_artifact');
      const runArtifact = JSON.parse(content.toString()) as RunArtifact;

      return {
        success: true,
        data: {
          exists: true,
          existingRunId: runId,
          runArtifact,
        },
        metadata: {
          runId,
          module: 'run-manager',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: { exists: false },
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        code: 'IDEMPOTENCY_CHECK_ERROR',
        message: `Failed to check idempotency: ${errorMessage}`,
        details: { error },
      },
      metadata: {
        runId: '',
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a new run with idempotency enforcement
 * Per Implementation Spec Section 5.2:
 * - Check for existing run artifact before execution
 * - If completed, exit without duplication
 * - If partially completed, return info for resumption
 *
 * @param input - Canonical input payload
 * @param storage - Optional storage adapter override
 * @returns ModuleResult with run metadata
 */
export async function createRun(
  input: CanonicalInput,
  storage?: StorageAdapter
): Promise<ModuleResult<RunMetadata>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const storageAdapter = storage ?? getStorage();

  try {
    // Generate deterministic run ID
    const runId = generateRunId(input);

    // Check idempotency
    const idempotencyResult = await checkIdempotency(input, storageAdapter);

    if (!idempotencyResult.success) {
      return {
        success: false,
        error: idempotencyResult.error ?? {
          code: 'UNKNOWN_ERROR',
          message: 'Idempotency check failed',
        },
        metadata: {
          runId,
          module: 'run-manager',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    const { exists, runArtifact: existingArtifact } = idempotencyResult.data!;

    if (exists && existingArtifact) {
      // Run already exists - check if completed
      if (existingArtifact.status === 'completed') {
        return {
          success: true,
          data: {
            runId,
            createdAt: existingArtifact.created_at,
            status: 'completed',
            input: existingArtifact.input,
            artifacts: Object.entries(existingArtifact.artifacts)
              .filter(([, v]) => v)
              .map(([k]) => k),
          },
          metadata: {
            runId,
            module: 'run-manager',
            timestamp,
            duration: Date.now() - startTime,
          },
        };
      }

      // Partially completed - return for resumption
      const partialData: RunMetadata = {
        runId,
        createdAt: existingArtifact.created_at,
        status: existingArtifact.status,
        input: existingArtifact.input,
        artifacts: Object.entries(existingArtifact.artifacts)
          .filter(([, v]) => v)
          .map(([k]) => k),
      };
      if (existingArtifact.errors.length > 0) {
        partialData.error = existingArtifact.errors.join('; ');
      }
      return {
        success: true,
        data: partialData,
        metadata: {
          runId,
          module: 'run-manager',
          timestamp,
          duration: Date.now() - startTime,
        },
      };
    }

    // Create new run artifact
    const runArtifact = createRunArtifact(runId, input);

    // Save run artifact
    await storageAdapter.save(
      runId,
      'run_artifact',
      JSON.stringify(runArtifact, null, 2),
      { contentType: 'application/json' }
    );

    // Save input artifact
    await storageAdapter.save(
      runId,
      'input',
      JSON.stringify(input, null, 2),
      { contentType: 'application/json' }
    );

    // Update run artifact to mark input as saved
    runArtifact.artifacts.input = true;
    runArtifact.artifacts.run_artifact = true;
    await storageAdapter.save(
      runId,
      'run_artifact',
      JSON.stringify(runArtifact, null, 2),
      { contentType: 'application/json' }
    );

    return {
      success: true,
      data: {
        runId,
        createdAt: runArtifact.created_at,
        status: 'pending',
        input,
        artifacts: ['input', 'run_artifact'],
      },
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        code: 'RUN_CREATION_ERROR',
        message: `Failed to create run: ${errorMessage}`,
        details: { error },
      },
      metadata: {
        runId: '',
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Update run status
 *
 * @param runId - Run ID to update
 * @param status - New status
 * @param error - Optional error message
 * @param storage - Optional storage adapter override
 * @returns ModuleResult with updated run metadata
 */
export async function updateRunStatus(
  runId: RunId,
  status: RunStatus,
  error?: string,
  storage?: StorageAdapter
): Promise<ModuleResult<RunMetadata>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const storageAdapter = storage ?? getStorage();

  try {
    // Load existing run artifact
    const { content } = await storageAdapter.load(runId, 'run_artifact');
    const runArtifact = JSON.parse(content.toString()) as RunArtifact;

    // Update status
    runArtifact.status = status;

    if (status === 'completed' || status === 'failed') {
      runArtifact.completed_at = timestamp;
    }

    if (error) {
      runArtifact.errors.push(error);
    }

    // Save updated artifact
    await storageAdapter.save(
      runId,
      'run_artifact',
      JSON.stringify(runArtifact, null, 2),
      { contentType: 'application/json' }
    );

    const resultData: RunMetadata = {
      runId,
      createdAt: runArtifact.created_at,
      status: runArtifact.status,
      input: runArtifact.input,
      artifacts: Object.entries(runArtifact.artifacts)
        .filter(([, v]) => v)
        .map(([k]) => k),
    };
    if (runArtifact.errors.length > 0) {
      resultData.error = runArtifact.errors.join('; ');
    }
    return {
      success: true,
      data: resultData,
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        code: 'STATUS_UPDATE_ERROR',
        message: `Failed to update run status: ${errorMessage}`,
        details: { error },
      },
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Get run metadata
 *
 * @param runId - Run ID to retrieve
 * @param storage - Optional storage adapter override
 * @returns ModuleResult with run metadata
 */
export async function getRunMetadata(
  runId: RunId,
  storage?: StorageAdapter
): Promise<ModuleResult<RunMetadata>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const storageAdapter = storage ?? getStorage();

  try {
    const { content } = await storageAdapter.load(runId, 'run_artifact');
    const runArtifact = JSON.parse(content.toString()) as RunArtifact;

    const resultData: RunMetadata = {
      runId,
      createdAt: runArtifact.created_at,
      status: runArtifact.status,
      input: runArtifact.input,
      artifacts: Object.entries(runArtifact.artifacts)
        .filter(([, v]) => v)
        .map(([k]) => k),
    };
    if (runArtifact.errors.length > 0) {
      resultData.error = runArtifact.errors.join('; ');
    }
    return {
      success: true,
      data: resultData,
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        code: 'RUN_NOT_FOUND',
        message: `Failed to get run metadata: ${errorMessage}`,
        details: { error },
      },
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Update artifact completion status in run artifact
 *
 * @param runId - Run ID
 * @param artifactType - Type of artifact completed
 * @param storage - Optional storage adapter override
 * @returns ModuleResult indicating success
 */
export async function markArtifactComplete(
  runId: RunId,
  artifactType: 'input' | 'scrape' | 'enrichment' | 'brief' | 'run_artifact',
  storage?: StorageAdapter
): Promise<ModuleResult<void>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const storageAdapter = storage ?? getStorage();

  try {
    const { content } = await storageAdapter.load(runId, 'run_artifact');
    const runArtifact = JSON.parse(content.toString()) as RunArtifact;

    runArtifact.artifacts[artifactType] = true;

    await storageAdapter.save(
      runId,
      'run_artifact',
      JSON.stringify(runArtifact, null, 2),
      { contentType: 'application/json' }
    );

    return {
      success: true,
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        code: 'ARTIFACT_MARK_ERROR',
        message: `Failed to mark artifact complete: ${errorMessage}`,
        details: { error },
      },
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Update delivery status in run artifact
 * Per Implementation Spec Section 11
 *
 * @param runId - Run ID
 * @param channel - Delivery channel
 * @param status - Delivery status
 * @param error - Optional error message
 * @param storage - Optional storage adapter override
 * @returns ModuleResult indicating success
 */
export async function updateDeliveryStatus(
  runId: RunId,
  channel: 'customer_relationship_management' | 'email' | 'motion',
  status: 'success' | 'failed',
  error?: string,
  storage?: StorageAdapter
): Promise<ModuleResult<void>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const storageAdapter = storage ?? getStorage();

  try {
    const { content } = await storageAdapter.load(runId, 'run_artifact');
    const runArtifact = JSON.parse(content.toString()) as RunArtifact;

    runArtifact.deliveries[channel] = {
      status,
      attempted_at: timestamp,
      error: error ?? null,
    };

    await storageAdapter.save(
      runId,
      'run_artifact',
      JSON.stringify(runArtifact, null, 2),
      { contentType: 'application/json' }
    );

    return {
      success: true,
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        code: 'DELIVERY_UPDATE_ERROR',
        message: `Failed to update delivery status: ${errorMessage}`,
        details: { error },
      },
      metadata: {
        runId,
        module: 'run-manager',
        timestamp,
        duration: Date.now() - startTime,
      },
    };
  }
}
