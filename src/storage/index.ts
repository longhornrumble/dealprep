/**
 * Storage Module
 *
 * Responsibilities:
 * - Define StorageAdapter interface
 * - Implement S3StorageAdapter using AWS SDK v3
 * - Implement MemoryStorageAdapter for testing
 * - Handle artifact CRUD operations
 * - Manage metadata and checksums
 *
 * Storage paths per project decisions:
 * - runs/{run_id}/input.json
 * - runs/{run_id}/scrape.json
 * - runs/{run_id}/enrichment.json
 * - runs/{run_id}/brief.json
 * - runs/{run_id}/run_artifact.json
 *
 * Usage in n8n:
 * const { S3StorageAdapter } = await import('deal-prep-level-2/storage');
 * const storage = new S3StorageAdapter(config);
 * await storage.save(runId, 'brief', content);
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import type { StorageAdapter, ArtifactMetadata, RunId } from '../types/index.js';

export type { StorageAdapter };

/**
 * Valid artifact types for storage
 */
export type ArtifactType = 'input' | 'scrape' | 'enrichment' | 'brief' | 'run_artifact';

/**
 * Map artifact type to file name
 */
const ARTIFACT_FILE_NAMES: Record<ArtifactType, string> = {
  input: 'input.json',
  scrape: 'scrape.json',
  enrichment: 'enrichment.json',
  brief: 'brief.json',
  run_artifact: 'run_artifact.json',
};

/**
 * S3 configuration for storage adapter
 */
export interface S3Config {
  /** S3 bucket name */
  bucket: string;
  /** AWS region (defaults to us-east-1) */
  region?: string;
  /** Key prefix for all objects (defaults to 'runs') */
  prefix?: string;
  /** Custom S3 endpoint for local development or alternative S3-compatible services */
  endpoint?: string;
  /** AWS credentials (optional if using IAM roles or environment variables) */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Force path style for S3-compatible services like MinIO */
  forcePathStyle?: boolean;
}

/**
 * Calculate MD5 checksum for content
 *
 * @param content - String or Buffer content
 * @returns MD5 hash as hex string
 */
function calculateChecksum(content: string | Buffer): string {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  return createHash('md5').update(buffer).digest('hex');
}

/**
 * Get content size in bytes
 *
 * @param content - String or Buffer content
 * @returns Size in bytes
 */
function getContentSize(content: string | Buffer): number {
  return typeof content === 'string' ? Buffer.byteLength(content, 'utf-8') : content.length;
}

/**
 * S3 implementation of StorageAdapter using AWS SDK v3
 *
 * Provides durable artifact storage for deal preparation runs.
 * Implements the StorageAdapter interface for consistent artifact management.
 */
