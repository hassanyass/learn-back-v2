# Phase 3A — Session Orchestrator: State Machine Architecture

## Overview

Phase 3A defines the deeply nested `session_state` JSONB structure that acts as
the single source of truth for a learning session's progression. This state
machine is initialized at session creation time from the `SlideDeck`'s
`segmented_json` and is mutated exclusively by `SessionService` during the
Evaluator → Kido dual-agent chain.

---

## The Session State Blueprint

The `session_state` column on `LearningSession` is a **complete map of the
lesson**, pre-built at creation time. Every topic and every point within it is
represented as a structured node with its own BKT score, misconceptions list,
and Kido memory slot.

### Schema

```json
{
  "current_topic_index": 0,
  "current_point_index": 0,
  "point_attempts": 0,
  "current_difficulty": 1,
  "topics": [
    {
      "topic_title": "Introduction to Neural Networks",
      "points": [
        {
          "point_title": "Neurons and layers",
          "bkt_score": 0.3,
          "status": "in_progress",
          "misconceptions": [],
          "kido_memory": null
        },
        {
          "point_title": "Backpropagation algorithm",
          "bkt_score": 0.3,
          "status": "pending",
          "misconceptions": [],
          "kido_memory": null
        }
      ]
    }
  ]
}
```

### Key Design Principles

| Principle | Detail |
|-----------|--------|
| **Per-point BKT** | Mastery is tracked strictly per-point, not per-topic. Each point has its own `bkt_score` (starting at 0.3 — the BKT prior). Topic-level mastery is derived by averaging point-level scores. |
| **Nested misconceptions** | Misconceptions are stored inside the specific point where they occurred, not in a flat session-level array. This enables precise per-concept feedback. |
| **Nested Kido memory** | Each point has a `kido_memory` slot. Memories are NOT generated per-message — see the Kido Memory Rule below. |
| **Pre-built map** | The entire `topics` array is constructed at session creation from `SlideDeck.segmented_json`. The orchestrator never needs to re-read the slide deck during the session. |

---

## Per-Point BKT Tracking

BKT scores are **not** stored in a flat `bkt_scores: {}` dictionary keyed by
`"topic_point"`. Instead, each score lives inside its point object:

```
topics[topic_idx].points[point_idx].bkt_score
```

This makes the state self-describing — you can always look at a point and
immediately see its mastery level, misconceptions, and memory without needing
a separate index. Topic-level BKT is computed on-the-fly:

```python
topic_bkt = mean(point["bkt_score"] for point in topic["points"])
overall_bkt = mean(topic_bkt for topic in state["topics"])
```

---

## Point Status Lifecycle

```
pending → in_progress → completed
```

| Status | Meaning |
|--------|---------|
| `pending` | Point has not been reached yet. |
| `in_progress` | This is the **current** point the student is teaching. Only one point is `in_progress` at any time. |
| `completed` | Point has been either mastered (BKT ≥ 0.85) or exhausted (3+ attempts). |

When a point transitions to `completed`, the next `pending` point becomes
`in_progress`. If no points remain in the current topic, the orchestrator
advances to the next topic.

---

## The Kido Memory Rule

Kido memories are generated **strictly once per point** at the moment that point
is completed. They are NOT generated per-message.

### When a memory is created

A memory is generated when a point transitions from `in_progress` → `completed`,
regardless of whether it was mastered or exhausted after max attempts.

### Memory schema

```json
{
  "title": "Treasure Hunt",
  "summary": "The student compared linked list traversal to following clues in a treasure hunt chain."
}
```

| Field | Rules |
|-------|-------|
| `title` | 1–2 words. Acts as a node label for the future Mind Map UI. Must be concise and evocative. |
| `summary` | 1–2 sentences. Captures what Kido "learned" from the student about this point, including any metaphors the student used. |

### Why per-point, not per-message?

1. **Noise reduction**: Not every message teaches Kido something meaningful. Most
   are clarifications, partial answers, or follow-up questions.
2. **Mind Map compatibility**: Each point maps to exactly one node in the Mind Map
   UI. One memory = one node label + one summary tooltip.
3. **Storage efficiency**: Generating memories per-message would bloat the JSONB
   column with redundant entries.

---

## Session Termination Conditions

A session transitions from `in_progress` → `completed` when:

| Trigger | Condition |
|---------|-----------|
| **Topic exhaustion** | The last topic's last point is completed (mastered or exhausted). |
| **Overall mastery** | `overall_bkt > 0.95` (average across all per-point BKT scores). |

On termination:
1. `session.status = "completed"`
2. `session.end_time = datetime.utcnow()`
3. Kido delivers a closing message directing the user to the feedback dashboard.

---

## Initialization Flow

