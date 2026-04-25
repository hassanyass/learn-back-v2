# SessionState Schema Contract

> **Single Source of Truth** for the `session_state` JSONB column on `LearningSession`.
> All services that read or mutate this structure MUST conform to this contract.

---

## Top-Level Schema

```jsonc
{
  "current_topic_index": 0,          // int  — 0-based index into topics[]
  "current_point_index": 0,          // int  — 0-based index into topics[ti].points[]
  "point_attempts":      0,          // int  — attempts on current point (resets on advance)
  "current_difficulty":  1,          // int  — 1|2|3 (Basic|Application|Synthesis)
  "topics": [                        // TopicNode[]
    {
      "topic_title": "...",          // string — from segmented_json
      "reviewed":    false,          // bool   — set True after mind map review (optional, absent until set)
      "points": [                    // PointNode[]
        {
          "point_title":    "...",   // string — from extracted_concepts
          "bkt_score":      0.3,    // float  — [0.0, 1.0], initialized via BKTService.initial_probability()
          "status":         "pending", // string — "pending" | "in_progress" | "completed"
          "misconceptions": [],     // MisconceptionEntry[] — appended on INCORRECT evaluations
          "kido_memory":    null    // null | KidoMemory — set on point completion
        }
      ]
    }
  ]
}
```

---

## Field Definitions

### Top-Level Fields

| Field | Type | Default | Set By | Read By | Description |
|-------|------|---------|--------|---------|-------------|
| `current_topic_index` | `int` | `0` | `session_router` (init), `session_service` (advance) | `session_service`, `evaluator_service`, `kido_service` | Active topic pointer. Incremented after mind map review. |
| `current_point_index` | `int` | `0` | `session_router` (init), `session_service` (advance) | `session_service`, `evaluator_service`, `kido_service` | Active point within current topic. Reset to 0 on topic advance. |
| `point_attempts` | `int` | `0` | `session_router` (init), `session_service` (increment/reset), `evaluator_service` (increment) | `session_service`, `evaluator_service` | Counter for attempts on the current point. Reset to 0 on point advance. Hard limit: `MAX_ATTEMPTS_PER_POINT = 5`. |
| `current_difficulty` | `int` | `1` | `session_router` (init), `evaluator_service` (adjust) | `kido_service` | Difficulty tier for Kido's question complexity. Range: 1–3. |
| `topics` | `TopicNode[]` | `[]` | `session_router` (init) | All services | The full curriculum structure. Built once at creation, mutated during session. |

### TopicNode Fields

| Field | Type | Default | Set By | Read By | Description |
|-------|------|---------|--------|---------|-------------|
| `topic_title` | `string` | From `segmented_json` | `session_router` (init) | `kido_service`, `session_service` | Display title for the topic. Immutable after creation. |
| `reviewed` | `bool` | Absent until set | `evaluator_service.evaluate_mind_map()` | `session_service` | Set `True` after the user reviews the mind map. Optional key — may not exist on topics that haven't been completed yet. |
| `points` | `PointNode[]` | `[]` | `session_router` (init) | All services | Ordered list of inner learning points within this topic. |

### PointNode Fields

| Field | Type | Default | Set By | Read By | Description |
|-------|------|---------|--------|---------|-------------|
| `point_title` | `string` | From `extracted_concepts` | `session_router` (init) | `evaluator_service`, `kido_service`, `session_service` | The specific concept the user must teach. Immutable after creation. |
| `bkt_score` | `float` | `BKTService.initial_probability()` (0.3) | `session_router` (init), `session_service` (BKT update), `evaluator_service` (BKT update, widget eval, mind map bonus) | `session_service` (mastery check, aggregation) | Bayesian mastery probability. Range: [0.0, 1.0]. Mastery threshold: 0.85. |
| `status` | `string` | `"pending"` | `session_router` (init, first point → `"in_progress"`), `session_service` (advance), `evaluator_service` (completion) | `session_service` (checkpoint detection) | Point lifecycle: `"pending"` → `"in_progress"` → `"completed"`. |
| `misconceptions` | `MisconceptionEntry[]` | `[]` | `session_service` (on INCORRECT), `evaluator_service` (on detected_misconception) | `session_service` (mind map data) | List of detected misconceptions. Append-only during session. |
| `kido_memory` | `null \| KidoMemory` | `null` | `evaluator_service` (on point completion), `evaluator_service.evaluate_mind_map()` (on correction) | `session_service` (mind map data collection) | Kido's synthesized understanding of this point, used for the Mind Map display. |

---

## Nested Types

### MisconceptionEntry

```jsonc
{
  "misconception": "string",    // Description of the factual error
  "timestamp": "ISO 8601"       // When it was detected
}
```

**Set by**: `session_service.py:130-133` (timestamp format) or `evaluator_service.py:135` (plain string append).

> ⚠️ **Inconsistency detected**: `session_service.py:130-133` appends `{"misconception": str, "timestamp": str}`, while `evaluator_service.py:135` appends the raw `detected_misconception` string directly. These two formats will coexist in the same array. The consumer should handle both.

