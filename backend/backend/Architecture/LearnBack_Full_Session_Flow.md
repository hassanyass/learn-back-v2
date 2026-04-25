# LearnBack: Full Learning Session Architecture & Flow
**System:** Dummy AI / Reverse Tutor (Protege Effect)
**Pre-requisite:** Lecture materials (slides) uploaded, successfully parsed, and segmented into structured `Topics` containing specific `Inner Points`.

---

## 1. Session Initialization (The Starting Line)

The transition from the upload phase into the active learning session sets the baseline for the entire interaction.

### 1.1. State Preparation
* **Load Syllabus:** The backend fetches the segmented JSON structure from Supabase (`Topic 1 -> [Inner Point 1.1, Inner Point 1.2, ...]`).
* **Initialize BKT (Bayesian Knowledge Tracing):** The mathematical engine is primed. Initial probabilities for the user's conceptual mastery ($P(L_0)$) are set for the upcoming inner points based on historical data or default baseline values.
* **Set Pointers:** * `current_topic_index = 0`
  * `current_point_index = 0`
  * `message_count = 0` (Tracks attempts on the current point)
  * `attempt_total = 0` (Tracks absolute hard limit per point)

### 1.2. The Opening Prompt
* **Action:** Kido (the Dummy AI) generates the first message.
* **Constraint:** Kido must **only** ask about the very first inner point in the first topic. The prompt is designed to appear clueless but eager, inviting the user to begin their explanation.

---

## 2. The Core Learning Loop Pipeline

This cycle triggers every time the user submits an explanation (via text or voice-to-text) by clicking `[Send]`. The backend processes the input through a multi-agent pipeline before Kido responds.

### Step 2.1: Question Type Labeling & Widget Generation
Before evaluating the *quality* of the answer, the system categorizes the *nature* of the interaction to render appropriate UI elements.
* **The Process:** The backend analyzes the user's input and labels it (e.g., `TEXT`, `PROCESS`, `COMPARISON`, `MATH`).
* **The Output:** Based on the label, the system generates a structured JSON payload.
* **Purpose:** This JSON payload tells the frontend to render interactive, dynamic widgets (e.g., a comparison table, a step-by-step process flowchart, or a math formula block) alongside the chat, enhancing the visual learning experience.

### Step 2.2: The LLM Judge (Evaluation & Misconception Detection)
The silent, objective evaluator runs in the background. It strictly compares the user's explanation against the ground truth of the `Current Inner Point`.
* **Correctness Check:** Does the explanation accurately cover the required concept?
* **Completeness Check:** Is the explanation fully fleshed out, or is it a surface-level summary that needs more real-world examples?
* **Misconception Detection:** The Judge actively scans for logical fallacies, reversed definitions, or incorrect terminology. If a misconception is detected, it is flagged, logged in the database, and prioritized for Kido to address immediately.

### Step 2.3: Bayesian Knowledge Tracing (BKT) Update
The mathematical backbone of the system updates based on the Judge's verdict.
* **The Math:** The system updates the user's hidden mastery probability ($P(L_t)$). 
  * A correct, well-explained concept increases the probability of mastery.
  * Misconceptions or incorrect answers decrease the probability or hold it stagnant.
* **Purpose:** This ensures progression is based on mathematically verified mastery, not just a simple correct/incorrect flag.

---

## 3. Progression & Routing Logic

Based on the Judge's evaluation and the BKT mastery threshold, the system dictates the next move using strict state limits to prevent endless looping or frustration.

### Path A: Mastery Achieved (Correct & Complete)
* **Trigger:** The Judge marks the explanation as correct, and BKT confirms mastery.
* **Action 1 (Mind Map Update):** The system triggers the background Mind Map generation. Kido synthesizes a "description sentence" summarizing what it just learned about this specific point based *only* on the user's explanation. This `{point_id: description}` is stored in Supabase.
* **Action 2 (Progression):** Kido expresses understanding and gracefully moves "a bit forward" to the next `Inner Point` in the topic.
* **Action 3 (State Reset):** `message_count` and `attempt_total` are reset to 0.

### Path B: Incorrect Explanation (Stand Still)
* **Trigger:** The explanation is factually wrong or contains a flagged misconception.
* **Action:** The system stands still on the current point. `message_count` increments.
* **Limit Logic:** "Stand still for 2 times." Maximum of **3 questions/attempts** allowed for purely incorrect answers.
* **Kido's Behavior:** Kido asks a targeted question aimed at the specific misconception to guide the user back on track without giving away the answer.

### Path C: Incomplete / Needs More Explanation
* **Trigger:** The explanation is technically correct but lacks depth, or Kido needs an example to fully "grasp" it.
* **Action:** The system stands still. `message_count` increments.
* **Limit Logic:** Maximum of **4 questions/attempts** allowed for requesting more depth/examples.
* **Progressive Answering:** Kido asks a progressive question firmly *inside* the scope of the user's previous explanation (e.g., "I get that it's a data structure, but how would you use it in a real app?").

### Path D: Hard Limit Reached (Forced Transition)
* **Trigger:** The user hits the absolute maximum attempt threshold (**up to 5 attempts per point** combined) without achieving BKT mastery.
* **Action:** To prevent user fatigue, the system forces a transition. Kido steps out of the "dummy" persona slightly to provide the correct foundational concept (or suggests reviewing a specific slide), logs the point as "struggled/unmastered," and moves to the next point.

---

## 4. Topic Completion & Mind Map Verification

Once all inner points within a specific `Topic` have been covered (either through Mastery or Forced Transition), the topic concludes.

* **Topic Summary:** The system aggregates all the stored Mind Map points (Kido's synthesized descriptions) and any detected misconceptions for that specific topic.
* **Verification Phase:** The generated Mind Map is presented to the user. The user must review and **verify** Kido's formulated understanding.
* **Purpose:** This acts as a final cognitive check. If the user sees Kido's summary is slightly off, they realize their explanation wasn't clear enough. Verifying the map finalizes the topic, locks the BKT state, and triggers feedback before moving to Topic 2.

---

## 5. Session End

When all topics are completed, or the user clicks `[End Session]`:
* **Final BKT Sync:** All mastery probabilities are finalized and stored to the user's profile in Supabase.
* **Dashboard Generation:** The user is redirected to a post-session dashboard displaying their overall mastery, the complete verified Mind Map, areas of struggle (failed attempts), and resolved vs. unresolved misconceptions.
