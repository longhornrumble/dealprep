/**
 * Unit Tests for Renderers Module
 *
 * Tests per Implementation Spec Section 10:
 * - Section 10.1: Canonical Rendering Principle
 * - Section 10.2: CRM Rendering
 * - Section 10.3: Email Rendering
 * - Section 10.4: Motion Task Rendering
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import {
  renderCRMNote,
  renderEmail,
  renderMotionTask,
} from '../../src/renderers/index.js';
import type { CanonicalDealPrepBrief } from '../../src/types/index.js';
import type { CanonicalInput } from '../../src/normalizer/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid canonical brief fixture matching Implementation Spec Section 9.2
 */
const createValidBrief = (): CanonicalDealPrepBrief => ({
  meta: {
    run_id: 'run_20260117_100000_abc123xyz',
    generated_at: '2026-01-17T10:00:00.000Z',
    trigger_source: 'inbound',
    organization_name: 'Community Partners Foundation',
    organization_website: 'https://communitypartners.org',
    organization_domain: 'communitypartners.org',
    requester_name: 'Sarah Johnson',
    requester_title: 'Executive Director',
    source_urls: [
      'https://communitypartners.org/',
      'https://communitypartners.org/about',
      'https://communitypartners.org/programs',
    ],
  },
  executive_summary: {
    summary: 'Community Partners Foundation is a mid-sized nonprofit dedicated to youth education and family support services.',
    top_opportunities: [
      'Automate volunteer inquiry responses to reduce staff workload by 40%',
      'Implement AI-powered FAQ chatbot for 24/7 visitor engagement',
      'Streamline donation process with conversational assistance',
    ],
  },
  organization_understanding: {
    mission: 'To empower youth and families through education, mentorship, and community support services.',
    programs: [
      { name: 'After-School Excellence', summary: 'Provides academic tutoring for K-8 students.' },
      { name: 'Parent University', summary: 'Offers workshops for parents.' },
    ],
    audiences: ['K-8 students', 'Parents and caregivers', 'Adult volunteers'],
  },
  website_analysis: {
    overall_tone: 'Warm, welcoming, and community-focused.',
    strengths: ['Clear program descriptions', 'Multiple ways to get involved'],
    gaps: ['FAQ page is outdated', 'No chat support'],
    volunteer_flow_observations: 'Volunteer page exists but requires PDF form download.',
    donation_flow_observations: 'Donation page uses third-party platform with clean integration.',
  },
  leadership_and_staff: {
    executive_leader: {
      name: 'Sarah Johnson',
      role: 'Executive Director',
      summary: 'Sarah has led the organization for 8 years.',
    },
    other_staff_mentions: [
      { name: 'Michael Chen', role: 'Program Director' },
      { name: 'Lisa Martinez', role: 'Volunteer Coordinator' },
    ],
  },
  requester_profile: {
    summary: 'Sarah Johnson is a seasoned nonprofit leader focused on operational efficiency.',
    conversation_angle: 'Focus on how AI can help scale impact without increasing staff workload.',
  },
  artificial_intelligence_opportunities: [
    {
      title: 'Volunteer Inquiry Automation',
      why_it_matters: 'Staff spends 15+ hours weekly on repetitive questions.',
      demonstration_hook: 'Show chatbot handling common volunteer questions.',
    },
    {
      title: '24/7 Program Information Assistant',
      why_it_matters: 'Parents browse after work hours when staff unavailable.',
      demonstration_hook: 'Demonstrate parent asking about program locations.',
    },
    {
      title: 'Donor Engagement Enhancement',
      why_it_matters: 'Donation page lacks guidance on giving levels.',
      demonstration_hook: 'Show donor asking what $50 provides.',
    },
  ],
  demonstration_plan: {
    opening: 'Thank you for your time today, Sarah.',
    steps: [
      'Begin with volunteer FAQ scenario',
      'Show parent inquiry flow',
      'Demonstrate donation conversation',
    ],
    example_bot_responses: [
      'Hi! I\'d love to help you learn about volunteering.',
      'Great question! Our After-School Excellence program runs at 5 locations.',
    ],
  },
  objections_and_rebuttals: [
    {
      objection: 'We don\'t have the technical expertise.',
      rebuttal: 'MyRecruiter provides full implementation support.',
    },
    {
      objection: 'Our donors might prefer talking to a real person.',
      rebuttal: 'The AI handles routine inquiries while escalating complex questions.',
    },
    {
      objection: 'We\'re concerned about the cost.',
      rebuttal: 'Consider the time savings - ROI within 3 months.',
    },
  ],
  opening_script: 'Hi Sarah, thank you for taking the time to meet today.',
  follow_up_emails: {
    short_version: {
      subject: 'AI Solutions for Community Partners - Next Steps',
      body: 'Sarah, thank you for the conversation today.',
    },
    warm_version: {
      subject: 'Great Conversation Today - Excited About the Possibilities',
      body: 'Sarah, I really enjoyed learning more about Community Partners today.',
    },
  },
});

