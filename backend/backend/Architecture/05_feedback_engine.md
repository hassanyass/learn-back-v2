# Phase 4 — Feedback Engine

## Overview

The Feedback Engine provides session termination, live misconception tracking,
and LLM-powered feedback aggregation.  It bridges the teaching session (Phase 3)
to a structured post-session review the frontend renders as a "Feedback Dashboard."

---

## Session Termination

A `LearningSession` transitions from `in_progress` → `completed` when **either**
condition fires during `SessionService.process_user_message`:

| Trigger | Condition |
|---------|-----------|
| **Mastery** | `overall_bkt > 0.95` (average of all per-point BKT scores) |
| **Exhaustion** | Current topic is the **last** topic AND `attempt_counter >= MAX_ATTEMPTS_PER_POINT` |

On termination:
1. `session.status` is set to `"completed"`.
2. `session.end_time` is set to `datetime.utcnow()`.
3. Kido is forced to output a closing message directing the user to the feedback dashboard.
4. The WebSocket is closed with a `session_complete` payload.

---

## Live Misconception Tracking

Misconceptions are captured **live** during the session — not post-generated.

1. The Evaluator LLM prompt schema includes a `"detected_misconception"` field.
2. When `label == "INCORRECT"` and `detected_misconception` is non-null,
   `SessionService` appends an entry to the current point node:

   `session_state.topics[topic_idx].points[point_idx].misconceptions[]`

```json
{
  "misconception": "Student confused supervised vs unsupervised learning.",
  "timestamp": "2026-04-22T01:00:00Z"
}
```

3. These lists live inside the JSONB `session_state` column — no separate table needed.

---

## Feedback Generation

`FeedbackService.generate_session_feedback(session_id)` produces the final report:

1. **Inputs**: `session_state` (BKT scores, misconceptions) + `SessionMessage` chat history.
2. **Slide deck selection (Phase 6):** If `LearningSession.slide_deck_id` is set, the
   engine reads topics from that exact deck. Otherwise it falls back to the latest deck
   for the user (legacy sessions).
3. **Scoping**: Only topics that were **actually visited** (based on `current_topic_index`
   reached) are analyzed. Unvisited topics are excluded.
4. **LLM Prompt**: The chat history and BKT scores are sent to Groq with a strict
   JSON output schema requesting `strengths`, `weaknesses`, and `suggestions` per topic.
5. **Storage**: The combined result (LLM analysis + live misconceptions + BKT scores)
   is saved to `LearningSession.feedback_data` (JSONB column).
6. **Caching**: The endpoint returns cached `feedback_data` if it already exists.
   Regeneration is only triggered when `feedback_data IS NULL`.

---

## Data Flow

```
process_user_message()
  ├── Evaluator LLM → detected_misconception? → append to session_state.misconceptions
  ├── BKT update → check overall_bkt > 0.95?
  ├── Check last-topic exhaustion?
  │   └── YES → set status=completed, force Kido closing message
  └── persist state

GET /session/{id}/feedback
  ├── feedback_data exists? → return it
  └── feedback_data is null?
      └── FeedbackService.generate_session_feedback()
          ├── fetch session_state (misconceptions, bkt_scores)
          ├── fetch chat history (SessionMessage)
          ├── call LLM for per-topic strengths/weaknesses/suggestions
          └── save to LearningSession.feedback_data → return
```

---

## Frontend Contract

```json
{
  "overall_bkt_score": 0.87,
  "misconceptions": [
    {
      "topic_index": 0,
      "point_index": 1,
      "misconception": "Confused supervised vs unsupervised learning.",
      "timestamp": "2026-04-22T01:00:00Z"
    }
  ],
  "topic_cards": [
    {
      "topic": "Neural Networks Basics",
      "bkt_score": 0.92,
      "strengths": ["Clear explanation of backpropagation"],
      "weaknesses": ["Struggled with activation function differences"],
      "suggestions": ["Review the sigmoid vs ReLU tradeoffs"]
    }
  ]
}
```
