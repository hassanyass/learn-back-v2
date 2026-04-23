# Database Schema Strategy

## Storage Backbone

- Database: Supabase PostgreSQL.
- ORM: SQLAlchemy (async engine/session usage in app runtime).
- Migrations: Alembic async environment.

## Core Schema Rule

Use strict, typed columns for stable product entities:

- Users, sessions, milestones, messages, slide decks.
- Explicit primary keys, foreign keys, and indexes.

This keeps analytics, integrity, and joins predictable.

## Flexible Schema Rule (JSONB)

Use JSONB for evolving AI/state payloads that change faster than core schema:

- `learning_sessions.session_state` (dynamic orchestration state)
- `slide_decks.segmented_json` (LLM segmentation payload)

Rationale:

- Prevents repeated migration churn for shape changes.
- Preserves compatibility as prompts/agent outputs evolve.
- Keeps strict relational columns for identity and lifecycle fields.

## Conflict-Avoidance Practices

- Never store core identity/lifecycle fields only inside JSONB.
- Keep JSONB structure documented at service boundaries.
- Validate required JSON keys in service code before persistence.
- Prefer additive JSONB evolution over destructive schema rewrites.

## Session ↔ SlideDeck Link (Phase 6)

To prevent "latest deck" drift and ensure reproducibility, sessions can store
an explicit reference to the slide deck used for initialization:

- `learning_sessions.slide_deck_id` (nullable FK → `slide_decks.id`)

Notes:
- Nullable for legacy sessions created before this column existed.
- On slide deck deletion, the FK is set to NULL (`ON DELETE SET NULL`).
