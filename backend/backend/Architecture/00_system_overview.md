# LearnBack System Overview

## Product Loop

LearnBack is a "learning by teaching" backend:

1. User uploads slides.
2. Content is segmented into teachable concepts.
3. User teaches Kido via chat/session flow.
4. Evaluator updates BKT mastery.
5. Dashboard summarizes mastery, streaks, and milestones.

## LLM Provider Strategy

- Primary provider: Groq.
- Secondary providers: OpenAI / compatible open-source endpoints.
- Key pools are read from environment variables.
- On HTTP 429, keys must rotate automatically.
- If all primary keys are exhausted, flow must fallback to secondary pool.

## Non-Negotiable 3-Tier Rule

Dependency direction is strict:

- Router -> Service -> Model

Rules:

- Routers handle transport only (HTTP/WebSocket parsing, response shaping, auth dependency wiring).
- Services own business logic and orchestration.
- Models define persistence structures only.
- Routers never contain domain decisions.
- Models never import services/routers.
- Service-to-service calls are allowed when orchestration remains in service layer.

## Current Module Boundaries

- `core/`: DB config and cross-cutting utilities (LLM key rotation manager).
- `models/`: SQLAlchemy entities and JSONB-backed dynamic state.
- `services/`: auth, dashboard, ingestion, anti-cheat, BKT, session orchestration.
- `routes/`: auth/dashboard/ingestion/session endpoints.
- `prompts/`: isolated prompt templates for segmentation and dual-agent orchestration.
