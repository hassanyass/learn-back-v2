# Overall Project: LearnBack V2

## 1. Project Overview

**LearnBack** is an innovative educational platform built around the pedagogical concept of the **"Protégé Effect"**—the idea that the best way to learn is by teaching someone else. 

Instead of acting as a traditional AI tutor that lectures the user, LearnBack flips the dynamic. The platform features an AI character named **Kido**, who acts as an eager but clueless student. The human user uploads their study materials (like lecture slides) and is then tasked with *teaching* the concepts to Kido. Behind the scenes, a hidden "Evaluator" AI judges the user's explanations, detecting misconceptions, and uses a mathematical model called **Bayesian Knowledge Tracing (BKT)** to track the user's true mastery of the material.

## 2. Core Loop & Functionalities

The user journey in LearnBack follows a strict, highly orchestrated pipeline:

1. **Upload & Ingestion:** The user uploads study materials (PDFs). The backend extracts the text, truncates it to fit context windows, and uses an LLM (primarily Groq) to segment the material into a structured syllabus of **Topics** and **Inner Points** (teachable concepts).
2. **Session Initialization:** A session state is created. The system sets initial probability scores for the user's mastery of the upcoming concepts.
3. **The Teaching Phase (Chat):** Kido asks the user to explain the first concept. The user responds in plain English.
4. **Evaluation & Mastery Update:** 
   - A hidden LLM judge evaluates the user's explanation for correctness, completeness, and misconceptions.
   - The BKT engine recalculates the user's mastery score. 
   - If correct, Kido "gets it" and the score goes up. If incorrect, Kido acts confused, forcing the user to clarify, and the score drops.
5. **Mind Map Verification:** At the end of a topic, Kido generates a "Mind Map" summarizing what they learned. The user must review and correct Kido's understanding, reinforcing learning.
6. **Feedback & Dashboard:** Upon session completion, the user gets a detailed feedback report highlighting mastered concepts and persistent misconceptions, which is aggregated on their dashboard.

## 3. Backend Architecture

The backend is built with **FastAPI**, **SQLAlchemy** (async), and **Alembic** for migrations, backed by a relational database (PostgreSQL/Supabase).

### Key Components:
- **Routers (`backend/backend/routes/`)**: Handle HTTP/WebSocket transport layer. Includes routes for `auth`, `dashboard`, `ingestion`, `session`, and `feedback`.
- **Services (`backend/backend/services/`)**: Contain the core business logic.
  - `ai_ingestion_service.py`: Handles segmenting uploaded PDFs into topics and concepts using LLMs.
  - `session_service.py`: The massive "Session Orchestrator". It manages the state machine, routes messages to the LLM judge, updates BKT, and manages Kido's responses.
  - `document_service.py`: Extracts raw text from uploaded files.
  - `dashboard_service.py` & `feedback_service.py`: Generate reports and aggregate stats.
- **Models (`backend/backend/models/`)**: SQLAlchemy models including `User`, `SlideDeck` (stores segmentation JSON), `LearningSession` (stores the deeply nested `session_state` JSONB), and `SessionMessage`.
- **Core (`backend/backend/core/`)**: Includes the `llm_manager.py` which handles routing LLM requests, rotating keys on HTTP 429 limits, and falling back to secondary providers.

### The Engine: Bayesian Knowledge Tracing (BKT)
BKT is a mathematical algorithm used to model a student's cognitive state. It uses four probabilities (Initial, Learn, Guess, Slip) to calculate the likelihood that a user has mastered a concept. In LearnBack, once a concept hits an **85% BKT score**, it is marked as "Mastered".

### The Dual-Agent System
- **The Judge:** An objective, hidden LLM that grades the user's input.
- **Kido:** The persona. A cheerful, eager student. If the Judge says the user is wrong, Kido is instructed via a system prompt to act "confused" to subtly push the user to realize their mistake without just giving them the answer.

## 4. Frontend Architecture

The frontend is a lightweight, static architecture using **HTML, CSS (Variables/Tokens), and Vanilla JavaScript (ES Modules)**, without heavy frameworks like React.

### Key Pages:
- `index.html`: A beautifully designed landing page with a charcoal-and-amber or modern aesthetic, explaining the science of the Protégé Effect.
- `auth.html` / `auth.js`: User login and registration.
- `dashboard.html` / `dashboard.js`: The central hub showing the user's progress, BKT mastery aggregates, streaks, and previous sessions.
- `upload_slides.html` / `upload_slides.js`: A drag-and-drop interface for users to upload their PDFs. Communicates with the backend ingestion engine.
- `session.html` / `session.js`: **The Core UI.** A complex, three-pane interface:
  - **Left (Kido Zone):** Shows Kido's face (using Lottie animations for emotion states like thinking, happy, confused) and a mini HUD tracking the current BKT mastery bar.
  - **Center (Chat Area):** The main interface where the user types out explanations and talks to Kido.
  - **Right (Roadmap & Slides):** Shows the current topic and concept list, tracking progress as things are checked off. Also features a PDF viewer (`pdfViewer.js`) showing the uploaded slides.
- `feedback.html` / `feedback.js`: The post-session debrief page.

### Client-Side Engine:
The frontend session logic is highly modularized under `frontend/js/core/`:
- `SessionState.js`: Mirrors the backend's JSONB session state, keeping the UI in sync.
- `WebSocketManager.js`: Handles real-time communication with the backend during the teaching session.
- `UIRenderer.js` & `dom.js`: Manage DOM updates, animations, and transitions.

## 5. Summary

LearnBack is a highly sophisticated, state-machine-driven EdTech platform. By combining a playful frontend persona (Kido) with a rigorous backend mathematical model (BKT) and dual-agent LLM architecture, it forces active recall and ensures users truly understand the material before moving on.
