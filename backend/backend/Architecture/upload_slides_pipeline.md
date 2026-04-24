# Upload Slides Pipeline — Architecture & Post-Fix Report

> **Phase**: 2 — Upload Pipeline Stabilization
> **Status**: ✅ All 6 fixes applied and verified (17/17 tests passed)
> **Date**: 2026-04-24

---

## 1. Pipeline Overview

```
Frontend (upload_slides.js)
  │
  │  POST /ingestion/upload-slides  (Bearer token + FormData)
  │
  ▼
ingestion_router.py
  │
  ├── [1] File size guard (50 MB max)          → 413 if exceeded
  ├── [2] document_service.extract_raw_text()  → 400/422 on bad files
  │        ├── validate_upload() → .pdf / .pptx only
  │        ├── PDF  → PyPDF2.PdfReader
  │        └── PPTX → python-pptx Presentation
  │
  ├── [3] Save to temp dir for storage stub
  │        ├── PDF  → upload_pdf_to_storage() (stub URL)
  │        └── PPTX → placeholder://pptx/{user_id}/{name}.pdf
  │
  └── [4] ai_ingestion_service.ingest_and_segment()
           ├── Truncate to 6,000 words
           ├── Build prompt (SEGMENTATION_SYSTEM_PROMPT + text)
           ├── LLM call via LLMManager (Groq → secondary fallback)
           ├── _safe_parse_with_retry() → retry once on bad JSON
           ├── _validate_segmentation_schema() → enforce required fields
           ├── Cap at 4 topics (server-side enforcement)
           ├── SlideDeck INSERT → DB
           └── Return { document_id, pdf_storage_url, segmentation }

Frontend receives response
  │
  ├── document_id → chains to POST /session/create
  └── session_id  → redirect to session.html?sessionId=...
```

---

## 2. Fixes Applied

### Fix 1 — Missing `document_id` in Response (CRITICAL)

**File**: `ai_ingestion_service.py`

**Before**:
```python
return {
    "pdf_storage_url": pdf_storage_url,
    "segmentation": segmentation_json,
}
```

**After**:
```python
await self.db.refresh(deck)
return {
    "document_id": deck.id,        # ← NEW
    "pdf_storage_url": pdf_storage_url,
    "segmentation": segmentation_json,
}
```

**Impact**: The entire upload → session chain was broken. Frontend JS threw
`"Missing document_id"` before reaching `/session/create`.

---

### Fix 2 — JSON Parse Crash (CRITICAL)

**File**: `ai_ingestion_service.py`

**Before**: `json.loads()` in `_parse_segmentation_json()` raised unhandled
`json.JSONDecodeError` → HTTP 500.

**After**: New `_safe_parse_with_retry()` method:
1. Try parse first LLM output
2. On failure, retry LLM with stricter "JSON only" instruction
3. On second failure, raise HTTP 422 with sanitised snippet

---

### Fix 3 — Schema Validation (CRITICAL)

**File**: `ai_ingestion_service.py`

**Before**: `ValueError` for missing keys was unhandled → HTTP 500.

**After**: New `_validate_segmentation_schema()` method checks:
- `source_file` and `extracted_segments` exist at top level
- `extracted_segments` is a non-empty list
- Each segment has `topic_title` and `extracted_concepts`
- All validation failures → HTTP 422 with clear message

---

### Fix 4 — PPTX Placeholder Consistency (IMPORTANT)

**File**: `ingestion_router.py`

**Before**: `placeholder://pptx-upload/{filename}` — inconsistent format.

**After**: `placeholder://pptx/{user_id}/{stem}.pdf` — includes user scope
and consistent `.pdf` extension for column contract.

---

### Fix 5 — File Size Guard (IMPORTANT)

**File**: `ingestion_router.py`

**Before**: No size limit — 500 MB file would be fully buffered into RAM.

**After**:
```python
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
content = await file.read()
if len(content) > MAX_FILE_SIZE_BYTES:
    raise HTTPException(status_code=413, detail="File too large...")
```

---

### Fix 6 — LLM Safety Wrapper (IMPORTANT)

**File**: `ai_ingestion_service.py`

**Before**: Raw `json.JSONDecodeError` and `ValueError` exceptions could
reach FastAPI unhandled.

**After**: `_safe_parse_with_retry()` catches all parse/validation
exceptions and converts them to HTTP 422. Also added server-side cap
of max 4 topics regardless of LLM output.

---

### Bonus Fix — Corrupted File Handling

**File**: `ingestion_router.py`

**Before**: `PdfReader()` or `Presentation()` would raise
`PdfReadError` / `BadZipFile` → unhandled HTTP 500.

