/**
 * Validator Module Unit Tests
 *
 * Tests the constraint validator against all hard constraints from
 * Implementation Spec Section 9.3:
 *
 * 1. executive_summary.top_opportunities = exactly 3 items
 * 2. artificial_intelligence_opportunities = exactly 3 items
 * 3. objections_and_rebuttals = exactly 3 items
 * 4. executive_summary.summary <= 600 characters
 * 5. opening_script <= 450 characters
 * 6. demonstration_plan.steps <= 6 items
 * 7. follow_up_emails.short_version.body <= 120 words
 * 8. follow_up_emails.warm_version.body <= 180 words
 * 9. Missing information must be explicitly "Not found"
 *
 * Evidence Rules (Section 9.4):
 * - meta.source_urls must be populated
 * - URLs must be valid format
 */

import {
  validateBrief,
  validateArrayLength,
  validateMaxLength,
  validateMaxWords,
  validateMaxItems,
  validateNotFoundFields,
  validateSourceUrls,
  countWords,
  CONSTRAINTS,
  type CanonicalDealPrepBrief,
  type ValidationResult,
  type AIOpportunity,
  type ObjectionRebuttal,
} from '../../src/validator/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a valid brief that passes all constraints
 */
function createValidBrief(): CanonicalDealPrepBrief {
  return {
    meta: {
      run_id: 'run_abc123',
      generated_at: '2026-01-17T10:00:00Z',
      trigger_source: 'inbound',
      organization_name: 'Test Nonprofit',
      organization_website: 'https://testnonprofit.org',
      organization_domain: 'testnonprofit.org',
      requester_name: 'John Doe',
      requester_title: 'Executive Director',
      source_urls: [
        'https://testnonprofit.org/',
        'https://testnonprofit.org/about',
      ],
    },
    executive_summary: {
      summary: 'A brief summary under 600 characters describing the organization and key opportunities.',
      top_opportunities: [
        'Opportunity 1',
        'Opportunity 2',
        'Opportunity 3',
      ],
    },
    organization_understanding: {
      mission: 'To help communities thrive through education and support.',
      programs: [
        { name: 'Program A', summary: 'Description of Program A' },
      ],
      audiences: ['Youth', 'Families', 'Educators'],
    },
    website_analysis: {
      overall_tone: 'Professional and welcoming',
      strengths: ['Clear navigation', 'Strong calls to action'],
      gaps: ['Mobile optimization needed'],
      volunteer_flow_observations: 'Easy to find volunteer page, but form is lengthy.',
      donation_flow_observations: 'Donation process is smooth with multiple options.',
    },
    leadership_and_staff: {
      executive_leader: {
        name: 'Jane Smith',
        role: 'CEO',
        summary: 'Experienced nonprofit leader with 15 years in the sector.',
      },
      other_staff_mentions: [
        { name: 'Bob Johnson', role: 'Program Director' },
      ],
    },
    requester_profile: {
      summary: 'John Doe has been leading the organization for 5 years.',
      conversation_angle: 'Focus on operational efficiency and volunteer management.',
    },
    artificial_intelligence_opportunities: [
      {
        title: 'AI Opportunity 1',
        why_it_matters: 'Will improve efficiency',
        demonstration_hook: 'Show chatbot demo',
      },
      {
        title: 'AI Opportunity 2',
        why_it_matters: 'Will increase engagement',
        demonstration_hook: 'Show FAQ automation',
      },
      {
        title: 'AI Opportunity 3',
        why_it_matters: 'Will reduce costs',
        demonstration_hook: 'Show volunteer matching',
      },
    ] as [AIOpportunity, AIOpportunity, AIOpportunity],
    demonstration_plan: {
      opening: 'Welcome to the demonstration.',
      steps: ['Step 1', 'Step 2', 'Step 3'],
      example_bot_responses: ['Response 1', 'Response 2'],
    },
    objections_and_rebuttals: [
      { objection: 'Too expensive', rebuttal: 'ROI demonstrates value' },
      { objection: 'Too complex', rebuttal: 'Simple implementation' },
      { objection: 'Staff resistance', rebuttal: 'Comprehensive training' },
    ] as [ObjectionRebuttal, ObjectionRebuttal, ObjectionRebuttal],
    opening_script: 'Hello, thank you for your time today. I am excited to discuss how AI can help your organization.',
    follow_up_emails: {
      short_version: {
        subject: 'Follow up on our conversation',
        body: 'Thank you for meeting with me today. As discussed, here are the key points we covered.',
      },
      warm_version: {
        subject: 'Great meeting today',
        body: 'It was a pleasure speaking with you today about your organization. I was impressed by your commitment to your mission and the impact you are having in the community. As we discussed, there are several opportunities where AI can help streamline your operations and improve engagement.',
      },
    },
  };
}

