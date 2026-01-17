/**
 * Unit tests for the Storage Module
 * Tests MemoryStorageAdapter functionality
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { MemoryStorageAdapter } from '../../src/storage/index.js';

describe('Storage Module', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('MemoryStorageAdapter', () => {
    describe('save()', () => {
      test('should save artifact and return metadata', async () => {
        const runId = 'run_test123';
        const content = JSON.stringify({ test: 'data' });

        const metadata = await storage.save(runId, 'input', content);

        expect(metadata.runId).toBe(runId);
        expect(metadata.artifactType).toBe('input');
        expect(metadata.fileName).toBe('input.json');
        expect(metadata.contentType).toBe('application/json');
        expect(metadata.size).toBe(Buffer.byteLength(content, 'utf-8'));
        expect(metadata.checksum).toBeDefined();
      });

      test('should handle custom content type', async () => {
        const runId = 'run_test123';
        const content = '<html></html>';

        const metadata = await storage.save(runId, 'html', content, {
          contentType: 'text/html',
        });

        expect(metadata.contentType).toBe('text/html');
      });

      test('should handle Buffer content', async () => {
        const runId = 'run_test123';
        const content = Buffer.from('binary data');

        const metadata = await storage.save(runId, 'input', content);

        expect(metadata.size).toBe(content.length);
      });
    });

    describe('load()', () => {
      test('should load saved artifact', async () => {
        const runId = 'run_test123';
        const originalContent = JSON.stringify({ test: 'data' });

        await storage.save(runId, 'input', originalContent);
        const { content, metadata } = await storage.load(runId, 'input');

        expect(content).toBe(originalContent);
        expect(metadata.runId).toBe(runId);
        expect(metadata.artifactType).toBe('input');
      });

      test('should throw error for non-existent artifact', async () => {
        await expect(storage.load('run_nonexistent', 'input')).rejects.toThrow(
          'Artifact not found'
        );
      });
    });

    describe('exists()', () => {
      test('should return true for existing artifact', async () => {
        const runId = 'run_test123';
        await storage.save(runId, 'input', '{}');

        const exists = await storage.exists(runId, 'input');

        expect(exists).toBe(true);
      });

      test('should return false for non-existent artifact', async () => {
        const exists = await storage.exists('run_nonexistent', 'input');

        expect(exists).toBe(false);
      });
    });

    describe('list()', () => {
      test('should list all artifacts for a run', async () => {
        const runId = 'run_test123';
        await storage.save(runId, 'input', '{}');
        await storage.save(runId, 'scrape', '{}');
        await storage.save(runId, 'brief', '{}');

        const artifacts = await storage.list(runId);

        expect(artifacts).toHaveLength(3);
        expect(artifacts.map((a) => a.artifactType).sort()).toEqual([
          'brief',
          'input',
          'scrape',
        ]);
      });

      test('should return empty array for run with no artifacts', async () => {
        const artifacts = await storage.list('run_nonexistent');

        expect(artifacts).toHaveLength(0);
      });

      test('should not include artifacts from other runs', async () => {
        await storage.save('run_1', 'input', '{}');
        await storage.save('run_2', 'input', '{}');

        const artifacts = await storage.list('run_1');

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].runId).toBe('run_1');
      });
    });

    describe('delete()', () => {
      test('should delete specific artifact', async () => {
        const runId = 'run_test123';
        await storage.save(runId, 'input', '{}');
        await storage.save(runId, 'scrape', '{}');

        await storage.delete(runId, 'input');

        expect(await storage.exists(runId, 'input')).toBe(false);
        expect(await storage.exists(runId, 'scrape')).toBe(true);
      });

      test('should delete all artifacts for run when type not specified', async () => {
        const runId = 'run_test123';
        await storage.save(runId, 'input', '{}');
        await storage.save(runId, 'scrape', '{}');
        await storage.save(runId, 'brief', '{}');

        await storage.delete(runId);

        const artifacts = await storage.list(runId);
        expect(artifacts).toHaveLength(0);
      });
    });

    describe('clear()', () => {
      test('should clear all stored artifacts', async () => {
        await storage.save('run_1', 'input', '{}');
        await storage.save('run_2', 'input', '{}');

        storage.clear();

        expect(storage.size()).toBe(0);
      });
    });

    describe('size()', () => {
      test('should return correct count of stored artifacts', async () => {
        expect(storage.size()).toBe(0);

        await storage.save('run_1', 'input', '{}');
        expect(storage.size()).toBe(1);

        await storage.save('run_1', 'scrape', '{}');
        expect(storage.size()).toBe(2);
      });
    });

    describe('keys()', () => {
      test('should return all storage keys', async () => {
        await storage.save('run_1', 'input', '{}');
        await storage.save('run_2', 'brief', '{}');

        const keys = storage.keys();

        expect(keys).toContain('run_1/input');
        expect(keys).toContain('run_2/brief');
      });
    });
  });
});
