# 08 — Session Execution Blueprint (Phase 3 Frontend)

> Merges the Implementation Plan with 3 Decisive Architectural Constraints.

---

## Architectural Constraints Acknowledged

### C1: Animation Preservation

The Lottie player is initialized in `session.html` (line 824-833) as an **inline ES module** using `@lottiefiles/dotlottie-web`. It targets `<canvas id="kido-canvas">` and plays `Idle.lottie` on loop.

**Preservation strategy:**
- The inline `<script type="module">` block in `session.html` stays **exactly as-is**. It is self-contained and has zero coupling to `script.js`.
- `audioManager.js` (gamification sounds: `correct.mp3`, `incorrect.mp3`, `start.mp3`) stays **as-is**. It exposes `window.AudioManager` and is already decoupled.
- `UIRenderer.js` will call `window.AudioManager.playSound('correct'|'incorrect')` when updating the HUD — same pattern as the current `updateHud()` in script.js.
- Future Lottie emotion states (e.g., switching from `Idle.lottie` to `gotit.lottie`) will be handled by storing the `DotLottie` instance on `window.KidoLottie` and exposing a `setAnimation(src)` method. **Not implemented in this phase** — idle loop is sufficient.

### C2: The Boot Failsafe

`session.js` will execute this strict boot sequence:

```
1. Parse ?sessionId= from URL
2. If null/empty → window.location.href = 'dashboard.html' (HALT)
3. Show loading overlay (#session-loading)
4. REST GET → apiClient.fetchSession(sessionId)
5. If 404/500/network error → window.location.href = 'dashboard.html' (HALT)
6. Populate SessionState + render UI from REST response
7. Open WebSocket to ws://127.0.0.1:8002/ws/session/{sessionId}
8. On WS open → hide loading overlay, enable chat input
9. On WS error/fail → show error toast, DO NOT redirect (allow retry)
```

> The redirect fires ONLY on steps 2 and 5. A WS failure after successful REST bootstrap does NOT redirect — the user sees a reconnection toast instead.

### C3: Data-Flow Over Visuals (UI Stubs)

For this phase, MindMap and Widget UIs are **functional stubs** — minimal HTML that lets us test WS payloads end-to-end.

**Mind Map Checkpoint Stub:**
```html
<div id="mindmap-checkpoint-modal" class="modal-overlay" hidden>
  <div class="modal">
    <h2>Kido's Mind Map</h2>
    <div id="mindmap-nodes-container">
      <!-- JS injects: one card per kido_memory with textarea -->
    </div>
    <button id="btn-mindmap-submit">Submit Corrections</button>
    <button id="btn-mindmap-skip">Looks Good!</button>
  </div>
</div>
```

**Widget Stub (PROCESS/COMPARISON):**
```html
<div id="widget-modal" class="modal-overlay" hidden>
  <div class="modal">
    <h2 id="widget-modal-title">Interactive Widget</h2>
    <pre id="widget-data-display"></pre>
    <textarea id="widget-input" placeholder='Paste your answer JSON...'></textarea>
    <button id="btn-widget-submit">Submit Answer</button>
  </div>
</div>
```

These stubs will be replaced with rich drag-and-drop UIs in a later phase.

---

## Order of Operations

### Step 1: Delete Dead Files

| Action | File | Reason |
|--------|------|--------|
| **DELETE** | `frontend/script2.js` | Legacy clone causing double-fired event listeners. 2,722 lines of dead weight. |
| **DELETE** | `frontend/script.js` | Monolithic 2,757-line file with fake BKT, orphaned code, REST chat. Replaced by modular `session.js`. |

> `script.js` is not deleted until Step 6 is complete (new modules proven functional). During development, it is simply **unlinked** from `session.html` first.

### Step 2: Clean `session.html`

| Line | Change |
|------|--------|
| `11` | Remove `<script src="https://cdn.tailwindcss.com">` |
| `140` | Change `Machine Learning` to empty string (populated by JS) |
| `822` | Remove `<script src="script2.js">` |
| Bottom | Remove old script tags, replace with new module loading (see Step 7) |
| After line 805 | Add Mind Map Checkpoint stub modal (C3) |
| After line 805 | Add Widget stub modal (C3) |
| After line 805 | Add Session Complete overlay with "View Feedback" button |
| After line 805 | Add Loading overlay (`#session-loading`) |

### Step 3: Create `js/core/SessionState.js`

Single source of truth mirroring the backend `session_state` schema from `04_session_orchestrator.md`.