/**
 * Generate a string of specified word count
 */
function generateWords(count: number): string {
  const words = [];
  for (let i = 0; i < count; i++) {
    words.push(`word${i}`);
  }
  return words.join(' ');
}

/**
 * Generate a string of specified character count
 */
function generateChars(count: number): string {
  return 'x'.repeat(count);
}

// ============================================================================
// countWords utility tests
// ============================================================================

describe('countWords', () => {
  it('should count words correctly for normal text', () => {
    expect(countWords('hello world')).toBe(2);
    expect(countWords('one two three four five')).toBe(5);
  });

  it('should handle empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('should handle whitespace only', () => {
    expect(countWords('   ')).toBe(0);
    expect(countWords('\t\n')).toBe(0);
  });

  it('should handle leading/trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
  });

  it('should handle multiple spaces between words', () => {
    expect(countWords('hello    world')).toBe(2);
  });

  it('should handle single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('should handle non-string input', () => {
    expect(countWords(null as unknown as string)).toBe(0);
    expect(countWords(undefined as unknown as string)).toBe(0);
    expect(countWords(123 as unknown as string)).toBe(0);
  });
});

// ============================================================================
// validateArrayLength tests
// ============================================================================

describe('validateArrayLength', () => {
  it('should return null for array with exact expected length', () => {
    const result = validateArrayLength(['a', 'b', 'c'], 3, 'test.field');
    expect(result).toBeNull();
  });

  it('should return error for array with fewer items', () => {
    const result = validateArrayLength(['a', 'b'], 3, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.constraint).toBe('exactLength');
    expect(result?.actual).toBe(2);
    expect(result?.expected).toBe(3);
  });

  it('should return error for array with more items', () => {
    const result = validateArrayLength(['a', 'b', 'c', 'd'], 3, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.constraint).toBe('exactLength');
    expect(result?.actual).toBe(4);
    expect(result?.expected).toBe(3);
  });

  it('should return error for non-array input', () => {
    const result = validateArrayLength('not an array', 3, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.constraint).toBe('exactLength');
    expect(result?.actual).toBe('not an array');
  });

  it('should return error for null input', () => {
    const result = validateArrayLength(null, 3, 'test.field');
    expect(result).not.toBeNull();
  });

  it('should return error for undefined input', () => {
    const result = validateArrayLength(undefined, 3, 'test.field');
    expect(result).not.toBeNull();
  });

  it('should handle empty array correctly', () => {
    const result = validateArrayLength([], 0, 'test.field');
    expect(result).toBeNull();
  });
});

// ============================================================================
// validateMaxLength tests
// ============================================================================

describe('validateMaxLength', () => {
  it('should return null for string within limit', () => {
    const result = validateMaxLength('hello', 10, 'test.field');
    expect(result).toBeNull();
  });

  it('should return null for string at exact limit', () => {
    const result = validateMaxLength('hello', 5, 'test.field');
    expect(result).toBeNull();
  });

  it('should return error for string exceeding limit', () => {
    const result = validateMaxLength('hello world', 5, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.constraint).toBe('maxLength');
    expect(result?.actual).toBe(11);
    expect(result?.expected).toBe('<= 5 characters');
  });

  it('should return error for non-string input', () => {
    const result = validateMaxLength(123, 10, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.actual).toBe('not a string');
  });

  it('should handle empty string', () => {
    const result = validateMaxLength('', 10, 'test.field');
    expect(result).toBeNull();
  });

  it('should validate 600 character limit for executive summary', () => {
    // At limit
    const atLimit = validateMaxLength(
      generateChars(600),
      CONSTRAINTS.EXECUTIVE_SUMMARY_MAX_CHARS,
      'executive_summary.summary'
    );
    expect(atLimit).toBeNull();

    // Over limit
    const overLimit = validateMaxLength(
      generateChars(601),
      CONSTRAINTS.EXECUTIVE_SUMMARY_MAX_CHARS,
      'executive_summary.summary'
    );
    expect(overLimit).not.toBeNull();
    expect(overLimit?.actual).toBe(601);
  });

  it('should validate 450 character limit for opening script', () => {
    // At limit
    const atLimit = validateMaxLength(
      generateChars(450),
      CONSTRAINTS.OPENING_SCRIPT_MAX_CHARS,
      'opening_script'
    );
    expect(atLimit).toBeNull();

    // Over limit
    const overLimit = validateMaxLength(
      generateChars(451),
      CONSTRAINTS.OPENING_SCRIPT_MAX_CHARS,
      'opening_script'
    );
    expect(overLimit).not.toBeNull();
    expect(overLimit?.actual).toBe(451);
  });
});