/**
 * Create a canonical input fixture
 */
const createCanonicalInput = (meetingAt?: string | null): CanonicalInput => ({
  meta: {
    trigger_source: 'inbound',
    submitted_at: '2026-01-17T08:00:00.000Z',
    run_id: 'run_20260117_100000_abc123xyz',
    requested_meeting_at: meetingAt ?? null,
    timezone: 'America/New_York',
  },
  organization: {
    name: 'Community Partners Foundation',
    website: 'https://communitypartners.org',
    domain: 'communitypartners.org',
  },
  contact: {
    full_name: 'Sarah Johnson',
    first_name: 'Sarah',
    last_name: 'Johnson',
    title: 'Executive Director',
    email: 'sarah@communitypartners.org',
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
});

// ============================================================================
// CRM Note Renderer Tests (Section 10.2)
// ============================================================================

describe('renderCRMNote', () => {
  // Suppress console.log during tests
  const originalLog = console.log;
  beforeAll(() => {
    console.log = jest.fn();
  });
  afterAll(() => {
    console.log = originalLog;
  });

  describe('successful rendering', () => {
    it('should return markdown with all required sections', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('# Deal Preparation Brief: Community Partners Foundation');
      expect(result.runId).toBe('run_20260117_100000_abc123xyz');
      expect(result.organizationName).toBe('Community Partners Foundation');
    });

    it('should preserve section hierarchy with proper headings', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);
      const markdown = result.markdown;

      // Check all major sections are present (Section 10.2: Include headings matching schema sections)
      expect(markdown).toContain('## Organization Information');
      expect(markdown).toContain('## Executive Summary');
      expect(markdown).toContain('## Organization Understanding');
      expect(markdown).toContain('## Website Analysis');
      expect(markdown).toContain('## Leadership and Staff');
      expect(markdown).toContain('## Requester Profile');
      expect(markdown).toContain('## AI Opportunities');
      expect(markdown).toContain('## Demonstration Plan');
      expect(markdown).toContain('## Objections and Rebuttals');
      expect(markdown).toContain('## Opening Script');
      expect(markdown).toContain('## Follow-up Emails');
    });

    it('should include run identifier reference', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      // Section 10.2: Link the run identifier in the CRM record
      expect(result.markdown).toContain('**Run ID:** `run_20260117_100000_abc123xyz`');
      expect(result.markdown).toContain('*Run ID: run_20260117_100000_abc123xyz*');
    });

    it('should include all top opportunities', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('1. Automate volunteer inquiry responses');
      expect(result.markdown).toContain('2. Implement AI-powered FAQ chatbot');
      expect(result.markdown).toContain('3. Streamline donation process');
    });

    it('should include source URLs', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('### Source URLs');
      expect(result.markdown).toContain('https://communitypartners.org/');
      expect(result.markdown).toContain('https://communitypartners.org/about');
    });

    it('should include programs list', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('**After-School Excellence**');
      expect(result.markdown).toContain('Provides academic tutoring for K-8 students.');
    });

    it('should include staff mentions', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('**Michael Chen** - Program Director');
      expect(result.markdown).toContain('**Lisa Martinez** - Volunteer Coordinator');
    });

    it('should include AI opportunities with details', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('### 1. Volunteer Inquiry Automation');
      expect(result.markdown).toContain('**Why It Matters:**');
      expect(result.markdown).toContain('**Demonstration Hook:**');
    });

    it('should include objections and rebuttals', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('We don\'t have the technical expertise.');
      expect(result.markdown).toContain('**Rebuttal:**');
    });

    it('should include follow-up emails', () => {
      const brief = createValidBrief();
      const result = renderCRMNote(brief);

      expect(result.markdown).toContain('### Short Version');
      expect(result.markdown).toContain('### Warm Version');
      expect(result.markdown).toContain('**Subject:** AI Solutions for Community Partners');
    });
  });

  describe('input validation', () => {
    it('should throw error for null brief', () => {
      expect(() => renderCRMNote(null as unknown as CanonicalDealPrepBrief)).toThrow(
        'Invalid brief: missing required fields'
      );
    });

    it('should throw error for undefined brief', () => {
      expect(() => renderCRMNote(undefined as unknown as CanonicalDealPrepBrief)).toThrow(
        'Invalid brief: missing required fields'
      );
    });

    it('should throw error for brief missing meta', () => {
      const brief = createValidBrief();
      delete (brief as Record<string, unknown>).meta;
      expect(() => renderCRMNote(brief)).toThrow('Invalid brief: missing required fields');
    });

    it('should throw error for brief missing executive_summary', () => {
      const brief = createValidBrief();
      delete (brief as Record<string, unknown>).executive_summary;
      expect(() => renderCRMNote(brief)).toThrow('Invalid brief: missing required fields');
    });

    it('should throw error for brief with empty run_id', () => {
      const brief = createValidBrief();
      brief.meta.run_id = '';
      expect(() => renderCRMNote(brief)).toThrow('Invalid brief: missing required fields');
    });

    it('should throw error for brief with empty organization_name', () => {
      const brief = createValidBrief();
      brief.meta.organization_name = '';
      expect(() => renderCRMNote(brief)).toThrow('Invalid brief: missing required fields');
    });
  });
});