export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  /**
   * Create a new S3StorageAdapter
   *
   * @param config - S3 configuration options
   */
  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? 'runs';

    // Build S3 client configuration
    const clientConfig: S3ClientConfig = {
      region: config.region ?? 'us-east-1',
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }

    if (config.credentials) {
      clientConfig.credentials = config.credentials;
    }

    if (config.forcePathStyle) {
      clientConfig.forcePathStyle = true;
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Generate S3 key for artifact
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact
   * @returns S3 object key
   */
  private getKey(runId: RunId, artifactType: string): string {
    const fileName = ARTIFACT_FILE_NAMES[artifactType as ArtifactType] ?? `${artifactType}.json`;
    return `${this.prefix}/${runId}/${fileName}`;
  }

  /**
   * Parse artifact type from S3 key
   *
   * @param key - S3 object key
   * @returns Artifact type or 'unknown'
   */
  private parseArtifactType(key: string): string {
    const fileName = key.split('/').pop() ?? '';
    for (const [type, name] of Object.entries(ARTIFACT_FILE_NAMES)) {
      if (name === fileName) {
        return type;
      }
    }
    return fileName.replace('.json', '');
  }

  /**
   * Save artifact to S3
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact (input, scrape, enrichment, brief, run_artifact)
   * @param content - Content to save (string or Buffer)
   * @param metadata - Optional additional metadata
   * @returns Artifact metadata
   */
  async save(
    runId: RunId,
    artifactType: string,
    content: string | Buffer,
    metadata?: Record<string, unknown>
  ): Promise<ArtifactMetadata> {
    const key = this.getKey(runId, artifactType);
    const now = new Date().toISOString();
    const checksum = calculateChecksum(content);
    const size = getContentSize(content);

    // Determine content type
    const contentType = (metadata?.contentType as string) ?? 'application/json';

    // Build S3 metadata
    const s3Metadata: Record<string, string> = {
      'run-id': runId,
      'artifact-type': artifactType,
      'created-at': now,
      checksum,
    };

    // Add custom metadata
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (k !== 'contentType' && typeof v === 'string') {
          s3Metadata[k] = v;
        }
      }
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: typeof content === 'string' ? content : content,
      ContentType: contentType,
      Metadata: s3Metadata,
    });

    await this.client.send(command);

    const artifactMetadata: ArtifactMetadata = {
      runId,
      artifactType: artifactType as ArtifactMetadata['artifactType'],
      fileName: ARTIFACT_FILE_NAMES[artifactType as ArtifactType] ?? `${artifactType}.json`,
      createdAt: now,
      contentType,
      size,
      checksum,
    };

    return artifactMetadata;
  }

  /**
   * Load artifact from S3
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact to load
   * @returns Content and metadata
   * @throws Error if artifact not found
   */
  async load(
    runId: RunId,
    artifactType: string
  ): Promise<{ content: string | Buffer; metadata: ArtifactMetadata }> {
    const key = this.getKey(runId, artifactType);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Artifact not found: ${runId}/${artifactType}`);
    }

    // Convert stream to string
    const content = await response.Body.transformToString();

    const metadata: ArtifactMetadata = {
      runId,
      artifactType: artifactType as ArtifactMetadata['artifactType'],
      fileName: ARTIFACT_FILE_NAMES[artifactType as ArtifactType] ?? `${artifactType}.json`,
      createdAt: response.Metadata?.['created-at'] ?? new Date().toISOString(),
      contentType: response.ContentType ?? 'application/json',
    };

    if (response.ContentLength !== undefined) {
      metadata.size = response.ContentLength;
    }

    if (response.Metadata?.checksum) {
      metadata.checksum = response.Metadata.checksum;
    }

    return { content, metadata };
  }

  /**
   * Check if artifact exists in S3
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact to check
   * @returns True if artifact exists
   */
  async exists(runId: RunId, artifactType: string): Promise<boolean> {
    const key = this.getKey(runId, artifactType);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      // Check for "not found" errors
      if (
        error instanceof Error &&
        (error.name === 'NotFound' ||
          error.name === 'NoSuchKey' ||
          error.message.includes('404') ||
          error.message.includes('Not Found'))
      ) {
        return false;
      }
      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * List all artifacts for a run
   *
   * @param runId - Run identifier
   * @returns Array of artifact metadata
   */
  async list(runId: RunId): Promise<ArtifactMetadata[]> {
    const prefix = `${this.prefix}/${runId}/`;

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    const response = await this.client.send(command);

    if (!response.Contents) {
      return [];
    }

    return response.Contents.map((obj) => {
      const artifactType = this.parseArtifactType(obj.Key ?? '');
      const metadata: ArtifactMetadata = {
        runId,
        artifactType: artifactType as ArtifactMetadata['artifactType'],
        fileName: obj.Key?.split('/').pop() ?? '',
        createdAt: obj.LastModified?.toISOString() ?? new Date().toISOString(),
        contentType: 'application/json',
      };
      if (obj.Size !== undefined) {
        metadata.size = obj.Size;
      }
      return metadata;
    });
  }

  /**
   * Delete artifact(s) from S3
   *
   * @param runId - Run identifier
   * @param artifactType - Optional specific artifact to delete. If not provided, deletes all artifacts for the run.
   */
  async delete(runId: RunId, artifactType?: string): Promise<void> {
    if (artifactType) {
      // Delete specific artifact
      const key = this.getKey(runId, artifactType);
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
    } else {
      // Delete all artifacts for the run
      const artifacts = await this.list(runId);
      for (const artifact of artifacts) {
        const key = this.getKey(runId, artifact.artifactType);
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
        await this.client.send(command);
      }
    }
  }
}

/**
 * In-memory storage adapter for testing and development
 *
 * Provides the same interface as S3StorageAdapter but stores
 * artifacts in memory. Useful for unit tests and local development.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private store: Map<string, { content: string | Buffer; metadata: ArtifactMetadata }> = new Map();

  /**
   * Generate storage key
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact
   * @returns Storage key
   */
  private getKey(runId: RunId, artifactType: string): string {
    return `${runId}/${artifactType}`;
  }

  /**
   * Save artifact to memory
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact
   * @param content - Content to save
   * @param metadata - Optional additional metadata
   * @returns Artifact metadata
   */
  async save(
    runId: RunId,
    artifactType: string,
    content: string | Buffer,
    metadata?: Record<string, unknown>
  ): Promise<ArtifactMetadata> {
    const key = this.getKey(runId, artifactType);
    const now = new Date().toISOString();
    const checksum = calculateChecksum(content);
    const size = getContentSize(content);
    const contentType = (metadata?.contentType as string) ?? 'application/json';

    const artifactMetadata: ArtifactMetadata = {
      runId,
      artifactType: artifactType as ArtifactMetadata['artifactType'],
      fileName: ARTIFACT_FILE_NAMES[artifactType as ArtifactType] ?? `${artifactType}.json`,
      createdAt: now,
      contentType,
      size,
      checksum,
    };

    this.store.set(key, { content, metadata: artifactMetadata });

    return artifactMetadata;
  }

  /**
   * Load artifact from memory
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact to load
   * @returns Content and metadata
   * @throws Error if artifact not found
   */
  async load(
    runId: RunId,
    artifactType: string
  ): Promise<{ content: string | Buffer; metadata: ArtifactMetadata }> {
    const key = this.getKey(runId, artifactType);
    const item = this.store.get(key);

    if (!item) {
      throw new Error(`Artifact not found: ${runId}/${artifactType}`);
    }

    return item;
  }

  /**
   * Check if artifact exists in memory
   *
   * @param runId - Run identifier
   * @param artifactType - Type of artifact to check
   * @returns True if artifact exists
   */
  async exists(runId: RunId, artifactType: string): Promise<boolean> {
    const key = this.getKey(runId, artifactType);
    return this.store.has(key);
  }

  /**
   * List all artifacts for a run
   *
   * @param runId - Run identifier
   * @returns Array of artifact metadata
   */
  async list(runId: RunId): Promise<ArtifactMetadata[]> {
    const prefix = `${runId}/`;
    const artifacts: ArtifactMetadata[] = [];

    for (const [key, value] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        artifacts.push(value.metadata);
      }
    }

    return artifacts;
  }

  /**
   * Delete artifact(s) from memory
   *
   * @param runId - Run identifier
   * @param artifactType - Optional specific artifact to delete
   */
  async delete(runId: RunId, artifactType?: string): Promise<void> {
    if (artifactType) {
      const key = this.getKey(runId, artifactType);
      this.store.delete(key);
    } else {
      // Delete all artifacts for the run
      const prefix = `${runId}/`;
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    }
  }

  /**
   * Clear all stored artifacts (useful for test cleanup)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of stored artifacts (useful for testing)
   *
   * @returns Number of stored artifacts
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Get all stored keys (useful for debugging)
   *
   * @returns Array of storage keys
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

/**
 * Factory function to create appropriate storage adapter based on environment
 *
 * @param config - Configuration options
 * @returns Storage adapter instance
 */
export function createStorageAdapter(
  config: S3Config | { type: 'memory' }
): StorageAdapter {
  if ('type' in config && config.type === 'memory') {
    return new MemoryStorageAdapter();
  }
  return new S3StorageAdapter(config as S3Config);
}