### KidoMemory

```jsonc
{
  "title": "string",     // Point title or custom title
  "summary": "string"    // Kido's understanding / corrected summary
}
```

**Set by**: `evaluator_service.py:148-151` (on completion), `evaluator_service.py:194-197` (on mind map correction).

---

## State Transitions

### Point Status Lifecycle

```
[*] ──→ pending ──→ in_progress ──→ completed ──→ [*]
         (init)    (point active)  (mastery OR max attempts)
```

### Pointer Advancement Rules

| Trigger | `current_point_index` | `current_topic_index` | `point_attempts` |
|---------|----------------------|----------------------|-----------------|
| Point completed (mastery or limit) | `+= 1` | unchanged | reset to `0` |
| All points in topic done (mind map pause) | unchanged | unchanged | unchanged |
| Mind map reviewed | reset to `0` | `+= 1` | reset to `0` |
| Session complete | frozen | frozen | frozen |

### Difficulty Adjustment Rules

| Evaluator Label | `current_difficulty` Change |
|-----------------|---------------------------|
| `CORRECT` | `min(3, difficulty + 1)` |
| `INCORRECT` | `max(1, difficulty - 1)` |
| `NEEDS_INFO` | unchanged |
| `IRRELEVANT` | unchanged |

---

## Constants (Cross-Referenced)

| Constant | Value | Defined In | Used By |
|----------|-------|------------|---------|
| `BKTService.p_init` | `0.3` | `bkt_service.py:30` | `session_router` (via `.initial_probability()`), `evaluator_service` (via `.initial_probability()`) |
| `MASTERY_THRESHOLD` | `0.85` | `bkt_service.py:17` | `session_service`, `evaluator_service` |
| `MAX_ATTEMPTS_PER_POINT` | `5` | `session_service.py:34` | `session_service` |
| `MAX_POINT_ATTEMPTS` | `5` | `evaluator_service.py:30` | `evaluator_service` |
| `OVERALL_BKT_COMPLETION_THRESHOLD` | `0.95` | `session_service.py:35` | `session_service` |

> ⚠️ `MAX_ATTEMPTS_PER_POINT` (session_service) and `MAX_POINT_ATTEMPTS` (evaluator_service) are the same value (5) defined independently in two files. These MUST stay in sync. Consider extracting to a shared constants module.

---

## Decision Authority Rules (Chunk 4 Constraints)

### Rule 1: Point Completion Authority

Point completion is ONLY decided by the Decision Engine (`session_service.py` orchestrator) using:

```
point_completed = (bkt_score >= MASTERY_THRESHOLD) OR (point_attempts >= MAX_ATTEMPTS_PER_POINT)
```

❗ **The evaluator label (`CORRECT`) MUST NOT directly trigger point completion.**
The label drives BKT updates, which indirectly influence completion via the BKT threshold.

### Rule 2: Topic Checkpoint Enforcement

```
IF all_points_completed(current_topic) == True:
    → MUST return topic_checkpoint = True
    → MUST NOT advance current_topic_index
    → Topic advancement is ONLY allowed after mind_map_submit
```

### Rule 3: Mutation Authority

Only the Decision Engine (`session_service.py`) is allowed to mutate:

| Field | Authorized Mutator | Unauthorized |
|-------|-------------------|--------------|
| `current_point_index` | `session_service` ONLY | `evaluator_service` ❌ |
| `current_topic_index` | `session_service` ONLY | `evaluator_service` ❌ |
| `point.status` | `session_service` ONLY | `evaluator_service` ❌ |
| `point_attempts` (reset) | `session_service` ONLY | `evaluator_service` ❌ |
| `session.status` | `session_service` ONLY | `evaluator_service` ❌ |

`EvaluatorService` is restricted to **pure scoring**:
- ✅ MAY read state to resolve current point/topic
- ✅ MAY compute BKT scores (via `BKTService`)
- ✅ MAY apply difficulty adjustment (`current_difficulty`)
- ✅ MAY append misconceptions
- ✅ MAY set `reviewed` flag on topic (mind map only)
- ❌ MUST NOT change `status`, `current_point_index`, `current_topic_index`, or `point_attempts` reset

---

## Consumers Reference

| Service | Reads | Writes |
|---------|-------|--------|
| `session_router.py` (create) | — | Full initial state |
| `session_service.py` (orchestrator / Decision Engine) | All fields | `point_attempts`, `current_point_index`, `current_topic_index`, point `status`, `bkt_score`, `misconceptions`, `kido_memory`, `session.status` |
| `evaluator_service.py` (scorer) | `current_topic_index`, `current_point_index`, `topics`, `current_difficulty`, `point_attempts` | `bkt_score`, `misconceptions`, `current_difficulty`, `reviewed` |
| `kido_service.py` (responder) | `current_topic_index`, `current_difficulty`, `topics` | — (read-only) |
| `bkt_service.py` (calculator) | — (receives score as parameter) | — (returns updated score) |