// ============================================================================
// Email Renderer Tests (Section 10.3)
// ============================================================================

describe('renderEmail', () => {
  // Suppress console.log during tests
  const originalLog = console.log;
  beforeAll(() => {
    console.log = jest.fn();
  });
  afterAll(() => {
    console.log = originalLog;
  });

  describe('successful rendering', () => {
    it('should return subject and both body formats', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      expect(result.subject).toBe('Deal Prep Ready: Community Partners Foundation');
      expect(result.bodyPlain).toBeTruthy();
      expect(result.bodyHtml).toBeTruthy();
    });

    it('should include executive summary in plain text', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      // Section 10.3: Email must contain executive summary
      expect(result.bodyPlain).toContain('EXECUTIVE SUMMARY');
      expect(result.bodyPlain).toContain(
        'Community Partners Foundation is a mid-sized nonprofit'
      );
    });

    it('should include executive summary in HTML', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      expect(result.bodyHtml).toContain('Executive Summary');
      expect(result.bodyHtml).toContain(
        'Community Partners Foundation is a mid-sized nonprofit'
      );
    });

    it('should include top three opportunities in plain text', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      // Section 10.3: Email must contain top three opportunities
      expect(result.bodyPlain).toContain('TOP 3 OPPORTUNITIES');
      expect(result.bodyPlain).toContain('1. Automate volunteer inquiry responses');
      expect(result.bodyPlain).toContain('2. Implement AI-powered FAQ chatbot');
      expect(result.bodyPlain).toContain('3. Streamline donation process');
    });

    it('should include top three opportunities in HTML', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      expect(result.bodyHtml).toContain('Top 3 Opportunities');
      expect(result.bodyHtml).toContain('Automate volunteer inquiry responses');
      expect(result.bodyHtml).toContain('Implement AI-powered FAQ chatbot');
      expect(result.bodyHtml).toContain('Streamline donation process');
    });

    it('should include brief URL when provided', () => {
      const brief = createValidBrief();
      const briefUrl = 'https://crm.example.com/briefs/run_123';
      const result = renderEmail(brief, briefUrl);

      // Section 10.3: Link or reference to full brief
      expect(result.bodyPlain).toContain(briefUrl);
      expect(result.bodyHtml).toContain(`href="${briefUrl}"`);
      expect(result.bodyHtml).toContain('View Full Brief');
    });

    it('should include run_id reference when no URL provided', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      expect(result.bodyPlain).toContain('Reference: run_20260117_100000_abc123xyz');
      expect(result.bodyHtml).toContain('Reference: run_20260117_100000_abc123xyz');
    });

    it('should NOT include full brief inline (per Section 10.3)', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      // Section 10.3: Email must NEVER include the full brief inline
      expect(result.bodyPlain).not.toContain('## Organization Understanding');
      expect(result.bodyPlain).not.toContain('## Website Analysis');
      expect(result.bodyPlain).not.toContain('## Leadership and Staff');
      expect(result.bodyPlain).not.toContain('## Demonstration Plan');
      expect(result.bodyPlain).not.toContain('## Objections and Rebuttals');
      expect(result.bodyPlain).not.toContain('## Follow-up Emails');
    });

    it('should be skimmable (body under ~200 words per Section 10.3)', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      // Count words in plain text body
      const wordCount = result.bodyPlain.split(/\s+/).length;
      expect(wordCount).toBeLessThan(250); // Allow some buffer
    });

    it('should generate valid HTML', () => {
      const brief = createValidBrief();
      const result = renderEmail(brief);

      expect(result.bodyHtml).toContain('<!DOCTYPE html>');
      expect(result.bodyHtml).toContain('<html');
      expect(result.bodyHtml).toContain('</html>');
      expect(result.bodyHtml).toContain('<body');
      expect(result.bodyHtml).toContain('</body>');
    });
  });

  describe('XSS prevention', () => {
    it('should escape HTML special characters in organization name', () => {
      const brief = createValidBrief();
      brief.meta.organization_name = '<script>alert("xss")</script>';
      const result = renderEmail(brief);

      expect(result.bodyHtml).not.toContain('<script>');
      expect(result.bodyHtml).toContain('&lt;script&gt;');
    });

    it('should escape HTML special characters in opportunities', () => {
      const brief = createValidBrief();
      brief.executive_summary.top_opportunities[0] = '<img src=x onerror=alert(1)>';
      const result = renderEmail(brief);

      expect(result.bodyHtml).not.toContain('<img');
      expect(result.bodyHtml).toContain('&lt;img');
    });

    it('should escape HTML special characters in brief URL', () => {
      const brief = createValidBrief();
      const maliciousUrl = 'https://evil.com" onclick="alert(1)';
      const result = renderEmail(brief, maliciousUrl);

      // The quote should be escaped to &quot; which prevents breaking out of the href
      // The onclick should NOT be interpreted as an attribute
      expect(result.bodyHtml).toContain('&quot;');
      // Check that onclick appears only within the escaped URL string, not as an actual attribute
      // The URL is sanitized so " becomes &quot; preventing attribute injection
      expect(result.bodyHtml).toMatch(/href="https:\/\/evil\.com&quot;/);
    });
  });

  describe('input validation', () => {
    it('should throw error for invalid brief', () => {
      expect(() => renderEmail(null as unknown as CanonicalDealPrepBrief)).toThrow(
        'Invalid brief: missing required fields'
      );
    });

    it('should throw error for brief missing top_opportunities array', () => {
      const brief = createValidBrief();
      (brief.executive_summary as Record<string, unknown>).top_opportunities = 'not an array';
      expect(() => renderEmail(brief)).toThrow('Invalid brief: missing required fields');
    });
  });
});

