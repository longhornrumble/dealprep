/**
 * Unit tests for the Normalizer Module
 * Tests input canonicalization per Implementation Spec Section 4
 */

import { describe, test, expect } from '@jest/globals';
import {
  normalize,
  validateInput,
  deriveOrganizationIdentifier,
  extractDomain,
  normalizeUrl,
  normalizeEmail,
  trimString,
  type CanonicalInput,
} from '../../src/normalizer/index.js';

describe('Normalizer Module', () => {
  describe('normalize()', () => {
    test('should successfully normalize valid inbound trigger input', () => {
      const rawInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
        },
        organization: {
          name: '  Acme Corp  ',
          website: 'www.acme.com',
        },
        contact: {
          full_name: '  John Smith  ',
          email: '  JOHN@ACME.COM  ',
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.organization.name).toBe('Acme Corp');
      expect(result.data!.organization.website).toBe('https://www.acme.com/');
      expect(result.data!.organization.domain).toBe('acme.com');
      expect(result.data!.contact.full_name).toBe('John Smith');
      expect(result.data!.contact.email).toBe('john@acme.com');
      expect(result.data!.meta.trigger_source).toBe('inbound');
    });

    test('should normalize outbound trigger input', () => {
      const rawInput = {
        meta: {
          trigger_source: 'outbound',
          submitted_at: '2024-01-15T10:30:00Z',
        },
        organization: {
          website: 'https://example.org/about/',
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(true);
      expect(result.data!.organization.website).toBe('https://example.org/about');
      expect(result.data!.organization.domain).toBe('example.org');
    });

    test('should fail when both organization.name and organization.website are missing', () => {
      const rawInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
        },
        organization: {},
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ORGANIZATION_REQUIRED');
    });

    test('should fail when meta.trigger_source is missing', () => {
      const rawInput = {
        meta: {
          submitted_at: '2024-01-15T10:30:00Z',
        },
        organization: {
          name: 'Test Corp',
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    test('should fail when meta.submitted_at is missing', () => {
      const rawInput = {
        meta: {
          trigger_source: 'inbound',
        },
        organization: {
          name: 'Test Corp',
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    test('should parse unambiguous two-part names', () => {
      const rawInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
        },
        organization: {
          name: 'Test Corp',
        },
        contact: {
          full_name: 'Jane Doe',
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(true);
      expect(result.data!.contact.first_name).toBe('Jane');
      expect(result.data!.contact.last_name).toBe('Doe');
    });

    test('should NOT parse ambiguous multi-part names', () => {
      const rawInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
        },
        organization: {
          name: 'Test Corp',
        },
        contact: {
          full_name: 'Dr. Jane Marie Doe Jr.',
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(true);
      expect(result.data!.contact.full_name).toBe('Dr. Jane Marie Doe Jr.');
      expect(result.data!.contact.first_name).toBeNull();
      expect(result.data!.contact.last_name).toBeNull();
    });

    test('should normalize email_cc array', () => {
      const rawInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
        },
        organization: {
          name: 'Test Corp',
        },
        routing: {
          email_cc: ['  USER1@TEST.COM  ', 'user2@test.com', '  '],
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(true);
      expect(result.data!.routing.email_cc).toEqual(['user1@test.com', 'user2@test.com']);
    });

    test('should handle meeting time normalization', () => {
      const rawInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
          requested_meeting_at: '2024-01-20T14:00:00-05:00',
        },
        organization: {
          name: 'Test Corp',
        },
      };

      const result = normalize(rawInput);

      expect(result.success).toBe(true);
      expect(result.data!.meta.requested_meeting_at).toBe('2024-01-20T19:00:00.000Z');
    });
  });

  describe('validateInput()', () => {
    test('should pass validation for valid canonical input', () => {
      const input: CanonicalInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
          run_id: 'run_abc123',
          requested_meeting_at: null,
          timezone: null,
        },
        organization: {
          name: 'Test Corp',
          website: 'https://test.com',
          domain: 'test.com',
        },
        contact: {
          full_name: null,
          first_name: null,
          last_name: null,
          title: null,
          email: null,
          phone: null,
          linkedin_url: null,
        },
        notes: {
          comments: null,
          intent_topic: null,
          source_context: null,
        },
        routing: {
          crm_target: null,
          email_to: null,
          email_cc: [],
          motion_workspace: null,
        },
      };

      const result = validateInput(input);

      expect(result.success).toBe(true);
      expect(result.data!.valid).toBe(true);
      expect(result.data!.errors).toHaveLength(0);
    });

    test('should fail validation when website present but domain missing', () => {
      const input: CanonicalInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
          run_id: '',
          requested_meeting_at: null,
          timezone: null,
        },
        organization: {
          name: null,
          website: 'https://test.com',
          domain: null, // Should be derived from website
        },
        contact: {
          full_name: null,
          first_name: null,
          last_name: null,
          title: null,
          email: null,
          phone: null,
          linkedin_url: null,
        },
        notes: {
          comments: null,
          intent_topic: null,
          source_context: null,
        },
        routing: {
          crm_target: null,
          email_to: null,
          email_cc: [],
          motion_workspace: null,
        },
      };

      const result = validateInput(input);

      expect(result.success).toBe(true);
      expect(result.data!.valid).toBe(false);
      expect(result.data!.errors).toContain('organization.domain must be derived when organization.website is present');
    });
  });

  describe('deriveOrganizationIdentifier()', () => {
    test('should prefer domain over website over name', () => {
      const input: CanonicalInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
          run_id: '',
          requested_meeting_at: null,
          timezone: null,
        },
        organization: {
          name: 'Test Corp',
          website: 'https://test.com',
          domain: 'testdomain.com',
        },
        contact: {
          full_name: null,
          first_name: null,
          last_name: null,
          title: null,
          email: null,
          phone: null,
          linkedin_url: null,
        },
        notes: {
          comments: null,
          intent_topic: null,
          source_context: null,
        },
        routing: {
          crm_target: null,
          email_to: null,
          email_cc: [],
          motion_workspace: null,
        },
      };

      const identifier = deriveOrganizationIdentifier(input);
      expect(identifier).toBe('testdomain.com');
    });

    test('should fall back to website domain when domain is null', () => {
      const input: CanonicalInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
          run_id: '',
          requested_meeting_at: null,
          timezone: null,
        },
        organization: {
          name: 'Test Corp',
          website: 'https://website.org',
          domain: null,
        },
        contact: {
          full_name: null,
          first_name: null,
          last_name: null,
          title: null,
          email: null,
          phone: null,
          linkedin_url: null,
        },
        notes: {
          comments: null,
          intent_topic: null,
          source_context: null,
        },
        routing: {
          crm_target: null,
          email_to: null,
          email_cc: [],
          motion_workspace: null,
        },
      };

      const identifier = deriveOrganizationIdentifier(input);
      expect(identifier).toBe('website.org');
    });

    test('should fall back to normalized name when website is null', () => {
      const input: CanonicalInput = {
        meta: {
          trigger_source: 'inbound',
          submitted_at: '2024-01-15T10:30:00Z',
          run_id: '',
          requested_meeting_at: null,
          timezone: null,
        },
        organization: {
          name: 'Test Corp Inc',
          website: null,
          domain: null,
        },
        contact: {
          full_name: null,
          first_name: null,
          last_name: null,
          title: null,
          email: null,
          phone: null,
          linkedin_url: null,
        },
        notes: {
          comments: null,
          intent_topic: null,
          source_context: null,
        },
        routing: {
          crm_target: null,
          email_to: null,
          email_cc: [],
          motion_workspace: null,
        },
      };

      const identifier = deriveOrganizationIdentifier(input);
      expect(identifier).toBe('test_corp_inc');
    });
  });

  describe('Utility functions', () => {
    describe('trimString()', () => {
      test('should trim whitespace', () => {
        expect(trimString('  hello  ')).toBe('hello');
      });

      test('should return null for empty string', () => {
        expect(trimString('   ')).toBeNull();
      });

      test('should return null for null/undefined', () => {
        expect(trimString(null)).toBeNull();
        expect(trimString(undefined)).toBeNull();
      });
    });

    describe('normalizeEmail()', () => {
      test('should lowercase email', () => {
        expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
      });

      test('should trim and lowercase', () => {
        expect(normalizeEmail('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
      });
    });

    describe('normalizeUrl()', () => {
      test('should add https scheme when missing', () => {
        expect(normalizeUrl('example.com')).toBe('https://example.com/');
      });

      test('should preserve http scheme', () => {
        expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
      });

      test('should remove trailing slashes from paths', () => {
        expect(normalizeUrl('https://example.com/about/')).toBe('https://example.com/about');
      });
    });

    describe('extractDomain()', () => {
      test('should extract domain from URL', () => {
        expect(extractDomain('https://www.example.com/page')).toBe('example.com');
      });

      test('should remove www prefix', () => {
        expect(extractDomain('www.example.com')).toBe('example.com');
      });

      test('should handle subdomains', () => {
        expect(extractDomain('https://blog.example.com')).toBe('blog.example.com');
      });
    });
  });
});
