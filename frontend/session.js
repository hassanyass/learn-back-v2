/**
 * session.js — Phase 3 Session Engine Orchestrator
 *
 * Replaces the legacy monolithic script.js + script2.js.
 * Implements:
 *   - C2: Boot Failsafe (redirect on missing/invalid sessionId)
 *   - WebSocket-driven chat (no HTTP POST)
 *   - Real-time BKT/HUD/Roadmap updates from backend state
 *   - C3: Mind Map & Widget stub modal wiring
 *   - C1: Lottie animation preservation (via window.KidoLottie)
 */

import { SessionState } from './js/core/SessionState.js';
import { WebSocketManager } from './js/core/WebSocketManager.js';
import { UIRenderer } from './js/core/UIRenderer.js';
import { dom } from './js/core/dom.js';
import { UIStateManager } from './js/core/UIStateManager.js';

(async function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // 1. THEME TOGGLE (preserved from script.js L12-46)
  // ═══════════════════════════════════════════════════════════

  (function initTheme() {
    var saved = localStorage.getItem('lb-theme') || 'light';
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeUI(saved);

    var btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('lb-theme', 'light');
          updateThemeUI('light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('lb-theme', 'dark');
          updateThemeUI('dark');
        }
      });
    }

    function updateThemeUI(theme) {
      var sun = document.querySelector('.theme-icon-sun');
      var moon = document.querySelector('.theme-icon-moon');
      var label = document.querySelector('.theme-toggle-text');
      if (theme === 'dark') {
        if (sun) sun.style.display = 'inline-block';
        if (moon) moon.style.display = 'none';
        if (label) label.textContent = 'Light';
      } else {
        if (sun) sun.style.display = 'none';
        if (moon) moon.style.display = 'inline-block';
        if (label) label.textContent = 'Dark';
      }
    }
  })();

  // ═══════════════════════════════════════════════════════════
  // 2. C2 BOOT FAILSAFE — Parse sessionId, redirect if missing
  // ═══════════════════════════════════════════════════════════

  var sessionId = new URLSearchParams(window.location.search).get('sessionId');
  if (!sessionId) {
    console.error('[Session] No ?sessionId= in URL. Redirecting to dashboard.');
    window.location.href = 'dashboard.html';
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 3. INSTANTIATE UI RENDERER & SHOW LOADING
  // ═══════════════════════════════════════════════════════════

  var ui = new UIRenderer(dom);
  var uiManager = new UIStateManager(dom);
  ui.showLoading();
  ui.setChatLockout(true);

  // ═══════════════════════════════════════════════════════════
  // 4. REST BOOTSTRAP — Fetch session state, redirect on failure
  // ═══════════════════════════════════════════════════════════

  var state;
  try {
    var bootstrapData = await window.LearnBackAPI.fetchSession(sessionId);
    if (!bootstrapData) throw new Error('Empty response from fetchSession');
    state = new SessionState(bootstrapData);
    console.log('[Session] REST bootstrap complete:', state.sessionTitle, '| Topics:', state.topics.length);
  } catch (err) {
    console.error('[Session] REST bootstrap failed. Redirecting to dashboard.', err);
    window.location.href = 'dashboard.html';
    return;
  }

  // ── 4b. SESSION VALIDATION — Require topics before proceeding ──
  if (!state.topics || state.topics.length === 0) {
    console.error('[Session] No topics found in session state. Cannot start session.');
    ui.hideLoading();
    if (dom.chatMessages) {
      dom.chatMessages.innerHTML =
        '<div style="text-align:center; padding:60px; color:var(--plum, #925E78);">' +
        '<p style="font-size:18px; font-weight:600; margin-bottom:12px;">This session could not be initialized properly.</p>' +
        '<p style="font-size:14px; opacity:0.7; margin-bottom:24px;">No topics were found. Please re-upload your slides.</p>' +
        '<a href="upload_slides.html" style="display:inline-block; padding:10px 24px; background:var(--plum, #925E78); color:#fff; border-radius:8px; text-decoration:none; font-weight:500;">Re-upload Slides</a>' +
        '</div>';
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 5. POPULATE UI FROM REST DATA (before WS opens)
  // ═══════════════════════════════════════════════════════════

  ui.updateSessionTitle(state.sessionTitle);
  ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, state.skippedIndices || []);
  ui.updateBktProgress(state.getAggregatedBkt());
  ui.updateHud('waiting');
  ui.updateConceptCard({ text: "I'm ready to learn! Explain the topic to me.", type: 'waiting', delta: 0 });
  ui.setCubeState('TEXT'); // start dimmed; activates when backend sends a non-TEXT widget

  // ── 5b. SLIDE DECK VIEWER — Initialize PDF from bootstrap ──
  (function initSlideViewer() {
    var pdfUrl = state.pdfUrl;
    var fileType = state.fileType || null;
    var hasPreview = state.hasPreview === true;
    var deckStatus = state.deckStatus || null;
    var isDemoSession = state.sourceType === 'demo';
    var hasDemoPdf = isDemoSession
      && typeof pdfUrl === 'string'
      && /^https?:\/\//i.test(pdfUrl);
    var hasRealPdf = (hasPreview
      && fileType === 'pdf'
      && typeof pdfUrl === 'string'
      && /^https?:\/\//i.test(pdfUrl))
      || hasDemoPdf;
    var fallbackMessage = 'Learning Session Ready\nSlide deck preview is not available.';

    if (!hasRealPdf && deckStatus === 'UPLOAD_FAILED') {
      fallbackMessage = 'Learning Session Ready\nUpload failed, but learning session is still available.';
    }

    // Wire "View Slides" button
    if (dom.btnOpenSlides) {
      if (hasRealPdf) {
        dom.btnOpenSlides.addEventListener('click', function () {
          if (dom.slideDeckOverlay) dom.slideDeckOverlay.removeAttribute('hidden');
          // Lazy-load PDF on first open
          if (window.LearnBackPDF && !dom.btnOpenSlides._pdfLoaded) {
            window.LearnBackPDF.open(pdfUrl);
            dom.btnOpenSlides._pdfLoaded = true;
          }
        });
      } else {
        // No PDF available — disable button with tooltip
        dom.btnOpenSlides.disabled = true;
        dom.btnOpenSlides.title = 'Slide deck is not available for preview';
        dom.btnOpenSlides.style.opacity = '0.4';
        dom.btnOpenSlides.style.cursor = 'default';
      }
    }

    // Wire "Close Slides" button
    if (dom.btnCloseSlides) {
      dom.btnCloseSlides.addEventListener('click', function () {
        if (dom.slideDeckOverlay) dom.slideDeckOverlay.setAttribute('hidden', '');
      });
    }

    // If slide placeholder element exists, show status message
    if (dom.pdfPlaceholder) {
      dom.pdfPlaceholder.textContent = hasRealPdf
        ? 'Click "View Slides" to open your uploaded deck.'
        : fallbackMessage;
      dom.pdfPlaceholder.style.whiteSpace = 'pre-line';
    }
  })();

  // ═══════════════════════════════════════════════════════════
  // 6. WEBSOCKET — Connect and wire callbacks
  // ═══════════════════════════════════════════════════════════

  var ws = new WebSocketManager(sessionId);

  // ── Connection state handler ──
  ws.onConnectionChange = function (connState) {
    ui.showConnectionState(connState);
    if (connState === 'connected') {
      ui.hideLoading();
      ui.setChatLockout(false);
      ui.updateHud('waiting');
      console.log('[Session] WebSocket connected. Chat enabled.');
    }
  };

  // ── Normal Kido response ──
  ws.onKidoResponse = function (data) {
    try {
      var oldPointIndex = state.currentPointIndex;
      state.updateFromWsResponse(data);
      var newPointIndex = state.currentPointIndex;

      // Clear STALE widget if point boundary changed (lifecycle bound)
      if (oldPointIndex !== undefined && newPointIndex !== oldPointIndex) {
        state.pendingWidget = null;
      }

      console.log('[DEBUG_WIDGET] received widget_type:', data.widget_type);

      ui.renderMisconceptions(state);

      // Determine evaluator label and knowledge type
      var label = (data.evaluator_label || data.label || 'waiting').toLowerCase();
      var knowledgeType = 'developing';
      if (label === 'correct') knowledgeType = 'mastered';
      else if (label === 'incorrect' || label === 'misconception') knowledgeType = 'revising';

      // Calculate BKT delta
      var newBkt = state.getAggregatedBkt();
      var oldBkt = ui._currentProgress || 0;
      var delta = newBkt - oldBkt;

      // Update all UI components
      ui.appendKidoMessage(data.kido_response || "I'm thinking...").then(function () {
        ui.setChatLockout(false);
      }).catch(function () {
        ui.setChatLockout(false);
      });

      ui.updateHud(label);
      ui.updateBktProgress(newBkt);
      ui.updateConceptCard({ text: data.kido_response || '', type: knowledgeType, delta: delta });
      ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, state.skippedIndices || []);

      // (Process widget feedback is handled locally in UIRenderer._localProcessEvaluate)

      // ── TEST MODE: pending widget tracking ──
      // If this response has an interactive widget, store it
      var wType = (data.widget_type || 'TEXT').toUpperCase();
      if (wType !== 'TEXT' && wType !== 'MIND_MAP') {
        state.pendingWidget = {
          type: wType,
          data: data.widget_data || null,
          debug: data.widget_debug || null
        };
        console.log('[DEBUG_WIDGET] pendingWidget assignment:', state.pendingWidget);
        if (data.widget_debug) {
          console.log('[TEST_MODE] widget_debug:', JSON.stringify(data.widget_debug, null, 2));
        }
      }

      // (Removed aggressive wipe based on data.advanced — widgets are bound to point lifecycle)

      // Cube reflects PENDING state, not just latest message
      if (state.pendingWidget) {
        console.log('[DEBUG_WIDGET] cube state update to:', state.pendingWidget.type);
        ui.setCubeState(state.pendingWidget.type);
      } else {
        console.log('[DEBUG_WIDGET] cube state update to: TEXT');
        ui.setCubeState('TEXT');
      }
    } catch (err) {
      console.error('[Session] FATAL in onKidoResponse:', err, err.stack);
      ui.setChatLockout(false);
    }
  };

  // ── KWL Real-Time Update ──
  ws.onKWLUpdate = function (kwlItem) {
    console.log("KWL UPDATE:", kwlItem);
    if (!state.kwl) {
      state.kwl = { l: [] };
    }
    state.kwl.l.push(kwlItem);
    ui.updateKWLTab(state.kwl.l);
  };

  // ── Mind Map Orchestration ──
  var _pendingCorrections = {};
  
  function displayMindMap(graphData, targetIdx) {
    if (targetIdx === undefined) targetIdx = null;
    _pendingCorrections = {};
    console.log('[MindMap] displayMindMap called. targetIdx:', targetIdx, 'graphData:', graphData);
    ui.renderKnowledgeCubeWidget(
      graphData,
      function(nodeTitle, correctionText) {
        console.log('[MindMap] Correction submitted:', nodeTitle, correctionText);
        _pendingCorrections[nodeTitle] = correctionText;
      },
      function() {
        try {
          // Guard: if WS is not connected, ws.send() silently returns (no throw)
          // but still sets the lockout — causing a permanent freeze.
          if (!ws.isConnected) {
            ui.setChatLockout(false);
            ui.updateHud('waiting');
            ui.appendKidoMessage("Connection lost. Please refresh the page and try again.");
            return;
          }

          var payload = { type: 'mind_map_submit', corrections: _pendingCorrections };
          var parsedTargetIdx = (targetIdx !== null && targetIdx !== undefined)
            ? parseInt(targetIdx, 10) : null;
          if (parsedTargetIdx !== null && !isNaN(parsedTargetIdx)) {
            payload.target_topic_index = parsedTargetIdx;
          }
          console.log('[MindMap] Continue clicked! Sending WS payload:', JSON.stringify(payload));
          ws.send(payload);
          console.log('[MindMap] WS payload sent successfully.');
          ui.setChatLockout(true);
          ui.updateHud('thinking');
          state.clearMindMap();

          // Optimistically update the topic highlight so it changes immediately
          // rather than waiting for the backend session_state in the response.
          if (parsedTargetIdx !== null && !isNaN(parsedTargetIdx)) {
            state.currentTopicIndex = parsedTargetIdx;
          } else if (targetIdx === undefined || targetIdx === null) {
            // Checkpoint flow: next topic is currentTopicIndex already advanced by backend
            // during the checkpoint response — nothing to optimistically override.
          }
          ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, state.skippedIndices || []);
        } catch (err) {
          console.error('[MindMap] FATAL ERROR in onContinueCallback:', err, err.stack);
          ui.setChatLockout(false);
          ui.updateHud('waiting');
        }
      }
    );
  }

  // ── Mind Map checkpoint ──
  ws.onMindMap = function (data) {
    try {
      state.updateFromWsResponse(data);
      // After all points in the current topic are done, the next topic is currentTopicIndex + 1
      var nextTopicIdx = state.currentTopicIndex + 1;
      console.log('[MindMap] Topic checkpoint. Current topic:', state.currentTopicIndex, '→ next:', nextTopicIdx);
      ui.appendKidoMessage(data.kido_response || 'Check my Mind Map!').then(function () {
        displayMindMap(data.mind_map_data || [], nextTopicIdx);
        ui.setChatLockout(true);
      }).catch(function (err) {
        console.error('[Session] appendKidoMessage failed in onMindMap:', err);
        ui.setChatLockout(false);
        ui.updateHud('waiting');
      });
    } catch (err) {
      console.error('[Session] FATAL in onMindMap:', err, err.stack);
      ui.setChatLockout(false);
    }
  };

  // ── Session complete ──
  ws.onSessionComplete = function (data) {
    if (isEndingSession) {
      console.log('[Session] onSessionComplete suppressed — manual end in progress');
      return;
    }
    try {
      state.updateFromWsResponse(data);
      state.markComplete();
      ui.appendKidoMessage(data.kido_response || 'Session complete!').then(function () {
        ui.showSessionCompleteOverlay(state.sessionId);
      });
    } catch (err) {
      console.error('[Session] FATAL in onSessionComplete:', err, err.stack);
    }
  };

  // ── System hint ──
  ws.onSystemHint = function (data) {
    ui.appendHintMessage(data.hint_text).then(function () {
      ui.setChatLockout(false);
      ui.updateHud('waiting');
    });
  };

  // ── WS error ──
  ws.onError = function (detail) {
    console.error('[Session] WS error:', detail);
    // Unlock chat so the user is never permanently stuck after a WS failure.
    ui.setChatLockout(false);
    ui.updateHud('waiting');
  };

  // Open the connection
  ws.connect();

  // ═══════════════════════════════════════════════════════════
  // 7. WIRE DOM EVENTS
  // ═══════════════════════════════════════════════════════════

  // ── Start Session Gate ──
  if (dom.btnStartSession) {
    dom.btnStartSession.addEventListener('click', function () {
      // Play start sound
      var startSound = new Audio('sounds/start.mp3');
      startSound.play().catch(function () { });

      // Hide welcome, enable input
      if (dom.chatWelcome) {
        dom.chatWelcome.style.opacity = '0';
        setTimeout(function () { dom.chatWelcome.style.display = 'none'; }, 500);
      }

      ui.setChatLockout(true);
      ui.updateHud('thinking');

      // Kido's opening greeting
      var greeting = state.topics.length
        ? "I'm ready to learn about " + state.getCurrentTopicTitle() + ". Teach it to me in your own words!"
        : "I'm ready to learn! Start with the first idea when you're ready.";

      ui.appendKidoMessage(greeting).then(function () {
        ui.setChatLockout(false);
        ui.updateHud('waiting');
      });
    });
  }

  // ── Chat Send (button) ──
  if (dom.btnSend) {
    dom.btnSend.addEventListener('click', function () {
      sendChat();
    });
  }

  // ── Chat Send (Enter key) ──
  if (dom.chatInputField) {
    dom.chatInputField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
  }

  function sendChat() {
    if (!ws.isConnected) return;
    var text = dom.chatInputField ? dom.chatInputField.value.trim() : '';
    if (!text) return;

    // Show user message and lock UI
    ui.appendUserMessage(text);
    ui.setChatLockout(true);
    ui.updateHud('thinking');
    ui.updateConceptCard({ text: "I'm thinking about that. Keep going.", type: 'thinking', delta: 0 });

    // Send over WebSocket
    ws.send({ type: 'chat', text: text });

    // Clear input
    if (dom.chatInputField) {
      dom.chatInputField.value = '';
      dom.chatInputField.style.height = 'auto';
      dom.chatInputField.style.height = '44px';
    }
  }

  // ── Cube Button (reveals inline widget) ──
  if (dom.btnRequestGraph) {
    dom.btnRequestGraph.addEventListener('click', async function () {
      try {
        // Use stored pending widget (no API roundtrip)
        if (state.pendingWidget) {
          var wState = state.pendingWidget;
          ui.setCubeState('TEXT'); // clear glow

          ui.renderInlineWidget(wState, function (submission, msgWrapper) {
            ws.send({
              type: 'widget_submit',
              submitted_data: submission
            });
            state.pendingWidget = null;
            ui.setChatLockout(true);
            ui.updateHud('thinking');
            if (msgWrapper) {
              var btn = msgWrapper.querySelector('.widget-submit-btn');
              if (btn) {
                btn.textContent = 'Submitted!';
                btn.style.background = '#94a3b8';
                btn.style.boxShadow = '0 4px 0 #64748b';
              }
            }
          });
          return;
        }

        // Fallback: fetch from API (legacy path)
        ui.setChatLockout(true);
        ui.updateHud('thinking');
        var response = await window.LearnBackAPI.fetchWidgetState(state.sessionId);

        if (response.widget_status !== 'ready') {
          ui.appendKidoMessage("There is no interactive widget available right now.");
          return;
        }

        var simulatedState = { type: response.widget_type, data: response.widget_data };
        ui.setCubeState('TEXT');

        ui.renderInlineWidget(simulatedState, function (submission, msgWrapper) {
          ws.send({
            type: 'widget_submit',
            submitted_data: submission
          });
          ui.setChatLockout(true);
          ui.updateHud('thinking');
        });
      } catch (err) {
        console.error('[Session] fetchWidgetState failed:', err);
      } finally {
        ui.setChatLockout(false);
        ui.updateHud('waiting');
      }
    });
  }

  // Legacy modal buttons removed - Knowledge Cube handles interactions internally.

   // ── View Feedback (session complete overlay) ──
  if (dom.btnViewFeedback) {
    dom.btnViewFeedback.addEventListener('click', function () {
      window.location.href = 'feedback.html?sessionId=' + encodeURIComponent(state.sessionId);
    });
  }

  // ── End Session Flow ──
  var isEndingSession = false;
  var endConfirmOverlay = document.getElementById('end-session-confirm-overlay');
  var endLoadingOverlay = document.getElementById('end-session-loading-overlay');
  var btnEndCancel = document.getElementById('btn-end-cancel');
  var btnEndConfirm = document.getElementById('btn-end-confirm');
  var btnFinish = document.getElementById('btn-finish');
  var btnHeaderActions = document.getElementById('btn-header-actions');
  var headerDropdown = document.getElementById('header-dropdown');

  // Shared handler: show confirmation modal (or redirect if already complete)
  function showEndSessionConfirm() {
    console.log('[EndSession] "End Session" clicked');
    // Hide dropdown if open
    if (headerDropdown) headerDropdown.style.display = 'none';

    // If already completed naturally, just redirect
    if (state.isSessionComplete) {
      console.log('[EndSession] Already completed naturally — redirecting');
      window.location.href = 'feedback.html?sessionId=' + encodeURIComponent(state.sessionId);
      return;
    }

    // Show confirmation modal
    if (endConfirmOverlay) endConfirmOverlay.removeAttribute('hidden');
  }

  // Wire BOTH the main "End Session" button AND the dropdown "Finish Teaching"
  if (btnHeaderActions) {
    btnHeaderActions.addEventListener('click', function (e) {
      e.stopPropagation();
      showEndSessionConfirm();
    });
  }
  if (btnFinish) {
    btnFinish.addEventListener('click', function () {
      showEndSessionConfirm();
    });
  }

  // Cancel → hide modal
  if (btnEndCancel && endConfirmOverlay) {
    btnEndCancel.addEventListener('click', function () {
      endConfirmOverlay.setAttribute('hidden', '');
    });
  }

  // Confirm → end session
  if (btnEndConfirm) {
    btnEndConfirm.addEventListener('click', async function () {
      if (isEndingSession) return; // Prevent double-click
      isEndingSession = true;
      ws._isEndingSession = true;
      console.log('[EndSession] User confirmed. Disconnecting WS...');

      // Hide confirmation, show loading
      if (endConfirmOverlay) endConfirmOverlay.setAttribute('hidden', '');
      if (endLoadingOverlay) endLoadingOverlay.removeAttribute('hidden');

      // Disconnect WS first (suppresses reconnect via _isEndingSession)
      if (ws && typeof ws.close === 'function') {
        ws.close();
      }

      try {
        var result = await window.LearnBackAPI.endSession(state.sessionId);
        console.log('[EndSession] Success:', result);
        console.log('[EndSession] Redirecting to feedback page.');
        window.location.href = 'feedback.html?sessionId=' + encodeURIComponent(state.sessionId);
      } catch (err) {
        console.error('[EndSession] Failed:', err);
        isEndingSession = false;
        ws._isEndingSession = false;
        if (endLoadingOverlay) endLoadingOverlay.setAttribute('hidden', '');
        ui.appendKidoMessage('Something went wrong ending the session. Please try again.');
      }
    });
  }

  // ── Mute button ──
  var btnMute = document.getElementById('btn-mute-sounds');
  if (btnMute && window.AudioManager) {
    btnMute.addEventListener('click', function () {
      var muted = window.AudioManager.toggleMute();
      var icon = btnMute.querySelector('svg');
      if (icon) icon.style.opacity = muted ? '0.4' : '1';
    });
  }

  // ── Hint Button (triggers HTTP fetchHint) ──
  var btnHint = document.getElementById('btn-spark');
  if (btnHint) {
    btnHint.addEventListener('click', async function () {
      if (!ws.isConnected) return;
      try {
        ui.setChatLockout(true);
        ui.updateHud('thinking');
        await window.LearnBackAPI.fetchHint(state.sessionId);
      } catch (err) {
        console.error('[Session] fetchHint failed:', err);
        ui.appendHintMessage("I couldn't think of a hint right now. Let's keep trying!");
        ui.setChatLockout(false);
        ui.updateHud('waiting');
      }
    });
  }

  console.log('[Session] Orchestrator initialized. Session:', sessionId);


  // ── Right-panel collapse toggle ──
  var btnCollapseRight = document.getElementById('btn-collapse-right');
  if (btnCollapseRight) {
    btnCollapseRight.addEventListener('click', function () {
      var panel = document.getElementById('right-panel');
      if (panel) panel.classList.toggle('is-collapsed');
      uiManager.setRightPanelView('status');
    });
  }

  var btnCollapseLeft = document.getElementById('btn-collapse-left');
  if (btnCollapseLeft) {
    btnCollapseLeft.addEventListener('click', function () {
      var panel = document.getElementById('ai-panel');
      if (panel) panel.classList.toggle('is-collapsed');
    });
  }

  // ── Panel Switch Buttons ──
  var btnKidoLearned = document.getElementById('btn-kido-learned');
  if (btnKidoLearned) {
    btnKidoLearned.addEventListener('click', function () { uiManager.setRightPanelView('kwl'); });
  }

  var btnMisconceptions = document.getElementById('btn-misconceptions');
  if (btnMisconceptions) {
    btnMisconceptions.addEventListener('click', function () { uiManager.setRightPanelView('misconceptions'); });
  }

  // ── Back Buttons ──
  var backKwl = document.getElementById('btn-back-kwl');
  if (backKwl) backKwl.addEventListener('click', function () { uiManager.setRightPanelView('status'); });

  var backMisc = document.getElementById('btn-back-misconceptions');
  if (backMisc) backMisc.addEventListener('click', function () { uiManager.setRightPanelView('status'); });

  var backStatus = document.getElementById('btn-back-status');
  if (backStatus) backStatus.addEventListener('click', function () { uiManager.setRightPanelView('status'); });

  // ── KWL & Misconception Card Expand (Delegated) ──
  function toggleCardExpand(e) {
    var card = e.target.closest('.thought-card');
    if (card) {
      card.classList.toggle('expanded');
    }
  }
  var kwlStream = document.getElementById('kwl-stream');
  if (kwlStream) kwlStream.addEventListener('click', toggleCardExpand);

  var miscStream = document.getElementById('misconceptions-stream');
  if (miscStream) miscStream.addEventListener('click', toggleCardExpand);

  // ── New Mind Map Button ──
  var btnTriggerMindmap = document.getElementById('btn-trigger-mindmap');
  if (btnTriggerMindmap) {
    btnTriggerMindmap.addEventListener('click', async function () {
      try {
        ui.setChatLockout(true);
        ui.updateHud('thinking');
        var response = await window.LearnBackAPI.fetchMindMap(state.sessionId);
        displayMindMap(response.mind_map_data);
        // Chat stays locked until user clicks Continue → backend responds → onKidoResponse unlocks.
      } catch (err) {
        console.error('[Session] fetchMindMap error:', err);
        ui.appendKidoMessage("Hmm, I don't have enough notes to show my mind map yet. Keep teaching and I'll build it as I learn!");
        ui.setChatLockout(false);
        ui.updateHud('waiting');
      }
    });
  }

  // ── Skip Topic Flow ──
  var pendingSkipIndex = null;
  var topicList = document.getElementById('topic-list');
  if (topicList) {
    topicList.addEventListener('click', function (e) {
      var card = e.target.closest('.topic-card[data-action="skip_topic"]');
      if (card) {
        var targetIndex = parseInt(card.getAttribute('data-target-index'), 10);
        if (!isNaN(targetIndex)) {
          pendingSkipIndex = targetIndex;
          var modal = document.getElementById('modal-skip-topic');
          if (modal) {
            modal.removeAttribute('hidden');
            var nameEl = document.getElementById('skip-topic-name');
            var topicTitle = card.querySelector('.topic-title') ? card.querySelector('.topic-title').textContent : 'this topic';
            if (nameEl) nameEl.textContent = topicTitle;
            modal.setAttribute('data-target-idx', targetIndex);
          }
        }
      }
    });
  }

  var btnCancelSkip = document.getElementById('btn-modal-cancel-skip');
  if (btnCancelSkip) {
    btnCancelSkip.addEventListener('click', function () {
      var modal = document.getElementById('modal-skip-topic');
      if (modal) modal.setAttribute('hidden', '');
      pendingSkipIndex = null;
    });
  }

  var btnConfirmSkip = document.getElementById('btn-modal-confirm-skip');
  if (btnConfirmSkip) {
    btnConfirmSkip.addEventListener('click', async function () {
      var modal = document.getElementById('modal-skip-topic');
      var targetIdx = modal ? modal.getAttribute('data-target-idx') : null;
      console.log('[Skip] Confirm clicked. targetIdx:', targetIdx);
      if (modal) modal.setAttribute('hidden', '');

      try {
        ui.setChatLockout(true);
        ui.updateHud('thinking');

        // 1. Fetch mind map snapshot for CURRENT topic
        console.log('[Skip] Fetching mind map for session:', state.sessionId);
        var response = await window.LearnBackAPI.fetchMindMap(state.sessionId);
        console.log('[Skip] Mind map fetched:', response);
        displayMindMap(response.mind_map_data, targetIdx);

        // Note: The actual skip logic is now handled asynchronously when 
        // the user interacts with the Knowledge Cube and clicks Continue.
      } catch (err) {
        console.error('[Skip] skipTopic flow failed:', err);
        ui.setChatLockout(false);
        ui.updateHud('waiting');
      }
    });
  }

})();