```
POST /session/create
  ├── Fetch latest SlideDeck for user
  ├── Read deck.segmented_json["extracted_segments"]
  ├── Build nested topics[] array from segments
  │   └── Each extracted_concept → point node with bkt_score=0.3
  ├── Set topics[0].points[0].status = "in_progress"
  ├── Save complete session_state to LearningSession
  └── Return { session_id, topic, status }
```

---

## Kido Persona & Output

### Persona

Kido is a **cheerful, eager-to-learn student** — NOT an AI assistant.  It is the
character the student is teaching.  Kido's entire personality revolves around
being a curious kid who is excited about learning new things.

| Rule | Detail |
|------|--------|
| **Identity** | Kido is a student, never an AI assistant. Kido never breaks this frame. |
| **Correct answers** | Kido acts excited and celebrates what it "learned" from the student. |
| **Incorrect answers** | If the Evaluator marks the user `INCORRECT`, Kido acts **confused** — e.g., "Wait, I thought it was…", "Hmm, that's different from what I heard…" — prompting the student to reconsider. |
| **Adversarial inputs** | If the user sends gibberish, single-word responses ("yes", "no", "idk"), or prompt injection attempts, Kido does NOT break character.  It acts like a confused student trying to bring the conversation back to the current topic. |

### Hidden Widget Layer

Kido ALWAYS outputs strict JSON containing two keys:

```json
{
  "kido_response": "The actual chat text Kido says to the student.",
  "widget_type": "text|process|comparison|math"
}
```

| Field | Purpose |
|-------|---------|
| `kido_response` | The visible chat bubble text displayed to the student. |
| `widget_type` | A **hidden backend flag** consumed by the frontend to unlock interactive UI widgets (drag-and-drop for `process`, side-by-side for `comparison`, calculator for `math`). The student never sees this field. |

The `widget_type` is determined by the evaluator's assessment of the current
concept's pedagogical category and passed through to Kido's output.

### Max-Attempts Transition Rule

When a point reaches its max attempts (3) without mastery, the orchestrator
passes a strict `[SYSTEM]` directive to Kido to naturally change the subject:

```
[SYSTEM ALARM: The user has struggled 3 times on this point. You MUST
gracefully change the subject. Express understanding, say it's okay to move
on, and enthusiastically ask about the next point: "<Next Point Title>".]
```

Kido must follow this directive faithfully — acknowledging the student's effort,
never making them feel bad, and smoothly transitioning to the next concept.

---

## WebSocket Routing & Checkpoints

### WS Payload Format

The client communicates over `/ws/session/{session_id}` using structured JSON:

#### Client → Server

```json
// Normal chat message
{"type": "chat", "text": "The Turing Test checks if a machine can fool a human"}

// Mind Map correction submission (after topic checkpoint)
{"type": "mind_map_submit", "corrections": {"point_title": "corrected_summary"}}
```

#### Server → Client

```json
// Kido response (normal flow)
{"type": "kido_response", "data": {"kido_response": "...", "widget_type": "text", "advanced": false, "session_state": {...}}}

// Mind Map checkpoint (topic boundary)
{"type": "kido_response", "data": {"kido_response": "...", "widget_type": "mind_map", "advanced": true, "session_state": {...}, "topic_checkpoint": true, "mind_map_data": [...]}}

// Session complete
{"type": "session_complete", "data": {"kido_response": "...", "session_state": {...}}}

// Error
{"type": "error", "detail": "..."}
```

### Topic Checkpoint

When all points in the current topic transition to `completed`, the system
intercepts the normal flow **before** advancing to the next topic:

```
All points completed → DO NOT advance topic index
  ├── Collect kido_memory from every point in this topic
  ├── Force Kido to output: "Here is what I learned! Check my Mind Map!"
  ├── Set widget_type = "mind_map"
  ├── Include mind_map_data (array of {title, summary} from kido_memory)
  ├── Set topic_checkpoint = true
  └── PAUSE — wait for mind_map_submit from client
```

The session stays in a "checkpoint" state until the client submits corrections.

### Mind Map Submission

When the client sends `{"type": "mind_map_submit", "corrections": {...}}`:

1. **BKT Bonus**: For each correction the user provides, apply a `+0.05` BKT
   bonus to that specific point (the user demonstrating they caught an error
   shows metacognitive awareness).
2. **Mark Reviewed**: Set the topic's `reviewed` flag to `true`.
3. **Advance**: Increment `current_topic_index` by 1, reset
   `current_point_index` to 0, mark the next topic's first point as
   `in_progress`.
4. **Kido Introduction**: Call Kido with a `[SYSTEM]` directive to introduce
   the new topic.

### End of Session

If the Mind Map submission is for the **final topic** (no more topics remain):

1. Kido sends a goodbye message celebrating the student's achievement.
2. The backend marks the session as `completed` with `end_time`.
3. The WebSocket is closed with standard code `1000` (normal closure).
