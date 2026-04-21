# Ingestion and Segmentation Engine

## File Intake Rules

- Supported uploads: PDF and PPTX only.
- Raw text extraction:
  - PDF via `PyPDF2`
  - PPTX via `python-pptx`
- PPTX->PDF conversion path is defined via LibreOffice headless subprocess.

## Storage Rule

- Final PDF artifact must be uploaded to Supabase Storage.
- Backend returns a public URL for frontend rendering.
- Current upload method is a stub and must be replaced with real Supabase client calls before production.

## Anti-Cheat Baseline

Plagiarism detection uses exact sequence matching:

- Normalize text (case-insensitive, punctuation removed).
- Tokenize into words.
- If any contiguous 15-word sequence from user input exists in slide text, flag as plagiarism.

## Segmentation Prompt Contract

LLM acts as an educational curriculum designer and returns at most 4 topics.

Required strict JSON schema:

{ "source_file": "filename", "extracted_segments": [ { "segment_id": 1, "topic_title": "...", "extracted_concepts": ["concept 1", "concept 2"] } ] }

No markdown/prose allowed in model output.

## LLM Routing

- Segmentation path uses `LLMManager`:
  - Groq primary
  - secondary provider fallback
  - key rotation on 429