// ============================================================================
// validateMaxWords tests
// ============================================================================

describe('validateMaxWords', () => {
  it('should return null for text within word limit', () => {
    const result = validateMaxWords('one two three', 5, 'test.field');
    expect(result).toBeNull();
  });

  it('should return null for text at exact word limit', () => {
    const result = validateMaxWords('one two three', 3, 'test.field');
    expect(result).toBeNull();
  });

  it('should return error for text exceeding word limit', () => {
    const result = validateMaxWords('one two three four five', 3, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.constraint).toBe('maxWords');
    expect(result?.actual).toBe(5);
    expect(result?.expected).toBe('<= 3 words');
  });

  it('should return error for non-string input', () => {
    const result = validateMaxWords(123, 10, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.actual).toBe('not a string');
  });

  it('should handle empty string', () => {
    const result = validateMaxWords('', 10, 'test.field');
    expect(result).toBeNull();
  });

  it('should validate 120 word limit for short email body', () => {
    // At limit
    const atLimit = validateMaxWords(
      generateWords(120),
      CONSTRAINTS.SHORT_EMAIL_BODY_MAX_WORDS,
      'follow_up_emails.short_version.body'
    );
    expect(atLimit).toBeNull();

    // Over limit
    const overLimit = validateMaxWords(
      generateWords(121),
      CONSTRAINTS.SHORT_EMAIL_BODY_MAX_WORDS,
      'follow_up_emails.short_version.body'
    );
    expect(overLimit).not.toBeNull();
    expect(overLimit?.actual).toBe(121);
  });

  it('should validate 180 word limit for warm email body', () => {
    // At limit
    const atLimit = validateMaxWords(
      generateWords(180),
      CONSTRAINTS.WARM_EMAIL_BODY_MAX_WORDS,
      'follow_up_emails.warm_version.body'
    );
    expect(atLimit).toBeNull();

    // Over limit
    const overLimit = validateMaxWords(
      generateWords(181),
      CONSTRAINTS.WARM_EMAIL_BODY_MAX_WORDS,
      'follow_up_emails.warm_version.body'
    );
    expect(overLimit).not.toBeNull();
    expect(overLimit?.actual).toBe(181);
  });
});

// ============================================================================
// validateMaxItems tests
// ============================================================================

describe('validateMaxItems', () => {
  it('should return null for array within limit', () => {
    const result = validateMaxItems(['a', 'b', 'c'], 5, 'test.field');
    expect(result).toBeNull();
  });

  it('should return null for array at exact limit', () => {
    const result = validateMaxItems(['a', 'b', 'c'], 3, 'test.field');
    expect(result).toBeNull();
  });

  it('should return error for array exceeding limit', () => {
    const result = validateMaxItems(['a', 'b', 'c', 'd'], 3, 'test.field');
    expect(result).not.toBeNull();
    expect(result?.constraint).toBe('maxItems');
    expect(result?.actual).toBe(4);
    expect(result?.expected).toBe('<= 3 items');
  });

  it('should validate 6 step limit for demonstration plan', () => {
    // At limit
    const atLimit = validateMaxItems(
      ['1', '2', '3', '4', '5', '6'],
      CONSTRAINTS.DEMONSTRATION_STEPS_MAX,
      'demonstration_plan.steps'
    );
    expect(atLimit).toBeNull();

    // Over limit
    const overLimit = validateMaxItems(
      ['1', '2', '3', '4', '5', '6', '7'],
      CONSTRAINTS.DEMONSTRATION_STEPS_MAX,
      'demonstration_plan.steps'
    );
    expect(overLimit).not.toBeNull();
    expect(overLimit?.actual).toBe(7);
  });
});

// ============================================================================
// validateNotFoundFields tests
// ============================================================================

