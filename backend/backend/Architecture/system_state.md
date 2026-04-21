# LearnBack System State (Phase 0 Source of Truth)

This document is the authoritative rulebook for engineering and AI-assisted coding in this repository. Any implementation that conflicts with this file is considered invalid.

## 1) System Overview

LearnBack is a production-focused learning platform built on a "learning by teaching" loop:

- Users learn by teaching concepts through chat-based sessions.
- The backend tracks understanding with dynamic Bayesian Knowledge Tracing (BKT)-style signals.
- The system adapts follow-up widgets/interactions based on confidence, mastery trajectory, and session quality.
- The architecture must remain modular, testable, and ready for scale.

Core goal: deliver adaptive learning feedback while keeping state management and safety rules explicit.

## 2) The 3-Tier Rule (Non-Negotiable)

All backend code must follow this strict dependency direction:

1. **Routers** (`routes/`) - HTTP transport only
2. **Services** (`services/`) - Business logic and orchestration
3. **Models** (`models/`) - Data representation and persistence

### Mandatory constraints

- Routers call Services only.
- Services can use Models and Core utilities.
- Models do not import Services or Routers.
- Routers must not contain domain/business logic.
- No cross-layer shortcuts, no circular dependencies, and no mixed responsibilities.

If a feature requires business rules, put them in Services. If it is request/response wiring, keep it in Routers.

## 3) Database Rule

Primary database: **Supabase PostgreSQL**.

Schema design policy:

- Core product data uses strict typed columns.
- AI-generated, variable, or evolving payloads use **JSONB** columns.
- JSONB is for flexible metadata and model output snapshots, not a replacement for normalized core entities.

All DB access must be implemented with explicit migrations and clear model ownership.

## 4) Storage Rule

Uploaded learning assets (PDF/PPTX) must be stored in **Supabase Storage buckets**.

Storage contract:

- Backend uploads files to a bucket.
- Backend persists storage metadata as needed.
- Backend returns a resolvable storage URL for frontend rendering/viewing.

Binary files must not be stored directly in PostgreSQL tables.

## 5) LLM Fallback Rule

Provider strategy:

- **Primary provider:** Groq
- **Secondary providers:** OpenAI and/or approved open-source API backends

Availability requirements:

- System must support key pools from environment variables.
- System must implement **key rotation** when rate-limited (free-tier friendly).
- On primary exhaustion, fallback to secondary provider automatically when available.

The fallback process must fail loudly with actionable errors when all providers are exhausted.

## 6) Streak Rule

A streak increments **only** when the user completes a full teaching session in a calendar day.

Interpretation guardrails:

- Partial sessions do not increment streaks.
- Multiple completed sessions in the same day increment at most once.
- "Calendar day" interpretation must be consistent with the product timezone policy.

## 7) Anti-Cheat Rule

Current anti-cheat baseline:

- Evaluate user teaching quality with **exact text matching** against uploaded slide content.

Future-proofing requirement:

- Design service contracts so semantic/vector similarity checks can be added later without breaking API contracts.

Exact-match now is mandatory; embedding-based detection is a planned extension, not a replacement yet.

## 8) Folder Responsibility Map

- `core/`: system config, DB setup, cross-cutting utilities, LLM fallbacks
- `models/`: SQLAlchemy entities and persistence-layer definitions
- `schemas/`: Pydantic request/response and validation contracts
- `routes/`: FastAPI endpoint declarations and HTTP concerns
- `services/`: domain workflows and business decisions
- `prompts/`: isolated LLM prompt definitions and versioned prompt content
- `Architecture/`: architecture rules, standards, and system-state docs

## 9) Enforcement

All contributors (human or AI) must:

- Read this file before non-trivial implementation.
- Refuse architecture-violating code paths.
- Preserve separation of concerns.
- Keep new modules aligned with these rules.

When ambiguity exists, prefer strict layering and explicit service orchestration.