// ============================================================================
// Motion Task Renderer Tests (Section 10.4)
// ============================================================================

describe('renderMotionTask', () => {
  // Suppress console.log during tests
  const originalLog = console.log;
  beforeAll(() => {
    console.log = jest.fn();
  });
  afterAll(() => {
    console.log = originalLog;
  });

  describe('successful rendering', () => {
    it('should return title with correct format', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput();
      const result = renderMotionTask(brief, input);

      // Section 10.4: Task title: "Deal Prep - {Organization Name}"
      expect(result.title).toBe('Deal Prep - Community Partners Foundation');
    });

    it('should include top three opportunities in body', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput();
      const result = renderMotionTask(brief, input);

      // Section 10.4: Task body must include top three opportunities
      expect(result.body).toContain('TOP 3 OPPORTUNITIES');
      expect(result.body).toContain('1. Automate volunteer inquiry responses');
      expect(result.body).toContain('2. Implement AI-powered FAQ chatbot');
      expect(result.body).toContain('3. Streamline donation process');
    });

    it('should include brief URL when provided', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput();
      const briefUrl = 'https://crm.example.com/briefs/run_123';
      const result = renderMotionTask(brief, input, briefUrl);

      // Section 10.4: Task body must include link to full brief
      expect(result.body).toContain(`Full Brief: ${briefUrl}`);
    });

    it('should include run reference when no URL provided', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput();
      const result = renderMotionTask(brief, input);

      expect(result.body).toContain('Reference: run_20260117_100000_abc123xyz');
    });

    it('should include task description', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput();
      const result = renderMotionTask(brief, input);

      expect(result.body).toContain('Review deal preparation brief before meeting');
    });
  });

  describe('due date calculation', () => {
    it('should calculate due date 2 hours before meeting when meeting time is known', () => {
      const brief = createValidBrief();
      // Meeting at 14:00 UTC
      const input = createCanonicalInput('2026-01-17T14:00:00.000Z');
      const result = renderMotionTask(brief, input);

      // Section 10.4: If meeting time is known, due 2 hours before meeting
      // 14:00 - 2 hours = 12:00
      expect(result.dueDate).toBe('2026-01-17T12:00:00.000Z');
    });

    it('should return null due date when meeting time is unknown', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput(null);
      const result = renderMotionTask(brief, input);

      // Section 10.4: If meeting time unknown, create without due date
      expect(result.dueDate).toBeNull();
    });

    it('should handle meeting time at midnight', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput('2026-01-18T00:00:00.000Z');
      const result = renderMotionTask(brief, input);

      // 00:00 - 2 hours = 22:00 previous day
      expect(result.dueDate).toBe('2026-01-17T22:00:00.000Z');
    });

    it('should handle meeting time in the morning', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput('2026-01-17T09:30:00.000Z');
      const result = renderMotionTask(brief, input);

      // 09:30 - 2 hours = 07:30
      expect(result.dueDate).toBe('2026-01-17T07:30:00.000Z');
    });

    it('should handle invalid meeting time gracefully', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput('invalid-date');
      const result = renderMotionTask(brief, input);

      expect(result.dueDate).toBeNull();
    });

    it('should return ISO-8601 formatted due date', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput('2026-01-17T14:00:00.000Z');
      const result = renderMotionTask(brief, input);

      // Verify ISO-8601 format
      expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('input validation', () => {
    it('should throw error for invalid brief', () => {
      const input = createCanonicalInput();
      expect(() => renderMotionTask(null as unknown as CanonicalDealPrepBrief, input)).toThrow(
        'Invalid brief: missing required fields'
      );
    });

    it('should handle missing meta.requested_meeting_at gracefully', () => {
      const brief = createValidBrief();
      const input = createCanonicalInput();
      delete (input.meta as Record<string, unknown>).requested_meeting_at;
      const result = renderMotionTask(brief, input);

      expect(result.dueDate).toBeNull();
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Renderer Integration', () => {
  // Suppress console.log during tests
  const originalLog = console.log;
  beforeAll(() => {
    console.log = jest.fn();
  });
  afterAll(() => {
    console.log = originalLog;
  });

  it('should produce consistent output for the same input', () => {
    const brief = createValidBrief();
    const input = createCanonicalInput('2026-01-17T14:00:00.000Z');
    const briefUrl = 'https://crm.example.com/briefs/run_123';

    const crmResult1 = renderCRMNote(brief);
    const crmResult2 = renderCRMNote(brief);
    expect(crmResult1.markdown).toBe(crmResult2.markdown);

    const emailResult1 = renderEmail(brief, briefUrl);
    const emailResult2 = renderEmail(brief, briefUrl);
    expect(emailResult1.bodyPlain).toBe(emailResult2.bodyPlain);
    expect(emailResult1.bodyHtml).toBe(emailResult2.bodyHtml);

    const motionResult1 = renderMotionTask(brief, input, briefUrl);
    const motionResult2 = renderMotionTask(brief, input, briefUrl);
    expect(motionResult1.title).toBe(motionResult2.title);
    expect(motionResult1.body).toBe(motionResult2.body);
    expect(motionResult1.dueDate).toBe(motionResult2.dueDate);
  });

  it('should handle brief with minimal data', () => {
    const minimalBrief: CanonicalDealPrepBrief = {
      meta: {
        run_id: 'run_minimal',
        generated_at: '2026-01-17T10:00:00.000Z',
        trigger_source: 'outbound',
        organization_name: 'Test Org',
        organization_website: 'https://test.org',
        organization_domain: 'test.org',
        requester_name: 'John Doe',
        requester_title: 'CEO',
        source_urls: [],
      },
      executive_summary: {
        summary: 'Test summary.',
        top_opportunities: ['Opp 1', 'Opp 2', 'Opp 3'],
      },
      organization_understanding: {
        mission: 'Test mission.',
        programs: [],
        audiences: [],
      },
      website_analysis: {
        overall_tone: 'Professional',
        strengths: [],
        gaps: [],
        volunteer_flow_observations: 'N/A',
        donation_flow_observations: 'N/A',
      },
      leadership_and_staff: {
        executive_leader: {
          name: 'John Doe',
          role: 'CEO',
          summary: 'Leader summary.',
        },
        other_staff_mentions: [],
      },
      requester_profile: {
        summary: 'Requester summary.',
        conversation_angle: 'Test angle.',
      },
      artificial_intelligence_opportunities: [
        { title: 'AI 1', why_it_matters: 'Matters 1', demonstration_hook: 'Hook 1' },
        { title: 'AI 2', why_it_matters: 'Matters 2', demonstration_hook: 'Hook 2' },
        { title: 'AI 3', why_it_matters: 'Matters 3', demonstration_hook: 'Hook 3' },
      ],
      demonstration_plan: {
        opening: 'Opening.',
        steps: [],
        example_bot_responses: [],
      },
      objections_and_rebuttals: [
        { objection: 'Obj 1', rebuttal: 'Reb 1' },
        { objection: 'Obj 2', rebuttal: 'Reb 2' },
        { objection: 'Obj 3', rebuttal: 'Reb 3' },
      ],
      opening_script: 'Test script.',
      follow_up_emails: {
        short_version: { subject: 'Short', body: 'Short body.' },
        warm_version: { subject: 'Warm', body: 'Warm body.' },
      },
    };

    const input = createCanonicalInput();

    // All renderers should work with minimal data
    expect(() => renderCRMNote(minimalBrief)).not.toThrow();
    expect(() => renderEmail(minimalBrief)).not.toThrow();
    expect(() => renderMotionTask(minimalBrief, input)).not.toThrow();
  });
});

// ============================================================================
// Observability Tests
// ============================================================================

describe('Renderer Observability', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log metrics on successful CRM render', () => {
    const brief = createValidBrief();
    renderCRMNote(brief);

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const metrics = JSON.parse(logCall);

    expect(metrics.level).toBe('info');
    expect(metrics.module).toBe('renderers');
    expect(metrics.renderer).toBe('renderCRMNote');
    expect(metrics.success).toBe(true);
    expect(metrics.runId).toBe('run_20260117_100000_abc123xyz');
    expect(typeof metrics.outputSize).toBe('number');
    expect(typeof metrics.durationMs).toBe('number');
  });

  it('should log error metrics on failed render', () => {
    try {
      renderCRMNote(null as unknown as CanonicalDealPrepBrief);
    } catch {
      // Expected error
    }

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const metrics = JSON.parse(logCall);

    expect(metrics.level).toBe('error');
    expect(metrics.success).toBe(false);
    expect(metrics.error).toBe('Invalid brief: missing required fields');
  });

  it('should log metrics on successful email render', () => {
    const brief = createValidBrief();
    renderEmail(brief);

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const metrics = JSON.parse(logCall);

    expect(metrics.renderer).toBe('renderEmail');
    expect(metrics.success).toBe(true);
  });

  it('should log metrics on successful Motion task render', () => {
    const brief = createValidBrief();
    const input = createCanonicalInput();
    renderMotionTask(brief, input);

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const metrics = JSON.parse(logCall);

    expect(metrics.renderer).toBe('renderMotionTask');
    expect(metrics.success).toBe(true);
  });
});
