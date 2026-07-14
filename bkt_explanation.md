# Understanding Bayesian Knowledge Tracing (BKT) in LearnBack

## What is Bayesian Knowledge Tracing (BKT)?

Bayesian Knowledge Tracing (BKT) is an algorithm used in educational technology to model a student's cognitive state. Put simply, **it's a mathematical way to guess whether a student has "mastered" a specific concept or not, based on their sequence of right and wrong answers.**

Instead of just looking at a flat percentage (e.g., "75% correct"), BKT treats learning as a hidden state. You either know the concept, or you don't. We can't see into the student's brain, so we use their answers as *clues* (evidence) to calculate the **probability** that they have learned the concept.

### The Four Magic Numbers of BKT

To make this calculation, the system uses four fundamental probabilities:

1. **Initial Probability (`p_init` = 0.3)**: How likely is it that the student already knows the concept before answering any questions? We assume a low 30% chance by default.
2. **Learning Rate (`p_learn` = 0.2)**: The probability that a student will learn a concept they didn't know *after* interacting with the material once.
3. **Guess Rate (`p_guess` = 0.2)**: The probability that a student will get an answer right by guessing, even if they *don't* actually know the concept.
4. **Slip Rate (`p_slip` = 0.1)**: The probability that a student knows the concept but makes a careless mistake (typo, misreading) and gets it wrong.

By combining these four numbers using Bayes' Theorem, the system updates the "mastery probability" after every single interaction. If a student gets a question wrong, their mastery probability drops. If they get it right, it goes up. Once this probability crosses a specific threshold (e.g., `85%`), the system officially marks the concept as **"mastered"**.

---

## How BKT is Applied in the LearnBack Platform

In the LearnBack architecture, BKT is the core engine that determines when a student has successfully learned a "point" within a topic, allowing them to progress through the curriculum.

### 1. The BKT Service (`bkt_service.py`)
We have a dedicated `BKTService` that acts as our math engine. It contains the standard BKT update rule. 
- It has a `MASTERY_THRESHOLD` set to `0.85` (85%).
- State is not stored in the service itself; instead, each learning point in the `session_state` JSON has a `bkt_score` attribute. The service simply takes the old score and an outcome (0 for wrong, 1 for right) and returns the new calculated score.

### 2. Widget Interactions (`evaluator_service.py`)
When a student interacts with a widget (like a Process ordering widget or a Comparison drag-and-drop widget):
- The `EvaluatorService` compares the student's submitted data against the expected correct answer.
- If the widget interaction is **correct**, the system calls `bkt.update(old_score, 1)`. The student's `bkt_score` increases mathematically based on the BKT rules, and the difficulty goes up.
- If **incorrect**, it calls `bkt.update(old_score, 0)`. The `bkt_score` decreases, and difficulty goes down.
- If the `bkt_score` hits `0.85`, the point is marked as completed.

### 3. Text Chat / Orchestrator Evaluations
For free-form text interactions, the orchestrator (via LLM evaluation) determines if the student's response was `CORRECT`, `INCORRECT`, or `NEEDS_INFO`.
- **CORRECT:** The orchestrator applies a direct BKT increase (e.g., +0.60) to the current point's score.
- **INCORRECT:** A penalty is applied (e.g., -0.10) to the score, and the point's attempt counter goes up.
- **NEEDS_INFO:** The score remains unchanged.

### 4. Mind Map Corrections
If a user goes to the Mind Map and corrects a specific node, the system rewards this active learning behavior. The `evaluate_mind_map` function iterates through the corrections and applies a flat bonus (a `bkt_delta`, usually +0.05) to that specific node's `bkt_score`, updating the "Kido memory" with the summarized correction.

### Summary
In LearnBack, BKT acts as the **"invisible progress bar"** for every individual learning point. It dynamically reacts to everything the user does (chatting, widgets, mind map corrections) to ensure that we only move on when the math proves the student truly understands the material.