```
export class SessionState {
  constructor(restBootstrapData)

  // Properties (from REST GET /session/{id})
  sessionId, sessionTitle, status
  topics[]                         // nested {topic_title, points[]}
  currentTopicIndex, currentPointIndex
  overallBkt

  // Derived from WS responses
  lastWidgetType                   // "TEXT"|"PROCESS"|"COMPARISON"
  lastWidgetData                   // raw widget_data from kido
  isMindMapPending                 // true when topic_checkpoint received
  mindMapData[]                    // kido_memory entries for checkpoint
  isSessionComplete

  // Methods
  updateFromWsResponse(data)       // merges session_state from WS
  getCurrentTopicTitle() → string
  getCurrentPointTitle() → string
  getTopicTitles() → string[]     // for roadmap render
  getAggregatedBkt() → number     // 0-100 scale
  getPointBkt(ti, pi) → number
}
```

### Step 4: Create `js/core/WebSocketManager.js`

Connection lifecycle with reconnect logic.

```
export class WebSocketManager {
  constructor(sessionId)

  connect()              // opens WS
  send(payload)          // JSON.stringify + ws.send
  close()                // graceful disconnect

  // Callbacks (set by session.js)
  onKidoResponse(data)
  onSessionComplete(data)
  onMindMap(data)        // topic_checkpoint
  onSystemHint(data)
  onError(detail)
  onConnectionChange(state)  // 'connecting'|'connected'|'disconnected'

  // Internal
  _onMessage(event)      // routes by .type field
  _onClose(event)        // code 1000 → session end, else reconnect
  _reconnect()           // max 3 attempts, exponential backoff

  // State
  isConnected: boolean
}
```

**Message routing in `_onMessage`:**

| `payload.type` | Handler |
|-----------------|---------|
| `"kido_response"` | Check `data.topic_checkpoint` → `onMindMap()` else `onKidoResponse()` |
| `"session_complete"` | `onSessionComplete()` |
| `"system_hint"` | `onSystemHint()` |
| `"error"` | `onError()` |

### Step 5: Create `js/core/UIRenderer.js`

DOM manipulation class. **Preserves all existing visual patterns** from script.js (HUD states, concept card, topic roadmap, typing animation) but as clean methods.

```
export class UIRenderer {
  constructor(domRefs)

  // Chat
  appendUserMessage(text, msgId)
  appendKidoMessage(text, msgId)       // typing animation preserved
  appendHintMessage(text)
  showTypingIndicator(msgId) → element
  setChatLockout(locked)

  // HUD (C1: triggers AudioManager)
  updateHud(evaluatorLabel)            // maps backend labels → HUD states
  updateBktProgress(pct)               // fills progress bar + ring stub
  updateConceptCard(entry)             // preserves delta ghost visuals

  // Roadmap
  renderTopicList(topics, currentIdx, skippedIndices)
  updateSessionTitle(title)

  // Cube Button
  setCubeState(widgetType)             // disabled for TEXT, glowing for PROCESS/COMPARISON

  // Mind Map Stub (C3)
  showMindMapModal(mindMapData)        // renders cards with textareas
  hideMindMapModal()
  getMindMapCorrections() → {}         // reads textareas → {point_title: correction}

  // Widget Stub (C3)
  showWidgetModal(widgetType, widgetData)
  hideWidgetModal()
  getWidgetSubmission() → {}           // reads textarea JSON

  // Session End
  showSessionCompleteOverlay(sessionId)

  // Connection State
  showLoading() / hideLoading()
  showConnectionState(state)           // 'connecting'|'connected'|'error'
}
```

**HUD Label Mapping (backend → frontend):**

| Backend `evaluator_label` | → | HUD State Key | Audio |
|---------------------------|---|---------------|-------|
| `"CORRECT"` | → | `correct` | `correct.mp3` |
| `"INCORRECT"` | → | `incorrect` | `incorrect.mp3` |
| `"NEEDS_INFO"` | → | `needs_detail` | — |
| `"OFF_TOPIC"` | → | `irrelevant` | — |
| *(during WS send)* | → | `thinking` | — |
| *(idle)* | → | `waiting` | — |

### Step 6: Create `session.js` (Entry Point)

The orchestrator. Replaces `script.js` entirely. Pseudocode:

```
// C2: Boot Failsafe
const sessionId = new URLSearchParams(window.location.search).get('sessionId');
if (!sessionId) { window.location.href = 'dashboard.html'; }

const ui = new UIRenderer(dom);
ui.showLoading();

// REST bootstrap
let state;
try {
  const data = await LearnBackAPI.fetchSession(sessionId);
  if (!data) throw new Error('empty');
  state = new SessionState(data);
} catch (e) {
  window.location.href = 'dashboard.html';  // C2: failsafe
}

// Populate UI from REST data BEFORE WS opens
ui.updateSessionTitle(state.sessionTitle);
ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, []);
ui.updateBktProgress(state.getAggregatedBkt());

// Open WS
const ws = new WebSocketManager(sessionId);

ws.onConnectionChange = (s) => {
  ui.showConnectionState(s);
  if (s === 'connected') { ui.hideLoading(); ui.setChatLockout(false); }
};

ws.onKidoResponse = (data) => {
  state.updateFromWsResponse(data);
  ui.appendKidoMessage(data.kido_response);
  ui.updateHud(data.evaluator_label || 'waiting');
  ui.updateBktProgress(state.getAggregatedBkt());
  ui.setCubeState(data.widget_type);
  ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, []);
  ui.setChatLockout(false);
};

ws.onMindMap = (data) => {
  state.updateFromWsResponse(data);
  ui.appendKidoMessage(data.kido_response);
  ui.showMindMapModal(data.mind_map_data);
  ui.setChatLockout(true);
};

ws.onSessionComplete = (data) => {
  ui.appendKidoMessage(data.kido_response);
  ui.showSessionCompleteOverlay(state.sessionId);
};

ws.connect();

// Wire Chat Send
dom.btnSend.onclick = () => {
  const text = dom.chatInputField.value.trim();
  if (!text || !ws.isConnected) return;
  ui.appendUserMessage(text);
  ui.setChatLockout(true);
  ui.updateHud('thinking');
  ws.send({ type: "chat", text });
  dom.chatInputField.value = '';
};

// Wire Cube Button
dom.btnRequestGraph.onclick = () => {
  if (state.lastWidgetType === 'TEXT' || !state.lastWidgetData) return;
  ui.showWidgetModal(state.lastWidgetType, state.lastWidgetData);
};

// Wire Widget Submit (C3 stub)
btnWidgetSubmit.onclick = () => {
  const submission = ui.getWidgetSubmission();
  ws.send({ type: "widget_submit", submitted_data: submission });
  ui.hideWidgetModal();
};

// Wire Mind Map Submit (C3 stub)
btnMindmapSubmit.onclick = () => {
  ws.send({ type: "mind_map_submit", corrections: ui.getMindMapCorrections() });
  ui.hideMindMapModal();
};

btnMindmapSkip.onclick = () => {
  ws.send({ type: "mind_map_submit", corrections: {} });
  ui.hideMindMapModal();
};

// Wire Session End
btnViewFeedback.onclick = () => {
  window.location.href = `feedback.html?sessionId=${state.sessionId}`;
};
```

### Step 7: Update `session.html` Script Loading

Replace the old script block at the bottom of `session.html`:

```html
<!-- KEEP: External dependencies -->
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>

<!-- KEEP: Decoupled utilities -->
<script src="audioManager.js"></script>
<script src="apiClient.js"></script>
<script src="sessionStore.js"></script>
<script src="pdfViewer.js"></script>
<script src="sessionSplitPane.js"></script>

<!-- NEW: Session engine (replaces script.js + script2.js) -->
<script type="module" src="session.js"></script>

<!-- KEEP: Lottie (C1: Animation Preservation) -->
<script type="module">
  import { DotLottie } from 'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web/+esm';
  const canvas = document.getElementById('kido-canvas');
  const lottie = new DotLottie({
    canvas: canvas,
    src: 'Idle.lottie',
    loop: true,
    autoplay: true,
  });
  window.KidoLottie = lottie;
</script>
```

### Step 8: Update `dom.js`

Add new element references for stub modals and overlays.

### Step 9: Strip `apiClient.js`

| Function | Action |
|----------|--------|
| `sendChatMessage()` | **DELETE** — chat goes over WS |
| `finalizeSession()` | **DELETE** — WS close code 1000 handles this |
| `skipToTopic()` | **DELETE** — not in current backend WS spec |
| `normalizeChatResponse()` | **DELETE** — WS response shape is different |
| `fetchSession()` | **KEEP** — REST bootstrap |
| `fetchSessionFeedback()` | **KEEP** — feedback.html |
| `fetchDashboardState()` | **KEEP** — dashboard.html |
| All auth functions | **KEEP** |

### Step 10: Update `sessionStore.js`