**After**:
```python
try:
    raw_text = await document_service.extract_raw_text(file)
except HTTPException:
    raise  # Our own 400/422 errors pass through unchanged
except Exception as exc:
    raise HTTPException(status_code=422, detail=f"Could not read file: {exc}...")
```

---

## 3. API Response Format

### Before (Broken)
```json
{
  "pdf_storage_url": "https://example.supabase.co/...",
  "segmentation": { ... }
}
```
Frontend expected `document_id` → threw error → session never created.

### After (Fixed)
```json
{
  "document_id": 35,
  "pdf_storage_url": "https://example.supabase.co/...",
  "segmentation": {
    "source_file": "sample.pdf",
    "extracted_segments": [
      {
        "segment_id": 1,
        "topic_title": "Topic Name",
        "extracted_concepts": ["concept 1", "concept 2"]
      }
    ]
  }
}
```

---

## 4. Error Handling Matrix (Post-Fix)

| Scenario | Status Code | Message | Fixed? |
|----------|-------------|---------|--------|
| Wrong file type (.docx, .txt) | 400 | "Only PDF and PPTX files are supported." | ✅ Pre-existing |
| Empty file | 400 | "Uploaded file is empty." | ✅ Pre-existing |
| File > 50 MB | 413 | "File too large..." | ✅ **NEW** |
| No extractable text | 422 | "No extractable text found..." | ✅ Pre-existing |
| Corrupted PDF/PPTX | 422 | "Could not read file content..." | ✅ **NEW** |
| LLM returns invalid JSON | 422 | "Failed to parse AI segmentation..." | ✅ **NEW** |
| LLM missing schema keys | 422 | "Missing required fields..." | ✅ **NEW** |
| All LLM providers fail | 422 | "AI processing failed..." | ✅ Pre-existing |
| Missing auth token | 403 | "Not authenticated" | ✅ Pre-existing |
| Invalid auth token | 401 | "Invalid or expired token." | ✅ Pre-existing |

---

## 5. Test Results (17/17 Passed)

| # | Test | Result |
|---|------|--------|
| 1 | Register user | ✅ |
| 2 | Login user | ✅ |
| 3 | Token received | ✅ |
| 4 | 51 MB file → HTTP 413 | ✅ |
| 5 | Corrupted PDF → HTTP 422 (not 500) | ✅ |
| 6 | Valid PDF → HTTP 200 | ✅ |
| 7 | Response has `document_id` | ✅ |
| 8 | `document_id` is integer | ✅ |
| 9 | Response has `pdf_storage_url` | ✅ |
| 10 | Response has `segmentation` | ✅ |
| 11 | Segmentation has `source_file` | ✅ |
| 12 | Segmentation has `extracted_segments` | ✅ |
| 13 | Max 4 topics enforced | ✅ |
| 14 | `/session/create` → HTTP 200 | ✅ |
| 15 | Session has `session_id` | ✅ |
| 16 | `GET /session/{id}` → HTTP 200 | ✅ |
| 17 | Session state has topics | ✅ |

---

## 6. Remaining Risks (Acknowledged)

| Risk | Severity | Notes |
|------|----------|-------|
| `pdf_storage_url` is a stub (not real Supabase) | 🟡 Medium | PDF viewer will show fallback — no visual slides during session |
| `GET /session/{id}` does not return `pdf_url` | 🟡 Medium | Frontend `normalizeSessionBootstrap()` sets `pdfUrl: null` |
| PPTX → PDF conversion (LibreOffice) not wired | 🟡 Low | Text extraction works; only visual rendering is missing |
| File read twice into memory | 🟡 Low | Mitigated by 50 MB cap; acceptable for 30-user testing |
| `source_filename` injected raw into LLM prompt | 🟡 Low | LLM output is JSON-validated; prompt injection risk is theoretical |

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `services/ai_ingestion_service.py` | Added `document_id` to return, `_safe_parse_with_retry()`, `_validate_segmentation_schema()`, 4-topic cap, robust markdown fence stripping |
| `routes/ingestion_router.py` | Added 50 MB file size guard (HTTP 413), corrupted file try/except (HTTP 422), consistent PPTX placeholder URL |

---

## 8. Integration Chain Status

```
AUTH → UPLOAD → SLIDEDECK → SESSION → FEEDBACK
 ✅       ✅        ✅         ✅        ✅

Register/Login → Token
  → POST /ingestion/upload-slides (Bearer token)
    → SlideDeck saved (document_id returned)
      → POST /session/create (fetches latest SlideDeck)
        → LearningSession created (slide_deck_id FK set)
          → session_service._get_segments() reads SlideDeck
            → feedback_service reads SlideDeck via FK
```

### Verdict: ✅ Ready for 30-user testing

The upload pipeline is now stable for production testing. All error paths
return proper HTTP status codes. The only limitation is the PDF viewer
showing a fallback (no visual slides) until Supabase storage is wired.
