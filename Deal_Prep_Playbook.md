# Level 2 Deal Preparation Project
## Authoritative Playbook

---

## 1. Purpose of This Playbook

This document defines the **conceptual, strategic, and philosophical foundation** of the Level 2 Deal Preparation Project.

It exists to ensure that:
- All contributors (human or artificial) share the same mental model
- Product and implementation decisions remain aligned over time
- The system evolves without losing coherence or intent

This playbook is **authoritative**.  
All Product Requirements Documents and Implementation Specifications must align with it.

---

## 2. What the Level 2 Deal Prep Project Is

The Level 2 Deal Prep Project is an **internal sales-enablement system** that automatically prepares a seller for a sales conversation by generating a structured, evidence-based Deal Preparation Brief.

Its purpose is to eliminate manual pre-call research while improving:
- Credibility
- Confidence
- Relevance
- Speed to value during live conversations

The system synthesizes information about:
- The prospect organization
- Their mission, programs, and communications
- Their website structure and calls to action
- The meeting requester (when available)

The output is a **single, structured brief** designed to be read in minutes and referenced during a live sales call.

---

## 3. Target User and Context

### Primary User
- A founder-led, solopreneur salesperson

### Operating Context
- The seller owns the entire sales motion
- There is no handoff between sales roles
- Trust, preparedness, and credibility matter more than volume
- The seller must switch rapidly between inbound and outbound contexts

The system is **internal today**, but must be designed so that:
- Additional users could be supported in the future
- Multiple runs per organization are possible
- Artifacts can be reused, audited, and evolved

---

## 4. What “Level 2” Means

“Level 2” defines the **depth and intent** of the preparation, not the sophistication of the technology.

Level 2 preparation means:
- Contextual understanding, not just surface facts
- Identification of clear opportunities and gaps
- A tailored conversation and demonstration plan
- Evidence-based reasoning

Level 2 explicitly avoids:
- Predictive scoring
- Quantitative ROI estimation
- Behavioral analytics
- Automated decision-making

Those concerns belong to higher levels or different systems.

---

## 5. What the System Guarantees

For every successful run, the system guarantees:

1. A Deal Preparation Brief is produced
2. The brief is structured, bounded, and skimmable
3. All claims are grounded in observable data or explicitly marked as unavailable
4. The brief is delivered to the systems the seller already uses
5. The seller can rely on the brief during a live call without second-guessing its accuracy

If any of these guarantees cannot be met, the system must fail **loudly and explicitly**, not silently.

---

## 6. What the System Explicitly Does Not Do

The Level 2 Deal Prep Project does **not**:

- Replace discovery conversations
- Decide whether a lead is qualified
- Score or rank prospects
- Predict deal outcomes
- Generate customer-facing messaging
- Act autonomously in customer systems

The system prepares the seller.  
The seller remains responsible for judgment and decisions.

---

## 7. Trigger Philosophy

The system supports **two equally important trigger modes**:

### Inbound Trigger
- Initiated by an unknown visitor
- Typically includes structured form data
- Often includes minimal context

### Outbound Trigger
- Initiated by the seller
- May include partial or manually gathered data
- May precede any prospect awareness

Both triggers are first-class.  
Neither is treated as a special case in system design.

---

## 8. Trust as a First-Order Design Principle

Trust is the primary product metric.

To maintain trust:
- The system must never invent facts
- The system must never hide uncertainty
- The system must prefer “Not found” over speculation
- The system must be consistent across runs

A brief that is occasionally “less insightful” but always accurate is preferable to one that is clever but unreliable.

---

## 9. Evidence-First Reasoning

All insights must be traceable to:
- Website content
- Explicitly provided input data
- Clearly marked external enrichment

The system must preserve internal references to source material so that:
- Outputs can be audited
- Errors can be diagnosed
- Future improvements can be made without guesswork

---

## 10. Constraints as a Feature

Level 2 output is intentionally constrained.

Constraints:
- Improve readability
- Prevent information overload
- Reduce cognitive burden
- Enable consistent delivery

Constraints are **not** a limitation.  
They are a core feature of the system.

---

## 11. Durability and Future Compatibility

Although the system is internal today, it must be designed so that:

- Additional users could be supported
- Historical runs can be stored and reviewed
- Outputs can be re-rendered as formats evolve
- CRM vendors can be swapped without re-architecture

This does **not** mean over-engineering.  
It means avoiding decisions that permanently block future evolution.

---

## 12. Success Definition

The Level 2 Deal Prep Project is successful if:

- Manual pre-call research is eliminated
- The seller consistently reviews the brief before calls
- The seller references the brief during live conversations
- The brief shortens time-to-value in calls
- The system becomes a trusted part of the sales workflow

If the seller stops using the brief, the system has failed.

---

## 13. Relationship to Other Documents

This playbook defines **intent and philosophy**.

It is complemented by:
- The Authoritative Product Requirements Document, which defines behavior
- The Authoritative Implementation Specification, which defines contracts and execution

In case of conflict:
- Playbook defines *why*
- Product Requirements Document defines *what*
- Implementation Specification defines *how*