- Keep as **localStorage cache** for offline resilience
- Remove `syncLegacySession()` and legacy key sync
- Remove `buildFallbackFeedback()` (generates fake feedback text)
- Server state from REST + WS is authoritative

### Step 11: Verify End-to-End

1. Load `session.html?sessionId=1` → loading overlay → REST → UI → WS → overlay gone
2. Type message → verify WS sends `{"type":"chat","text":"..."}`
3. Kido response renders with typewriter, HUD updates, BKT bar moves
4. Cube button state toggles based on `widget_type`
5. Trigger topic checkpoint → Mind Map stub modal appears
6. Submit corrections → `{"type":"mind_map_submit","corrections":{...}}` sent
7. Complete session → WS closes 1000 → "View Feedback" overlay
8. Load `session.html` (no `?sessionId=`) → immediate redirect to dashboard
9. Load `session.html?sessionId=999` (invalid) → REST 404 → redirect to dashboard

### Step 12: Delete `script.js`

Only after all Step 11 checks pass.

---

## File Manifest

| Action | File | Notes |
|--------|------|-------|
| ❌ DELETE | `frontend/script2.js` | 121KB legacy clone |
| ❌ DELETE | `frontend/script.js` | 118KB (Step 12, after verification) |
| ✏️ MODIFY | `frontend/session.html` | Remove dead scripts, add stub modals |
| ✏️ MODIFY | `frontend/apiClient.js` | Strip dead endpoints |
| ✏️ MODIFY | `frontend/sessionStore.js` | Remove legacy sync |
| ✏️ MODIFY | `frontend/js/core/dom.js` | Add new element refs |
| ✅ CREATE | `frontend/session.js` | New entry point (~150 lines) |
| ✅ CREATE | `frontend/js/core/WebSocketManager.js` | WS lifecycle (~120 lines) |
| ✅ CREATE | `frontend/js/core/SessionState.js` | State mirror (~100 lines) |
| ✅ CREATE | `frontend/js/core/UIRenderer.js` | DOM manipulation (~400 lines) |

**Net change: ~240KB removed, ~770 lines of clean modular code added.**

---

## WebSocket JSON Contract

### Client → Server

#### 1. Chat Message
```json
{"type": "chat", "text": "Neural networks use layers of connected neurons"}
```

#### 2. Mind Map Corrections
```json
{
  "type": "mind_map_submit",
  "corrections": {
    "Neurons and layers": "Neurons connect in layers where each connection has a weight",
    "Backpropagation": ""
  }
}
```
*Empty string = no correction (user approved Kido's understanding).*

#### 3. Widget Submission (PROCESS)
```json
{
  "type": "widget_submit",
  "submitted_data": {
    "steps": ["Step 1: Gather data", "Step 2: Clean data", "Step 3: Train model", "Step 4: Evaluate"]
  }
}
```

#### 4. Widget Submission (COMPARISON)
```json
{
  "type": "widget_submit",
  "submitted_data": {
    "attributes": [
      {"text": "Uses labeled data", "category": "Supervised Learning"},
      {"text": "Finds hidden patterns", "category": "Unsupervised Learning"}
    ]
  }
}
```

### Server → Client

#### 5. Kido Response (Normal)
```json
{
  "type": "kido_response",
  "data": {
    "kido_response": "Oh wow, so each neuron gets inputs from the previous layer!",
    "evaluator_label": "CORRECT",
    "widget_type": "TEXT",
    "widget_data": null,
    "advanced": false,
    "session_state": {
      "current_topic_index": 0,
      "current_point_index": 1,
      "point_attempts": 2,
      "topics": [{"topic_title": "...", "points": [{"bkt_score": 0.65, "status": "in_progress"}]}]
    }
  }
}
```

#### 6. Topic Checkpoint (Mind Map Pause)
```json
{
  "type": "kido_response",
  "data": {
    "kido_response": "Here is what I learned! Check my Mind Map!",
    "widget_type": "mind_map",
    "advanced": true,
    "topic_checkpoint": true,
    "mind_map_data": [
      {"title": "Treasure Hunt", "summary": "Linked list traversal is like following clues"},
      {"title": "Stack Overflow", "summary": "Recursive calls pile up like plates"}
    ],
    "session_state": {}
  }
}
```

#### 7. Session Complete
```json
{
  "type": "session_complete",
  "data": {
    "kido_response": "Thank you for being the most amazing teacher!",
    "session_state": {}
  }
}
```
*Followed by WS close with code `1000`.*

#### 8. Error
```json
{"type": "error", "detail": "Session 42 not found."}
```
