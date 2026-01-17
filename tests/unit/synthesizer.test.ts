/**
 * Unit Tests for Synthesizer Module
 *
 * Tests the LLM synthesis functionality per Implementation Spec Sections 8 and 9
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  buildPrompt,
  parseBriefResponse,
  calculateConfidence,
  validateWordCounts,
  DealPrepBriefSchema,
  type SynthesisContext,
  type DealPrepBrief,
  type EnrichmentOutput,
} from '../../src/synthesizer/index.js';
import type { CanonicalInput } from '../../src/normalizer/index.js';
import type { ScrapeOutput } from '../../src/scraper/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockCanonicalInput: CanonicalInput = {
  meta: {
    trigger_source: 'inbound',
    submitted_at: '2024-01-15T10:30:00.000Z',
    run_id: 'run_test123',
    requested_meeting_at: null,
    timezone: 'America/New_York',
  },
  organization: {
    name: 'Hope Foundation',
    website: 'https://hopefoundation.org',
    domain: 'hopefoundation.org',
  },
  contact: {
    full_name: 'Jane Smith',
    first_name: 'Jane',
    last_name: 'Smith',
    title: 'Executive Director',
    email: 'jane@hopefoundation.org',
    phone: '555-123-4567',
    linkedin_url: 'https://linkedin.com/in/janesmith',
  },
  notes: {
    comments: 'Interested in AI chatbot for volunteer coordination',
    intent_topic: 'Volunteer management',
    source_context: 'Website inquiry form',
  },
  routing: {
    crm_target: 'salesforce',
    email_to: 'sales@myrecruiter.ai',
    email_cc: [],
    motion_workspace: 'deals',
  },
};

const mockScrapeOutput: ScrapeOutput = {
  scrape_meta: {
    started_at: '2024-01-15T10:31:00.000Z',
    completed_at: '2024-01-15T10:32:00.000Z',
    source_domain: 'hopefoundation.org',
    tool: 'firecrawl',
    pages_fetched: 5,
  },
  pages: [
    {
      url: 'https://hopefoundation.org/',
      final_url: 'https://hopefoundation.org/',
      page_type: 'home',
      title: 'Hope Foundation - Building Tomorrow Together',
      extracted_markdown:
        '# Welcome to Hope Foundation\n\nWe are dedicated to building stronger communities.',
      ctas: ['Donate Now', 'Volunteer', 'Learn More'],
      people_mentions: [],
    },
    {
      url: 'https://hopefoundation.org/about',
      final_url: 'https://hopefoundation.org/about',
      page_type: 'about',
      title: 'About Us - Hope Foundation',
      extracted_markdown:
        '## Our Mission\n\nTo empower underserved communities through education and support.',
      ctas: ['Get Involved'],
      people_mentions: [
        { name: 'John Doe', role: 'CEO' },
        { name: 'Jane Smith', role: 'Executive Director' },
      ],
    },
    {
      url: 'https://hopefoundation.org/programs',
      final_url: 'https://hopefoundation.org/programs',
      page_type: 'programs',
      title: 'Our Programs - Hope Foundation',
      extracted_markdown:
        '## Youth Education\n\nAfter-school programs for K-12 students.\n\n## Food Bank\n\nWeekly food distribution.',
      ctas: ['Enroll', 'Volunteer'],
      people_mentions: [],
    },
    {
      url: 'https://hopefoundation.org/volunteer',
      final_url: 'https://hopefoundation.org/volunteer',
      page_type: 'volunteer',
      title: 'Volunteer - Hope Foundation',
      extracted_markdown: '## Join Our Team\n\nWe need volunteers for various programs.',
      ctas: ['Apply Now'],
      people_mentions: [],
    },
    {
      url: 'https://hopefoundation.org/donate',
      final_url: 'https://hopefoundation.org/donate',
      page_type: 'donate',
      title: 'Donate - Hope Foundation',
      extracted_markdown: '## Support Our Mission\n\nYour donation helps us serve the community.',
      ctas: ['Donate'],
      people_mentions: [],
    },
  ],
  errors: [],
};

const mockEnrichmentOutput: EnrichmentOutput = {
  requester_profile: {
    summary:
      'Jane Smith is an experienced nonprofit leader with 15 years in community development.',
    confidence: 'high',
  },
  errors: [],
};

const mockContext: SynthesisContext = {
  runId: 'run_test123',
  canonicalInput: mockCanonicalInput,
  websiteScrape: mockScrapeOutput,
  enrichmentOutput: mockEnrichmentOutput,
  generatedAt: '2024-01-15T10:33:00.000Z',
};

const validBriefJson: DealPrepBrief = {
  meta: {
    run_id: 'run_test123',
    generated_at: '2024-01-15T10:33:00.000Z',
    trigger_source: 'inbound',
    organization_name: 'Hope Foundation',
    organization_website: 'https://hopefoundation.org',
    organization_domain: 'hopefoundation.org',
    requester_name: 'Jane Smith',
    requester_title: 'Executive Director',
    source_urls: [
      'https://hopefoundation.org/',
      'https://hopefoundation.org/about',
      'https://hopefoundation.org/programs',
    ],
  },
  executive_summary: {
    summary:
      'Hope Foundation is a community-focused nonprofit dedicated to education and support for underserved populations. Their website shows active volunteer and donation programs, making them an ideal candidate for AI chatbot solutions.',
    top_opportunities: [
      'Automate volunteer inquiry responses',
      'Streamline donation process questions',
      'Provide 24/7 program information',
    ],
  },
  organization_understanding: {
    mission: 'To empower underserved communities through education and support.',
    programs: [
      { name: 'Youth Education', summary: 'After-school programs for K-12 students' },
      { name: 'Food Bank', summary: 'Weekly food distribution to community members' },
    ],
    audiences: ['Underserved families', 'K-12 students', 'Community members in need'],
  },
  website_analysis: {
    overall_tone: 'Warm and community-focused with clear calls to action',
    strengths: [
      'Clear mission statement',
      'Easy navigation',
      'Multiple ways to get involved',
    ],
    gaps: [
      'No FAQ section identified',
      'Limited program details',
      'No chatbot or live support',
    ],
    volunteer_flow_observations:
      'Clear volunteer page with application CTA, but no real-time response capability.',
    donation_flow_observations:
      'Donation page present with straightforward process.',
  },
  leadership_and_staff: {
    executive_leader: {
      name: 'John Doe',
      role: 'CEO',
      summary: 'Leads the organization with focus on community impact.',
    },
    other_staff_mentions: [{ name: 'Jane Smith', role: 'Executive Director' }],
  },
  requester_profile: {
    summary:
      'Jane Smith is an experienced nonprofit leader with 15 years in community development.',
    conversation_angle:
      'Focus on how AI can extend her team capacity and improve volunteer coordination.',
  },
  artificial_intelligence_opportunities: [
    {
      title: '24/7 Volunteer Inquiry Response',
      why_it_matters:
        'Volunteer inquiries often come outside business hours, missing potential helpers.',
      demonstration_hook:
        'Show how a volunteer at 10 PM can get instant answers about orientation schedules.',
    },
    {
      title: 'Automated Donation FAQ',
      why_it_matters: 'Donors have questions about tax deductions and recurring giving.',
      demonstration_hook:
        'Demonstrate answering common donation questions instantly.',
    },
    {
      title: 'Program Information Assistant',
      why_it_matters:
        'Parents and community members need quick access to program details and schedules.',
      demonstration_hook:
        'Show chatbot providing youth education enrollment information.',
    },
  ],
  demonstration_plan: {
    opening:
      'Let me show you how Hope Foundation could engage with visitors around the clock.',
    steps: [
      'Navigate to your volunteer page',
      'Trigger sample volunteer inquiry',
      'Show instant AI response with personalized information',
      'Demonstrate handoff to human for complex cases',
    ],
    example_bot_responses: [
      'Welcome! I would be happy to help you learn about volunteering at Hope Foundation. Our next orientation is on Saturday at 10 AM.',
      'Great question! Your donation is 100% tax-deductible. Would you like me to send you a receipt?',
    ],
  },
  objections_and_rebuttals: [
    {
      objection: 'We do not have the budget for AI technology.',
      rebuttal:
        'Our solution starts at a price point designed for nonprofits, and the time savings typically pay for itself within 3 months.',
    },
    {
      objection: 'Our volunteers prefer human interaction.',
      rebuttal:
        'The chatbot handles routine questions so your team can focus on meaningful personal connections.',
    },
    {
      objection: 'We are not technical enough to manage this.',
      rebuttal:
        'We provide full setup and ongoing support. Your team just reviews and approves responses.',
    },
  ],
  opening_script:
    'Hi Jane, thanks for connecting! I noticed Hope Foundation has an impressive volunteer program. I am curious - how does your team currently handle volunteer inquiries that come in after hours?',
  follow_up_emails: {
    short_version: {
      subject: 'Quick follow-up - Hope Foundation AI chatbot',
      body: 'Hi Jane, Thanks for your time today. As discussed, our AI chatbot can help Hope Foundation engage volunteers 24/7. I will send over a proposal this week. Best, Chris',
    },
    warm_version: {
      subject: 'Great connecting - next steps for Hope Foundation',
      body: 'Hi Jane, It was wonderful learning about Hope Foundation\'s mission to empower underserved communities. I was particularly impressed by your volunteer program and the impact you\'re making with youth education. As we discussed, an AI chatbot could help extend your team\'s reach, especially for after-hours volunteer inquiries. I\'ll put together a customized proposal that addresses your specific needs around volunteer coordination. Would next Tuesday work for a follow-up call? Best regards, Chris',
    },
  },
};

// ============================================================================
// Tests: buildPrompt
// ============================================================================

describe('buildPrompt', () => {
  it('should build prompt successfully with all context data', async () => {
    const result = await buildPrompt(mockContext);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('string');

    // Check that context data is included
    const prompt = result.data!;
    expect(prompt).toContain('Hope Foundation');
    expect(prompt).toContain('Jane Smith');
    expect(prompt).toContain('hopefoundation.org');
  });

  it('should handle missing website scrape gracefully', async () => {
    const contextWithoutScrape: SynthesisContext = {
      ...mockContext,
      websiteScrape: null,
    };

    const result = await buildPrompt(contextWithoutScrape);

    expect(result.success).toBe(true);
    expect(result.data).toContain('Not available');
    expect(result.data).toContain('Website scrape not available');
  });

  it('should handle missing enrichment gracefully', async () => {
    const contextWithoutEnrichment: SynthesisContext = {
      ...mockContext,
      enrichmentOutput: null,
    };

    const result = await buildPrompt(contextWithoutEnrichment);

    expect(result.success).toBe(true);
    expect(result.data).toContain('not_available');
    expect(result.data).toContain('Enrichment not available');
  });

  it('should include all required template sections', async () => {
    const result = await buildPrompt(mockContext);

    expect(result.success).toBe(true);
    const prompt = result.data!;

    // Check for key template sections
    expect(prompt).toContain('Run Metadata');
    expect(prompt).toContain('Canonical Input Payload');
    expect(prompt).toContain('Website Scrape Output');
    expect(prompt).toContain('Enrichment Output');
    expect(prompt).toContain('HARD CONSTRAINTS');
    expect(prompt).toContain('EVIDENCE AND HALLUCINATION RULES');
  });
});

// ============================================================================
// Tests: parseBriefResponse
// ============================================================================

describe('parseBriefResponse', () => {
  it('should parse valid JSON response successfully', () => {
    const response = JSON.stringify(validBriefJson);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.meta.organization_name).toBe('Hope Foundation');
  });

  it('should handle JSON with markdown code fences', () => {
    const response = '```json\n' + JSON.stringify(validBriefJson) + '\n```';
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should reject invalid JSON', () => {
    const response = '{ invalid json }';
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('JSON_PARSE_ERROR');
  });

  it('should reject response missing required fields', () => {
    const invalidBrief = {
      meta: {
        run_id: 'test',
        // Missing other required fields
      },
    };
    const response = JSON.stringify(invalidBrief);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCHEMA_VALIDATION_ERROR');
  });

  it('should reject executive summary exceeding 600 characters', () => {
    const briefWithLongSummary = {
      ...validBriefJson,
      executive_summary: {
        ...validBriefJson.executive_summary,
        summary: 'A'.repeat(650), // Exceeds 600 character limit
      },
    };
    const response = JSON.stringify(briefWithLongSummary);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCHEMA_VALIDATION_ERROR');
    expect(result.error?.details).toContain('executive_summary.summary: Executive summary must be <= 600 characters');
  });

  it('should reject opening script exceeding 450 characters', () => {
    const briefWithLongScript = {
      ...validBriefJson,
      opening_script: 'B'.repeat(500), // Exceeds 450 character limit
    };
    const response = JSON.stringify(briefWithLongScript);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCHEMA_VALIDATION_ERROR');
  });

  it('should reject demonstration plan with more than 6 steps', () => {
    const briefWithTooManySteps = {
      ...validBriefJson,
      demonstration_plan: {
        ...validBriefJson.demonstration_plan,
        steps: ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7'],
      },
    };
    const response = JSON.stringify(briefWithTooManySteps);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCHEMA_VALIDATION_ERROR');
  });

  it('should reject response with wrong number of top_opportunities', () => {
    const briefWithWrongOpportunities = {
      ...validBriefJson,
      executive_summary: {
        ...validBriefJson.executive_summary,
        top_opportunities: ['Only one', 'Only two'], // Should be exactly 3
      },
    };
    const response = JSON.stringify(briefWithWrongOpportunities);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCHEMA_VALIDATION_ERROR');
  });

  it('should reject response with wrong number of AI opportunities', () => {
    const briefWithWrongAI = {
      ...validBriefJson,
      artificial_intelligence_opportunities: [
        validBriefJson.artificial_intelligence_opportunities[0],
        validBriefJson.artificial_intelligence_opportunities[1],
      ], // Should be exactly 3
    };
    const response = JSON.stringify(briefWithWrongAI);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCHEMA_VALIDATION_ERROR');
  });

  it('should enrich response with run_id and generated_at from context', () => {
    const briefWithEmptyMeta = {
      ...validBriefJson,
      meta: {
        ...validBriefJson.meta,
        run_id: '', // Empty - should be filled from context
        generated_at: '', // Empty - should be filled from context
      },
    };
    const response = JSON.stringify(briefWithEmptyMeta);
    const result = parseBriefResponse(response, mockContext);

    expect(result.success).toBe(true);
    expect(result.data!.meta.run_id).toBe(mockContext.runId);
    expect(result.data!.meta.generated_at).toBe(mockContext.generatedAt);
  });
});

// ============================================================================
// Tests: validateWordCounts
// ============================================================================

describe('validateWordCounts', () => {
  it('should pass for valid word counts', () => {
    const errors = validateWordCounts(validBriefJson);
    expect(errors).toHaveLength(0);
  });

  it('should fail for short email body exceeding 120 words', () => {
    const briefWithLongShortEmail: DealPrepBrief = {
      ...validBriefJson,
      follow_up_emails: {
        ...validBriefJson.follow_up_emails,
        short_version: {
          subject: 'Test',
          body: Array(130).fill('word').join(' '), // 130 words
        },
      },
    };
    const errors = validateWordCounts(briefWithLongShortEmail);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Short follow-up email');
    expect(errors[0]).toContain('must be <= 120');
  });

  it('should fail for warm email body exceeding 180 words', () => {
    const briefWithLongWarmEmail: DealPrepBrief = {
      ...validBriefJson,
      follow_up_emails: {
        ...validBriefJson.follow_up_emails,
        warm_version: {
          subject: 'Test',
          body: Array(200).fill('word').join(' '), // 200 words
        },
      },
    };
    const errors = validateWordCounts(briefWithLongWarmEmail);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Warm follow-up email');
    expect(errors[0]).toContain('must be <= 180');
  });
});

// ============================================================================
// Tests: calculateConfidence
// ============================================================================

describe('calculateConfidence', () => {
  it('should return high confidence for complete data', () => {
    const confidence = calculateConfidence(validBriefJson, mockContext);
    expect(confidence).toBe('high');
  });

  it('should return low confidence for minimal data', () => {
    const minimalContext: SynthesisContext = {
      ...mockContext,
      websiteScrape: null,
      enrichmentOutput: null,
    };

    const minimalBrief: DealPrepBrief = {
      ...validBriefJson,
      meta: {
        ...validBriefJson.meta,
        organization_name: 'Not found',
      },
      organization_understanding: {
        ...validBriefJson.organization_understanding,
        mission: 'Not found',
        programs: [],
      },
      leadership_and_staff: {
        executive_leader: {
          name: 'Not found',
          role: 'Not found',
          summary: 'Not found',
        },
        other_staff_mentions: [],
      },
      website_analysis: {
        ...validBriefJson.website_analysis,
        strengths: [],
      },
    };

    const confidence = calculateConfidence(minimalBrief, minimalContext);
    expect(confidence).toBe('low');
  });

  it('should return medium confidence for partial data', () => {
    const partialContext: SynthesisContext = {
      ...mockContext,
      websiteScrape: {
        ...mockScrapeOutput,
        pages: mockScrapeOutput.pages.slice(0, 3), // Only 3 pages
      },
      enrichmentOutput: {
        requester_profile: {
          summary: 'Some info',
          confidence: 'medium',
        },
        errors: [],
      },
    };

    const partialBrief: DealPrepBrief = {
      ...validBriefJson,
      leadership_and_staff: {
        executive_leader: {
          name: 'Not found',
          role: 'Not found',
          summary: 'Not found',
        },
        other_staff_mentions: [],
      },
    };

    const confidence = calculateConfidence(partialBrief, partialContext);
    expect(confidence).toBe('medium');
  });
});

// ============================================================================
// Tests: DealPrepBriefSchema (Zod validation)
// ============================================================================

describe('DealPrepBriefSchema', () => {
  it('should validate a correct brief structure', () => {
    const result = DealPrepBriefSchema.safeParse(validBriefJson);
    expect(result.success).toBe(true);
  });

  it('should require exactly 3 top_opportunities', () => {
    const invalidBrief = {
      ...validBriefJson,
      executive_summary: {
        ...validBriefJson.executive_summary,
        top_opportunities: ['one', 'two'],
      },
    };
    const result = DealPrepBriefSchema.safeParse(invalidBrief);
    expect(result.success).toBe(false);
  });

  it('should require exactly 3 AI opportunities', () => {
    const invalidBrief = {
      ...validBriefJson,
      artificial_intelligence_opportunities: [
        validBriefJson.artificial_intelligence_opportunities[0],
      ],
    };
    const result = DealPrepBriefSchema.safeParse(invalidBrief);
    expect(result.success).toBe(false);
  });

  it('should require exactly 3 objections_and_rebuttals', () => {
    const invalidBrief = {
      ...validBriefJson,
      objections_and_rebuttals: [validBriefJson.objections_and_rebuttals[0]],
    };
    const result = DealPrepBriefSchema.safeParse(invalidBrief);
    expect(result.success).toBe(false);
  });

  it('should enforce trigger_source enum values', () => {
    const invalidBrief = {
      ...validBriefJson,
      meta: {
        ...validBriefJson.meta,
        trigger_source: 'invalid',
      },
    };
    const result = DealPrepBriefSchema.safeParse(invalidBrief);
    expect(result.success).toBe(false);
  });

  it('should allow valid inbound trigger_source', () => {
    const inboundBrief = {
      ...validBriefJson,
      meta: {
        ...validBriefJson.meta,
        trigger_source: 'inbound',
      },
    };
    const result = DealPrepBriefSchema.safeParse(inboundBrief);
    expect(result.success).toBe(true);
  });

  it('should allow valid outbound trigger_source', () => {
    const outboundBrief = {
      ...validBriefJson,
      meta: {
        ...validBriefJson.meta,
        trigger_source: 'outbound',
      },
    };
    const result = DealPrepBriefSchema.safeParse(outboundBrief);
    expect(result.success).toBe(true);
  });
});
