# LearnBack V2 - Developer & Contributor Guide

Welcome to LearnBack V2! This guide is designed to help new developers set up the project locally, configure the environment, and understand how to extend the platform with custom logic and new APIs.

## 🚀 Quickstart: Local Setup

### 1. Prerequisites
Before you begin, ensure you have the following installed on your machine:
- **Python 3.10+**
- **Conda** (Miniconda or Anaconda recommended)
- **PostgreSQL** (Make sure you have a local postgres server running and accessible)
- **Git**

### 2. Clone and Environment Setup
Clone the repository, navigate into it, and set up your Python environment:

```bash
# Clone the repository
git clone <your-repo-url>
cd LearnBack_V2

# Create and activate a Conda environment
conda create -n LearnBack_v2 python=3.10
conda activate LearnBack_v2

# Install backend dependencies
pip install -r backend/requirements.txt
```

### 3. Setting Up the `.env` File
The backend requires environment variables to connect to the database, authenticate users, and interact with LLMs (Language Models). 

1. Navigate to the backend's core configuration directory:
   ```bash
   cd backend/backend
   ```
2. Copy the example environment file to create your own `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` in your code editor and fill in the following critical details:

   - **`DATABASE_URL`**: Update this to point to your local PostgreSQL instance.
     *Example:* `postgresql://postgres:password@localhost:5432/learnback`
   - **`JWT_SECRET_KEY`**: Set a secure random string for signing JWT tokens.
   - **`SUPABASE_URL`** & **`SUPABASE_SERVICE_ROLE_KEY`**: If your local development requires file storage or remote db features, provide your Supabase project credentials.
   - **`GROQ_API_KEYS`** / **`SECONDARY_LLM_API_KEYS`**: Provide your API keys for the LLM providers you intend to use. You can use Groq or OpenAI models. 

### 4. Running the Project Locally

#### Start the Backend (FastAPI)
Open a terminal, activate your conda environment, and start the backend server:
```bash
cd backend
uvicorn backend.main:app --reload --port 8002
```
The backend API will be available at `http://127.0.0.1:8002`. You can view the interactive API documentation at `http://127.0.0.1:8002/docs`.

#### Start the Frontend (Vanilla HTML/JS)
Open a **new** terminal window, leaving the backend running:
```bash
cd frontend
python -m http.server 8000
```
Open your browser and navigate to `http://localhost:8000/auth.html` to see the application in action.

---

## 🛠️ Implementing Your Own Logic & APIs

LearnBack's backend follows a clean architecture separating **Routes** (API definitions) from **Services** (Business logic). Here is how you can implement new features:

### 1. The Directory Structure
When you navigate to `backend/backend/`, you will see the following key directories:
- `/routes`: FastAPI routers handling HTTP requests and responses.
- `/services`: Core business logic and database interactions.
- `/models`: Database schema models (SQLAlchemy).
- `/schemas`: Pydantic models for request/response validation.
- `/core`: Application configuration, database connections, and LLM managers.

### 2. Guide to Adding a New API Endpoint

Let's say you want to add a new feature: **"Notes"**.

**Step 1: Create the Database Model (Optional)**
If your feature requires saving data, create a SQLAlchemy model in `backend/models/notes.py`.

**Step 2: Create Pydantic Schemas**
In `backend/schemas/notes.py`, define the request and response shapes:
```python
from pydantic import BaseModel

class NoteCreate(BaseModel):
    title: str
    content: str

class NoteResponse(NoteCreate):
    id: int
```

**Step 3: Implement Business Logic in Services**
Create `backend/services/notes_service.py`. This is where you write the core logic, separated from HTTP concerns:
```python
async def create_note(db_session, note_data):
    # Your logic to save the note to the database goes here
    pass
```

**Step 4: Expose the API Route**
Create `backend/routes/notes_router.py`. This handles the HTTP request, calls your service, and returns the response:
```python
from fastapi import APIRouter, Depends
from backend.schemas.notes import NoteCreate
# Import your service here...

router = APIRouter()

@router.post("/notes/")
async def create_new_note(note: NoteCreate):
    # Call your service and return
    return {"message": "Note created successfully!"}
```

**Step 5: Register the Router**
Finally, open `backend/main.py` and include your new router so the FastAPI app knows it exists:
```python
from backend.routes import notes_router

# Inside the app initialization:
app.include_router(notes_router.router, prefix="/api", tags=["Notes"])
```

### 3. Tips for Custom LLM Logic
If you want to create custom prompts or change how the AI behaves:
1. Check the `backend/prompts/` directory to modify existing instruction sets or add new ones.
2. In your services (e.g., `services/ai_ingestion_service.py` or your custom service), import `get_llm_manager()` from `backend.core.llm_manager` to interact with the configured LLMs seamlessly.
