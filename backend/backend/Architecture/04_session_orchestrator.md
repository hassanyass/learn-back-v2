# Session Orchestrator Architecture

## Transport Topology

- WebSocket endpoint: `/ws/session/{session_id}` for live teaching loop.
- HTTP endpoint: `/session/{session_id}/hint` for explicit hint requests.
- Router is transport-only and delegates orchestration to `SessionService`.

## Dual-Agent Execution Order

Per user message:

1. Persist user message.
2. Evaluator agent runs first (strict JSON result).
3. BKT score updates in Python.
4. Session state mutates in Python (`session_state` JSONB).
5. Kido (Dummy AI) response is generated second.
6. Kido response is persisted and returned to client.

## BKT Guardrails

- Attempt counter is Python-enforced.
- Hard max: 5 attempts per point (`MAX_ATTEMPTS_PER_POINT = 5`).
- Auto-advance when either:
  - attempts reach max, or
  - mastery crosses threshold.

## Metaphor Retention Rule

- Evaluator extracts user metaphors.
- Session state stores metaphor history.
- Kido prompt must reuse student metaphors for continuity.

## Hint Logic Separation

- Hint generation is a separate system path (`generate_hint`).
- Hints are persisted as `system` messages.
- Hints can be broadcast to active WebSocket connection without rerunning full dual-agent cycle.
