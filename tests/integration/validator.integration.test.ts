/**
 * Validator Integration Tests
 *
 * Tests the validator with realistic brief data and fixture files.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  validateBrief,
  type CanonicalDealPrepBrief,
} from '../../src/validator/index.js';

describe('Validator Integration Tests', () => {
  let validBrief: CanonicalDealPrepBrief;

  beforeAll(async () => {
    const fixturePath = join(
      process.cwd(),
      'tests/fixtures/valid-canonical-brief.json'
    );
    const content = await readFile(fixturePath, 'utf-8');
    validBrief = JSON.parse(content) as CanonicalDealPrepBrief;
  });

  describe('fixture validation', () => {
    it('should validate the canonical brief fixture successfully', () => {
      const result = validateBrief(validBrief);

      if (!result.valid) {
        console.log('Validation errors:', JSON.stringify(result.errors, null, 2));
      }

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass all hard constraints from Section 9.3', () => {
      const result = validateBrief(validBrief);

      // Verify no constraint violations
      expect(result.errors.filter(e => e.constraint === 'exactLength')).toHaveLength(0);
      expect(result.errors.filter(e => e.constraint === 'maxLength')).toHaveLength(0);
      expect(result.errors.filter(e => e.constraint === 'maxWords')).toHaveLength(0);
      expect(result.errors.filter(e => e.constraint === 'maxItems')).toHaveLength(0);
      expect(result.errors.filter(e => e.constraint === 'notFound')).toHaveLength(0);
    });

    it('should pass evidence rules from Section 9.4', () => {
      const result = validateBrief(validBrief);

      // Verify source URL validation passed
      expect(result.errors.filter(e => e.field.includes('source_urls'))).toHaveLength(0);
    });
  });

  describe('constraint boundary testing with fixture', () => {
    it('should fail if executive_summary exceeds 600 characters', () => {
      const modified = JSON.parse(JSON.stringify(validBrief)) as CanonicalDealPrepBrief;
      modified.executive_summary.summary = 'x'.repeat(601);

      const result = validateBrief(modified);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.field === 'executive_summary.summary' &&
        e.constraint === 'maxLength'
      )).toBe(true);
    });

    it('should fail if opening_script exceeds 450 characters', () => {
      const modified = JSON.parse(JSON.stringify(validBrief)) as CanonicalDealPrepBrief;
      modified.opening_script = 'x'.repeat(451);

      const result = validateBrief(modified);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.field === 'opening_script' &&
        e.constraint === 'maxLength'
      )).toBe(true);
    });

    it('should fail if short email body exceeds 120 words', () => {
      const modified = JSON.parse(JSON.stringify(validBrief)) as CanonicalDealPrepBrief;
      modified.follow_up_emails.short_version.body = Array(121).fill('word').join(' ');

      const result = validateBrief(modified);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.field === 'follow_up_emails.short_version.body' &&
        e.constraint === 'maxWords'
      )).toBe(true);
    });

    it('should fail if warm email body exceeds 180 words', () => {
      const modified = JSON.parse(JSON.stringify(validBrief)) as CanonicalDealPrepBrief;
      modified.follow_up_emails.warm_version.body = Array(181).fill('word').join(' ');

      const result = validateBrief(modified);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.field === 'follow_up_emails.warm_version.body' &&
        e.constraint === 'maxWords'
      )).toBe(true);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle brief with "Not found" values correctly', () => {
      const modified = JSON.parse(JSON.stringify(validBrief)) as CanonicalDealPrepBrief;
      modified.meta.requester_title = 'Not found';
      modified.leadership_and_staff.executive_leader.summary = 'Not found';

      const result = validateBrief(modified);
      expect(result.valid).toBe(true);
    });

    it('should detect multiple violations in a corrupt brief', () => {
      const corruptBrief = JSON.parse(JSON.stringify(validBrief)) as CanonicalDealPrepBrief;

      // Introduce multiple violations
      (corruptBrief.executive_summary.top_opportunities as string[]) = ['only one'];
      (corruptBrief.artificial_intelligence_opportunities as unknown[]) = [];
      corruptBrief.opening_script = 'x'.repeat(500);
      corruptBrief.meta.source_urls = [];

      const result = validateBrief(corruptBrief);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('should allow skipping source validation for testing', () => {
      const modified = JSON.parse(JSON.stringify(validBrief)) as CanonicalDealPrepBrief;
      modified.meta.source_urls = [];

      const result = validateBrief(modified, { skipSourceValidation: true });

      // Should not have source URL errors
      const sourceErrors = result.errors.filter(e => e.field.includes('source_urls'));
      expect(sourceErrors).toHaveLength(0);
    });
  });
});