describe('validateNotFoundFields', () => {
  it('should return no errors for brief with all fields populated', () => {
    const brief = createValidBrief();
    const errors = validateNotFoundFields(brief);
    expect(errors).toHaveLength(0);
  });

  it('should return error for null meta.organization_name', () => {
    const brief = createValidBrief();
    (brief.meta as Record<string, unknown>).organization_name = null;
    const errors = validateNotFoundFields(brief);
    const error = errors.find(e => e.field === 'meta.organization_name');
    expect(error).toBeDefined();
    expect(error?.constraint).toBe('notFound');
    expect(error?.actual).toBe('null');
  });

  it('should return error for empty string meta.organization_name', () => {
    const brief = createValidBrief();
    brief.meta.organization_name = '';
    const errors = validateNotFoundFields(brief);
    const error = errors.find(e => e.field === 'meta.organization_name');
    expect(error).toBeDefined();
    expect(error?.actual).toBe('empty string');
  });

  it('should accept "Not found" as valid value', () => {
    const brief = createValidBrief();
    brief.meta.organization_name = 'Not found';
    brief.meta.requester_title = 'Not found';
    const errors = validateNotFoundFields(brief);
    expect(errors.find(e => e.field === 'meta.organization_name')).toBeUndefined();
    expect(errors.find(e => e.field === 'meta.requester_title')).toBeUndefined();
  });

  it('should validate all "not found" eligible fields', () => {
    const brief = createValidBrief();
    // Set all checked fields to empty string
    brief.meta.organization_name = '';
    brief.meta.organization_website = '';
    brief.meta.organization_domain = '';
    brief.meta.requester_name = '';
    brief.meta.requester_title = '';
    brief.organization_understanding.mission = '';
    brief.website_analysis.overall_tone = '';
    brief.website_analysis.volunteer_flow_observations = '';
    brief.website_analysis.donation_flow_observations = '';
    brief.leadership_and_staff.executive_leader.name = '';
    brief.leadership_and_staff.executive_leader.role = '';
    brief.leadership_and_staff.executive_leader.summary = '';
    brief.requester_profile.summary = '';
    brief.requester_profile.conversation_angle = '';

    const errors = validateNotFoundFields(brief);
    expect(errors.length).toBe(14);
  });

  it('should support custom not found marker', () => {
    const brief = createValidBrief();
    brief.meta.organization_name = '';
    const errors = validateNotFoundFields(brief, { notFoundMarker: 'N/A' });
    const error = errors.find(e => e.field === 'meta.organization_name');
    expect(error?.expected).toBe('N/A');
  });
});

// ============================================================================
// validateSourceUrls tests
// ============================================================================

describe('validateSourceUrls', () => {
  it('should return no errors for valid source URLs', () => {
    const brief = createValidBrief();
    const errors = validateSourceUrls(brief);
    expect(errors).toHaveLength(0);
  });

  it('should return error when source_urls is undefined', () => {
    const brief = createValidBrief();
    (brief.meta as Record<string, unknown>).source_urls = undefined;
    const errors = validateSourceUrls(brief);
    expect(errors.length).toBe(1);
    expect(errors[0]?.constraint).toBe('required');
  });

  it('should return error when source_urls is not an array', () => {
    const brief = createValidBrief();
    (brief.meta as Record<string, unknown>).source_urls = 'not an array';
    const errors = validateSourceUrls(brief);
    expect(errors.length).toBe(1);
    expect(errors[0]?.constraint).toBe('type');
  });

  it('should return error when source_urls is empty', () => {
    const brief = createValidBrief();
    brief.meta.source_urls = [];
    const errors = validateSourceUrls(brief);
    expect(errors.length).toBe(1);
    expect(errors[0]?.constraint).toBe('minItems');
  });

  it('should return error for invalid URL format', () => {
    const brief = createValidBrief();
    brief.meta.source_urls = ['https://valid.com', 'not-a-url'];
    const errors = validateSourceUrls(brief);
    expect(errors.length).toBe(1);
    expect(errors[0]?.constraint).toBe('urlFormat');
    expect(errors[0]?.field).toBe('meta.source_urls[1]');
  });

  it('should return error for ftp:// URLs', () => {
    const brief = createValidBrief();
    brief.meta.source_urls = ['ftp://files.example.com'];
    const errors = validateSourceUrls(brief);
    expect(errors.length).toBe(1);
    expect(errors[0]?.constraint).toBe('urlFormat');
  });

  it('should accept http:// URLs', () => {
    const brief = createValidBrief();
    brief.meta.source_urls = ['http://example.com'];
    const errors = validateSourceUrls(brief);
    expect(errors).toHaveLength(0);
  });

  it('should return error for non-string URL', () => {
    const brief = createValidBrief();
    (brief.meta.source_urls as unknown[]) = [123];
    const errors = validateSourceUrls(brief);
    expect(errors.length).toBe(1);
    expect(errors[0]?.constraint).toBe('type');
  });

  it('should validate multiple invalid URLs', () => {
    const brief = createValidBrief();
    brief.meta.source_urls = ['invalid1', 'invalid2', 'https://valid.com'];
    const errors = validateSourceUrls(brief);
    expect(errors.length).toBe(2);
  });
});

