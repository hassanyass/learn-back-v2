# LearnBack White Box Testing Requirements

Here is the exact internal logic, functions, and database structure from the LearnBack backend implementation for your white-box testing documentation.

### **Functions:**
* **Authentication**: `register_user(email, username, password)` and `authenticate_user(email, password)`
* **File Ingestion**: `extract_raw_text_from_bytes(filename, content)` (Parses PDF to text)
* **AI Curriculum Generation**: `ingest_and_segment(...)` (Calls LLM to break text into up to 4 topics and concepts)
* **Learning Session Engine**: `process_user_message(session_id, user_text)` (The core orchestrator handling the dual-LLM flow)
* **BKT Calculation Engine**: `update(p_mastery, outcome)` (Stateless Bayesian Knowledge Tracing math)
* **Widget Evaluation Engine**: `evaluate_widget(...)` (Pure Python logic to grade process/comparison widget submissions)
* **Feedback Generation**: `generate_session_feedback(session_id)` (Consolidates BKT scores and LLM analysis into a final report)

### **Key rules/logic:**
* **Mastery Threshold**: If `point_bkt_score` ≥ 0.85 (85%), the concept is marked as "mastered".
* **Attempt Limit Threshold**: If `point_attempts` ≥ 5, the concept is marked completed regardless of BKT score to prevent the student from getting stuck.
* **Point Advancement logic (Branching)**: If (BKT ≥ 0.85) OR (Attempts ≥ 5) → Point is marked `completed` → `current_point_index` increments.
* **Topic Checkpoint logic (Branching)**: If all points in a topic are marked `completed` → `topic_checkpoint` is set to `True` → System triggers the Mind Map review phase.
* **Widget Generation (Deterministic Triggers)**: 
  * If absolute session interaction count == 2 → Force "process" sorting widget.
  * If absolute session interaction count == 4 → Force "comparison" category widget.
* **Misconception Tracking**: If Evaluator LLM label == "INCORRECT", the extracted misconception string is appended to the point node array.
* **Session Termination**: If all topics are completed OR the overall aggregated session BKT score > 0.95 (95%), the session terminates naturally.

### **Database Structure:**
The system uses a relational database (PostgreSQL via SQLAlchemy) with heavy use of JSONB for nested states:
* `User`: `id`, `email`, `username`, `password_hash`
* `SlideDeck`: `id`, `user_id`, `original_filename`, `pdf_storage_url`, `status`, `segmented_json` (stores the syllabus topics and concepts)
* `LearningSession`: `id`, `user_id`, `slide_deck_id`, `status` (in_progress, completed), `bkt_score`, `session_state` (CRITICAL JSONB field holding live BKT scores, attempts, and curriculum pointers), `feedback_data` (JSONB for final report)
* `SessionMessage`: `id`, `session_id`, `sender_role` (user/kido), `message_text`, `widget_type`, `widget_data`

### **Features to include (for White Box Section):**
1. Answer Evaluation & BKT Update Logic
2. Session Point Advancement Logic
3. Hybrid Gamification / Widget Triggers
4. Feedback Generation Fallback Logic

---

### **Real Code Snippets & Suggested Screenshots for Report**

#### **1. BKT Update Math (Bayes' Rule Implementation)**
**File to screenshot**: `backend/backend/services/bkt_service.py` (Lines 65 to 95)
```python
# --- Step 1: Posterior after observing the outcome (Bayes' rule) ---
if outcome == 1:
    p_correct_given_mastered = 1.0 - self.p_slip
    p_correct_given_not_mastered = self.p_guess
    p_correct = (
        p_correct_given_mastered * p_mastery
        + p_correct_given_not_mastered * (1.0 - p_mastery)
    )
    # ... calculates posterior for correct ...
else:
    # ... calculates posterior for incorrect ...

# --- Step 2: Account for learning transition ---
updated = posterior + (1.0 - posterior) * self.p_learn
return max(0.0, min(1.0, updated))
```

#### **2. Session Point Advancement Limits (Branching Logic)**
**File to screenshot**: `backend/backend/services/session_service.py` (Lines 416 to 434)
```python
if state["point_attempts"] >= MAX_ATTEMPTS_PER_POINT or self.bkt.is_mastered(new_score):
    advanced = True

    # Mark current point as completed
    if point_node:
        point_node["status"] = "completed"
        point_node["is_correct"] = (label == "CORRECT")

    state["point_attempts"] = 0
    state["current_point_index"] += 1
    
    # Check: are ALL points in the current topic completed?
    # ... logic for triggering mind map checkpoint ...
```

#### **3. Deterministic Widget Triggers**
**File to screenshot**: `backend/backend/services/session_service.py` (Lines 92 to 106)
```python
def _check_forced_widget(state: dict[str, Any]) -> str | None:
    """Rules (absolute session counter, never resets):
      session_interaction_count == 2  →  "process"
      session_interaction_count == 4  →  "comparison"
      everything else                 →  None
    """
    count = state.get("session_interaction_count", 0)
    if count == 2:
        return "process"
    if count == 4:
        return "comparison"
    return None
```

#### **4. BKT Misconception Array Tracking**
**File to screenshot**: `backend/backend/services/session_service.py` (Lines 368 to 380)
```python
bkt_direction = 1 if label == "CORRECT" else 0
new_score = self.bkt.update(prev_score, bkt_direction)
if point_node:
    point_node["bkt_score"] = new_score

# --- Track misconceptions live (nested inside point) ---
detected_misconception = evaluator_output.get("detected_misconception")
if detected_misconception and label == "INCORRECT" and point_node:
    point_node["misconceptions"].append({
        "misconception": detected_misconception,
        "timestamp": datetime.utcnow().isoformat(),
    })
```
