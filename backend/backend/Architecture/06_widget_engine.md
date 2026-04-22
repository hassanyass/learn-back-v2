# Widget Data Engine — Architecture

## Overview

The Widget Data Engine generates structured interactive data (PROCESS, COMPARISON)
via LLM and evaluates user submissions via pure Python logic (no LLM grading).

## Strict Decoupling: Backend Data vs. Frontend Rendering

| Layer | Responsibility |
|-------|----------------|
| **Backend (Kido LLM)** | Generates ONLY raw data arrays in `widget_data`. Never shuffles, never renders. |
| **Frontend** | Receives `widget_data`, shuffles/randomizes for display, renders the interactive UI. |
| **Backend (Evaluator)** | Compares the user's submitted array against the original `widget_data`. Pure Python — no LLM call. |

This decoupling ensures:
1. **Deterministic grading** — no LLM variability in evaluation.
2. **Frontend freedom** — the UI can shuffle, animate, and present data however it wants.
3. **Testability** — widget grading is a pure function with predictable outputs.

## Widget Types

### TEXT (default)

Standard conversational exchange. No structured data.

```json
{
  "kido_response": "That's so cool! Can you tell me more?",
  "widget_type": "text",
  "widget_data": null
}
```

### PROCESS

Step-by-step sequential concept. Kido generates the CORRECT ordered list.
The frontend shuffles the steps and presents a drag-and-drop reordering UI.

```json
{
  "kido_response": "Ooh, I want to learn the steps! Can you put them in order?",
  "widget_type": "process",
  "widget_data": {
    "steps": ["Step 1: Gather data", "Step 2: Clean data", "Step 3: Train model", "Step 4: Evaluate"]
  }
}
```

**Evaluation**: User submits `{"steps": [...]}`. Perfect array match = CORRECT.
Any deviation in order = INCORRECT.

### COMPARISON

Compare/contrast between two categories. Kido generates the correct mapping.
The frontend presents a sorting UI (drag attributes into category buckets).

```json
{
  "kido_response": "I'm confused about these two! Can you sort them for me?",
  "widget_type": "comparison",
  "widget_data": {
    "categories": ["Supervised Learning", "Unsupervised Learning"],
    "attributes": [
      {"text": "Uses labeled data", "category": "Supervised Learning"},
      {"text": "Finds hidden patterns", "category": "Unsupervised Learning"},
      {"text": "Classification tasks", "category": "Supervised Learning"},
      {"text": "Clustering tasks", "category": "Unsupervised Learning"}
    ]
  }
}
```

**Evaluation**: User submits `{"attributes": [{"text": "...", "category": "..."}]}`.
Every attribute must be matched to the correct category. Any mismatch = INCORRECT.

## Strict Binary Evaluation

Widget submissions are graded with **strict binary logic** — no partial credit:

| Result | Condition | BKT Effect |
|--------|-----------|-------------|
| **CORRECT** | Submitted array perfectly matches generated array | `bkt_score += 0.60`, `status = completed`, `difficulty += 1` |
| **INCORRECT** | Any deviation from the expected answer | `point_attempts += 1`, `bkt_score -= 0.10`, `difficulty -= 1` |

This is enforced by `EvaluatorService.evaluate_widget()` — a pure Python method
that never calls the LLM. The grading is deterministic and instant.

## Data Flow

```
1. Kido LLM generates response with widget_type + widget_data
2. Backend persists widget_data in SessionMessage.widget_data (JSONB)
3. Frontend receives widget_data, shuffles for display
4. User interacts with widget, submits {"type": "widget_submit", "submitted_data": {...}}
5. Backend fetches Kido's last message to get expected widget_data
6. EvaluatorService.evaluate_widget() compares submitted vs expected (pure Python)
7. Result (CORRECT/INCORRECT) is passed to Kido for a natural reaction
8. Kido generates a celebration or gentle confusion response
```
