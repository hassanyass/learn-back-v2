# LearnBack V2

## Overview

**LearnBack** is an innovative educational platform built around the pedagogical concept of the **"Protégé Effect"**—the idea that the best way to learn is by teaching someone else. 

Instead of acting as a traditional AI tutor that lectures the user, LearnBack flips the dynamic. The platform features an AI character named **Kido**, who acts as an eager but clueless student. The user uploads their study materials (like PDFs) and is then tasked with *teaching* the concepts to Kido. Behind the scenes, a hidden "Evaluator" AI judges the user's explanations, detecting misconceptions, and uses a mathematical model called **Bayesian Knowledge Tracing (BKT)** to track the user's true mastery of the material.

## Features & Core Loop

1. **Upload & Ingestion:** Upload study materials (PDFs). The backend extracts text and uses an LLM to segment the material into a structured syllabus of Topics and concepts.
2. **Session Initialization:** The system sets initial probability scores for the user's mastery using BKT.
3. **The Teaching Phase (Chat):** Kido asks the user to explain concepts. The user responds in plain English.
4. **Evaluation & Mastery Update:** A hidden LLM judge evaluates the user's explanation. The BKT engine recalculates the mastery score. If correct, Kido understands; if incorrect, Kido acts confused to push the user to clarify.
5. **Mind Map Verification:** Kido generates a summary. The user must review and correct Kido's understanding.
6. **Feedback & Dashboard:** Detailed feedback reports highlighting mastered concepts and misconceptions.

## Architecture

- **Backend:** FastAPI, SQLAlchemy (async), Alembic, PostgreSQL. 
  - Dual-Agent System: A hidden LLM Judge and the persona (Kido).
  - BKT Engine tracks four probabilities (Initial, Learn, Guess, Slip) to calculate mastery.
- **Frontend:** HTML, CSS, Vanilla JavaScript (ES Modules). Features a 3-pane interface (Kido Zone, Chat Area, Roadmap & Slides).

## Step-by-Step Setup Guide

Follow these steps to run LearnBack locally on your machine.

### Prerequisites

Ensure you have the following installed:
- Python 3.10+
- Conda (Miniconda or Anaconda recommended)
- PostgreSQL (Ensure a local PostgreSQL server is running and accessible)
- Git

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd LearnBack_V2
```

### 2. Backend Environment Setup

Create and activate a new Conda environment, then install dependencies:

```bash
conda create -n LearnBack_v2 python=3.10
conda activate LearnBack_v2
pip install -r backend/requirements.txt
```

### 3. Environment Variables Configuration

The backend requires a `.env` file to connect to the database and use LLMs.

1. Navigate to the backend's core configuration directory:
   ```bash
   cd backend/backend
   ```
2. Create your `.env` file (you can copy `.env.example` if it exists):
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and configure the following required variables:
   - `DATABASE_URL`: Your local PostgreSQL instance connection string (e.g., `postgresql://postgres:password@localhost:5432/learnback`).
   - `JWT_SECRET_KEY`: A secure random string for JWT tokens.
   - `GROQ_API_KEYS`: Your API key for Groq (or other configured LLM providers).
   - *Optional:* `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` if using Supabase for file storage.

### 4. Running the Backend Server

Start the FastAPI backend server using Uvicorn:

```bash
cd backend
uvicorn backend.main:app --reload --port 8002
```

The backend API will run at `http://127.0.0.1:8002`. Interactive API docs are available at `http://127.0.0.1:8002/docs`.

### 5. Running the Frontend

The frontend uses vanilla web technologies and can be served with a simple HTTP server. Open a **new** terminal window (keep the backend running) and start the frontend:

```bash
cd frontend
python -m http.server 8000
```

Access the application in your browser at `http://localhost:8000/auth.html`.

### Troubleshooting

- **CORS Issues:** If the frontend cannot communicate with the backend, verify that `CORS_ORIGINS` in your backend `.env` allows `http://localhost:8000` (or is set to `*`).
- **Database Connection Errors:** Ensure your PostgreSQL server is running and the `DATABASE_URL` matches your local credentials and database name.
- **Port Conflicts:** The backend runs on `8002` by default. If you change this, ensure you update the `API_BASE_URL` on the frontend side to match.

## Docker Setup (Optional)

Alternatively, you can run the backend using Docker Compose. Ensure your `.env` is set up properly at `backend/backend/.env`.

```bash
docker-compose up --build
```
This maps port `8002` to the host machine. You will still need to serve the frontend separately.

## Contributing

For implementing your own logic and APIs, refer to the source documentation in the repository. The backend uses a clean architecture separating `routes/` (API endpoints) and `services/` (business logic).