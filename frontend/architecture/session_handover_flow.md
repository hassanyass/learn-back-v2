# Session Handover Flow — Upload → Session

> **Date**: 2026-04-24  
> **Status**: Production-ready

---

## 1. Upload → Session Flow Diagram

```
┌──────────────┐     POST /ingestion/upload-slides     ┌──────────────┐
│  Upload Page │ ──────────────────────────────────────→ │  Backend     │
│  upload_     │                                        │  ingestion   │
│  slides.js   │ ←── { document_id, pdf_storage_url,    │  router.py   │
└──────┬───────┘      segmentation }                    └──────────────┘
       │
       │  Validate: segments.length > 0
       │
       ▼
       POST /session/create
       │
       ▼
┌──────────────┐     GET /session/{id}                 ┌──────────────┐
│  Session Page│ ──────────────────────────────────────→ │  session     │
│  session.js  │                                        │  router.py   │
│              │ ←── { session_id, topics,              │              │
│              │      session_state, pdf_url,           │              │
│              │      slide_deck_id, ... }              │              │
│              │                                        └──────────────┘
│              │     WS /ws/session/{id}?token=JWT
│              │ ◄══════════════════════════════════════►  WebSocket
└──────────────┘
```

## 2. Data Contract

### Upload Response (`POST /ingestion/upload-slides`)
```json
{
  "document_id": 42,
  "pdf_storage_url": "/static/uploads/...",
  "segmentation": {
    "source_file": "lecture.pdf",
    "extracted_segments": [
      {
        "topic_title": "Neural Networks",
        "extracted_concepts": ["Perceptron", "Backpropagation"]
      }
    ]
  }
}
```

### Session Bootstrap (`GET /session/{id}`)
```json
{
  "session_id": 7,
  "title": "Neural Networks",
  "session_title": "Neural Networks",
  "status": "in_progress",
  "current_topic_index": 0,
  "topics": ["Neural Networks", "Decision Trees"],
  "slide_deck_id": 42,
  "pdf_url": "/static/uploads/...",
  "started_at": "2026-04-24T15:00:00",
  "completed_at": null,
  "session_state": {
    "current_topic_index": 0,
    "current_point_index": 0,
    "topics": [
      {
        "topic_title": "Neural Networks",
        "points": [
          { "point_title": "Perceptron", "bkt_score": 0.3, "status": "in_progress" },
          { "point_title": "Backpropagation", "bkt_score": 0.3, "status": "pending" }
        ]
      }
    ]
  }
}
```

## 3. Topic Injection Mechanism

1. `SessionState.constructor()` reads `session_state.topics` (array of objects with `topic_title` + `points`)
2. If backend only sends flat string array in `topics`, `SessionState` auto-converts to objects (legacy compat)
3. `UIRenderer.renderTopicList()` renders the topic roadmap in the right panel
4. Current topic is highlighted, past topics show checkmarks, future topics are clickable

## 4. Slide Deck Rendering Flow

```
session.js bootstrap
  └─ state.pdfUrl exists and is real URL?
      ├─ YES → wire "View Slides" button → on click → LearnBackPDF.open(pdfUrl)
      └─ NO  → disable button, show "Slide deck is not available for preview"
```

- PDF is lazy-loaded on first "View Slides" click (not on page load)
- Uses `pdfViewer.js` with PDF.js library
- Overlay panel with zoom/navigation controls

## 5. Failure Modes & Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| No topics in session | `state.topics.length === 0` | Show error message + "Re-upload Slides" link |
| No PDF URL | `pdfUrl` is null/placeholder | Disable "View Slides" button, show placeholder text |
| REST bootstrap fails | `fetchSession` throws | Redirect to `dashboard.html` |
| WS connection fails | 3 reconnect attempts exhausted | Show "Connection lost" in HUD |
| Empty segmentation | `segments.length === 0` on upload | Block session creation, show content validation error |

## 6. UX Behavior Rules

- ✔ Upload → Session feels continuous (immediate redirect after session creation)
- ✔ User sees their uploaded content (topic titles from segmentation) immediately
- ✔ No empty session states (validated before UI renders)
- ✔ No broken UI sections (PDF viewer degrades gracefully)
- ✔ Session title matches the first topic from segmentation

## 7. Known Limitations

1. **PPTX PDF conversion**: Currently uses placeholder URL. Real conversion requires Windows COM automation (see `document_service.py`).
2. **PDF serving**: Requires `/static/uploads/` to be mounted in FastAPI. If not mounted, PDF.js will fail to fetch the file.
3. **No slide-to-topic sync**: The PDF viewer shows all pages; there's no automatic jump to the slide matching the current topic.