// ============================================================================
// validateBrief integration tests
// ============================================================================

describe('validateBrief', () => {
  describe('valid brief', () => {
    it('should return valid: true for a valid brief', () => {
      const brief = createValidBrief();
      const result = validateBrief(brief);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle briefs at exact constraint limits', () => {
      const brief = createValidBrief();
      // Set values at exact limits
      brief.executive_summary.summary = generateChars(600);
      brief.opening_script = generateChars(450);
      brief.demonstration_plan.steps = ['1', '2', '3', '4', '5', '6'];
      brief.follow_up_emails.short_version.body = generateWords(120);
      brief.follow_up_emails.warm_version.body = generateWords(180);

      const result = validateBrief(brief);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid brief - null/undefined', () => {
    it('should return error for null brief', () => {
      const result = validateBrief(null as unknown as CanonicalDealPrepBrief);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.constraint).toBe('required');
    });

    it('should return error for undefined brief', () => {
      const result = validateBrief(undefined as unknown as CanonicalDealPrepBrief);
      expect(result.valid).toBe(false);
    });
  });

  describe('Constraint 1: top_opportunities exactly 3', () => {
    it('should fail with 2 opportunities', () => {
      const brief = createValidBrief();
      (brief.executive_summary.top_opportunities as string[]) = ['a', 'b'];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'executive_summary.top_opportunities');
      expect(error).toBeDefined();
      expect(error?.actual).toBe(2);
    });

    it('should fail with 4 opportunities', () => {
      const brief = createValidBrief();
      (brief.executive_summary.top_opportunities as string[]) = ['a', 'b', 'c', 'd'];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'executive_summary.top_opportunities');
      expect(error).toBeDefined();
      expect(error?.actual).toBe(4);
    });
  });

  describe('Constraint 2: ai_opportunities exactly 3', () => {
    it('should fail with 2 AI opportunities', () => {
      const brief = createValidBrief();
      (brief.artificial_intelligence_opportunities as AIOpportunity[]) = [
        { title: 'a', why_it_matters: 'b', demonstration_hook: 'c' },
        { title: 'd', why_it_matters: 'e', demonstration_hook: 'f' },
      ];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'artificial_intelligence_opportunities');
      expect(error).toBeDefined();
    });

    it('should fail with 0 AI opportunities', () => {
      const brief = createValidBrief();
      (brief.artificial_intelligence_opportunities as AIOpportunity[]) = [];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
    });
  });

  describe('Constraint 3: objections_and_rebuttals exactly 3', () => {
    it('should fail with 1 objection', () => {
      const brief = createValidBrief();
      (brief.objections_and_rebuttals as ObjectionRebuttal[]) = [
        { objection: 'a', rebuttal: 'b' },
      ];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'objections_and_rebuttals');
      expect(error).toBeDefined();
    });
  });

  describe('Constraint 4: executive_summary.summary <= 600 chars', () => {
    it('should fail with 601 characters', () => {
      const brief = createValidBrief();
      brief.executive_summary.summary = generateChars(601);
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'executive_summary.summary');
      expect(error).toBeDefined();
      expect(error?.actual).toBe(601);
    });
  });

  describe('Constraint 5: opening_script <= 450 chars', () => {
    it('should fail with 451 characters', () => {
      const brief = createValidBrief();
      brief.opening_script = generateChars(451);
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'opening_script');
      expect(error).toBeDefined();
      expect(error?.actual).toBe(451);
    });
  });

  describe('Constraint 6: demonstration_plan.steps <= 6 items', () => {
    it('should pass with 6 steps', () => {
      const brief = createValidBrief();
      brief.demonstration_plan.steps = ['1', '2', '3', '4', '5', '6'];
      const result = validateBrief(brief);
      const error = result.errors.find(e => e.field === 'demonstration_plan.steps');
      expect(error).toBeUndefined();
    });

    it('should fail with 7 steps', () => {
      const brief = createValidBrief();
      brief.demonstration_plan.steps = ['1', '2', '3', '4', '5', '6', '7'];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'demonstration_plan.steps');
      expect(error).toBeDefined();
      expect(error?.actual).toBe(7);
    });
  });

  describe('Constraint 7: short_email.body <= 120 words', () => {
    it('should fail with 121 words', () => {
      const brief = createValidBrief();
      brief.follow_up_emails.short_version.body = generateWords(121);
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'follow_up_emails.short_version.body');
      expect(error).toBeDefined();
      expect(error?.actual).toBe(121);
    });
  });

  describe('Constraint 8: warm_email.body <= 180 words', () => {
    it('should fail with 181 words', () => {
      const brief = createValidBrief();
      brief.follow_up_emails.warm_version.body = generateWords(181);
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'follow_up_emails.warm_version.body');
      expect(error).toBeDefined();
      expect(error?.actual).toBe(181);
    });
  });

  describe('Constraint 9: Not found fields', () => {
    it('should fail when fields are empty instead of "Not found"', () => {
      const brief = createValidBrief();
      brief.meta.organization_name = '';
      brief.requester_profile.summary = '';
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.find(e => e.field === 'meta.organization_name')).toBeDefined();
      expect(result.errors.find(e => e.field === 'requester_profile.summary')).toBeDefined();
    });

    it('should pass when fields use "Not found"', () => {
      const brief = createValidBrief();
      brief.meta.requester_title = 'Not found';
      brief.leadership_and_staff.executive_leader.summary = 'Not found';
      const result = validateBrief(brief);
      expect(result.errors.find(e => e.field === 'meta.requester_title')).toBeUndefined();
    });
  });

  describe('Evidence rules: source URLs', () => {
    it('should fail when source_urls is empty', () => {
      const brief = createValidBrief();
      brief.meta.source_urls = [];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      const error = result.errors.find(e => e.field === 'meta.source_urls');
      expect(error).toBeDefined();
    });

    it('should fail when source_urls contains invalid URLs', () => {
      const brief = createValidBrief();
      brief.meta.source_urls = ['https://valid.com', 'invalid'];
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
    });

    it('should allow skipping source validation', () => {
      const brief = createValidBrief();
      brief.meta.source_urls = [];
      const result = validateBrief(brief, { skipSourceValidation: true });
      // Should still fail for other reasons but not source URLs
      const sourceError = result.errors.find(e => e.field.includes('source_urls'));
      expect(sourceError).toBeUndefined();
    });
  });

  describe('multiple errors', () => {
    it('should collect all errors in a single validation', () => {
      const brief = createValidBrief();
      // Violate multiple constraints
      (brief.executive_summary.top_opportunities as string[]) = ['a']; // Only 1
      brief.executive_summary.summary = generateChars(700); // Over 600
      brief.opening_script = generateChars(500); // Over 450
      brief.demonstration_plan.steps = ['1', '2', '3', '4', '5', '6', '7', '8']; // Over 6
      brief.follow_up_emails.short_version.body = generateWords(150); // Over 120
      brief.meta.source_urls = [];

      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(5);
    });
  });

  describe('edge cases', () => {
    it('should handle missing nested objects gracefully', () => {
      const brief = {} as CanonicalDealPrepBrief;
      const result = validateBrief(brief);
      expect(result.valid).toBe(false);
      // Should have errors but not throw
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle partial brief structures', () => {
      const partialBrief = {
        meta: {
          run_id: 'test',
          source_urls: ['https://example.com'],
        },
      } as CanonicalDealPrepBrief;

      const result = validateBrief(partialBrief);
      expect(result.valid).toBe(false);
      // Should report missing required fields
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// CONSTRAINTS constant tests
// ============================================================================

describe('CONSTRAINTS', () => {
  it('should have correct values from Section 9.3', () => {
    expect(CONSTRAINTS.TOP_OPPORTUNITIES_COUNT).toBe(3);
    expect(CONSTRAINTS.AI_OPPORTUNITIES_COUNT).toBe(3);
    expect(CONSTRAINTS.OBJECTIONS_REBUTTALS_COUNT).toBe(3);
    expect(CONSTRAINTS.EXECUTIVE_SUMMARY_MAX_CHARS).toBe(600);
    expect(CONSTRAINTS.OPENING_SCRIPT_MAX_CHARS).toBe(450);
    expect(CONSTRAINTS.DEMONSTRATION_STEPS_MAX).toBe(6);
    expect(CONSTRAINTS.SHORT_EMAIL_BODY_MAX_WORDS).toBe(120);
    expect(CONSTRAINTS.WARM_EMAIL_BODY_MAX_WORDS).toBe(180);
  });
});
