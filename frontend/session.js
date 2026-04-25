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
  ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, []);
  ui.updateBktProgress(state.getAggregatedBkt());
  ui.updateHud('waiting');
  ui.updateConceptCard({ text: "I'm ready to learn! Explain the topic to me.", type: 'waiting', delta: 0 });

  // ── 5b. SLIDE DECK VIEWER — Initialize PDF from bootstrap ──
  (function initSlideViewer() {
    var pdfUrl = state.pdfUrl;
    var fileType = state.fileType || null;
    var hasPreview = state.hasPreview === true;
    var deckStatus = state.deckStatus || null;
    var hasRealPdf = hasPreview
        && fileType === 'pdf'
        && typeof pdfUrl === 'string'
        && /^https?:\/\//i.test(pdfUrl);
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
      state.updateFromWsResponse(data);

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
      });

      ui.updateHud(label);
      ui.updateBktProgress(newBkt);
      ui.updateConceptCard({ text: data.kido_response || '', type: knowledgeType, delta: delta });
      ui.setCubeState((data.widget_type || 'TEXT').toString());
      ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, []);
    } catch (err) {
      console.error('[Session] FATAL in onKidoResponse:', err, err.stack);
      ui.setChatLockout(false);
    }
  };

  // ── Mind Map checkpoint ──
  ws.onMindMap = function (data) {
    try {
      state.updateFromWsResponse(data);
      ui.appendKidoMessage(data.kido_response || 'Check my Mind Map!').then(function () {
        ui.showMindMapModal(data.mind_map_data || []);
        ui.setChatLockout(true);
      });
    } catch (err) {
      console.error('[Session] FATAL in onMindMap:', err, err.stack);
      ui.setChatLockout(false);
    }
  };

  // ── Session complete ──
  ws.onSessionComplete = function (data) {
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
    ui.appendHintMessage(data.hint_text || data.kido_response || '');
  };

  // ── WS error ──
  ws.onError = function (detail) {
    console.error('[Session] WS error:', detail);
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

  // ── Cube Button (opens widget modal) ──
  if (dom.btnRequestGraph) {
    dom.btnRequestGraph.addEventListener('click', async function () {
      if (!state.lastWidgetData || state.lastWidgetType === 'TEXT') return;
      try {
        ui.setChatLockout(true);
        ui.updateHud('thinking');
        var response = await window.LearnBackAPI.fetchWidgetState(state.sessionId);
        ui.showWidgetModal(response.widget_type || state.lastWidgetType, response.widget_data || state.lastWidgetData);
      } catch (err) {
        console.error('[Session] fetchWidgetState failed:', err);
        ui.showWidgetModal(state.lastWidgetType, state.lastWidgetData);
      } finally {
        ui.setChatLockout(false);
        ui.updateHud('waiting');
      }
    });
  }

  // ── Widget Submit (C3 stub) ──
  if (dom.btnWidgetSubmit) {
    dom.btnWidgetSubmit.addEventListener('click', function () {
      var submission = ui.getWidgetSubmission();
      ws.send({ type: 'widget_submit', submitted_data: submission });
      ui.hideWidgetModal();
      ui.setChatLockout(true);
      ui.updateHud('thinking');
    });
  }

  // ── Widget Cancel ──
  if (dom.btnWidgetCancel) {
    dom.btnWidgetCancel.addEventListener('click', function () {
      ui.hideWidgetModal();
    });
  }

  // ── Mind Map Submit (C3 stub) ──
  if (dom.btnMindmapSubmit) {
    dom.btnMindmapSubmit.addEventListener('click', function () {
      var corrections = ui.getMindMapCorrections();
      ws.send({ type: 'mind_map_submit', corrections: corrections });
      ui.hideMindMapModal();
      ui.setChatLockout(true);
      ui.updateHud('thinking');
      state.clearMindMap();
    });
  }

  // ── Mind Map Skip ──
  if (dom.btnMindmapSkip) {
    dom.btnMindmapSkip.addEventListener('click', function () {
      ws.send({ type: 'mind_map_submit', corrections: {} });
      ui.hideMindMapModal();
      ui.setChatLockout(true);
      ui.updateHud('thinking');
      state.clearMindMap();
    });
  }

  // ── View Feedback (session complete overlay) ──
  if (dom.btnViewFeedback) {
    dom.btnViewFeedback.addEventListener('click', function () {
      window.location.href = 'feedback.html?sessionId=' + encodeURIComponent(state.sessionId);
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

  console.log('[Session] Orchestrator initialized. Session:', sessionId);

  
  // ── Right-panel collapse toggle ──
  var btnCollapseRight = document.getElementById('btn-collapse-right');
  if (btnCollapseRight) {
    btnCollapseRight.addEventListener('click', function () {
      var panel = document.getElementById('right-panel') || document.querySelector('.right-panel');
      if (panel) panel.classList.toggle('collapsed');
      uiManager.setRightPanelView('status');
    });
  }
  
  var btnCollapseLeft = document.getElementById('btn-collapse-left');
  if (btnCollapseLeft) {
    btnCollapseLeft.addEventListener('click', function () {
      uiManager.setRightPanelView('status');
    });
  }

  // ── Panel Switch Buttons ──
  var btnKidoLearned = document.getElementById('btn-kido-learned');
  if (btnKidoLearned) {
    btnKidoLearned.addEventListener('click', function() { uiManager.setRightPanelView('kwl'); });
  }

  var btnMisconceptions = document.getElementById('btn-misconceptions');
  if (btnMisconceptions) {
    btnMisconceptions.addEventListener('click', function() { uiManager.setRightPanelView('misconceptions'); });
  }

  // ── Back Buttons ──
  var backKwl = document.getElementById('btn-back-kwl');
  if (backKwl) backKwl.addEventListener('click', function() { uiManager.setRightPanelView('status'); });
  
  var backMisc = document.getElementById('btn-back-misconceptions');
  if (backMisc) backMisc.addEventListener('click', function() { uiManager.setRightPanelView('status'); });

  var backStatus = document.getElementById('btn-back-status');
  if (backStatus) backStatus.addEventListener('click', function() { uiManager.setRightPanelView('status'); });

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
    btnTriggerMindmap.addEventListener('click', async function() {
      try {
        ui.setChatLockout(true);
        ui.updateHud('thinking');
        var response = await window.LearnBackAPI.fetchMindMap(state.sessionId);
        ui.showMindMapModal(response.mind_map_data || []);
      } catch (err) {
        console.error('[Session] fetchMindMap error:', err);
        ui.appendKidoMessage("I couldn't generate my mind map right now.");
      } finally {
        ui.updateHud('waiting');
      }
    });
  }

  // ── Skip Topic Flow ──
  var pendingSkipIndex = null;
  var topicList = document.getElementById('topic-list');
  if (topicList) {
    topicList.addEventListener('click', function(e) {
      var card = e.target.closest('.topic-card[data-action="skip_topic"]');
      if (card) {
        var targetIndex = parseInt(card.getAttribute('data-target-index'), 10);
        if (!isNaN(targetIndex)) {
          pendingSkipIndex = targetIndex;
          var modal = document.getElementById('modal-skip-topic');
          if (modal) modal.removeAttribute('hidden');
        }
      }
    });
  }

  var btnCancelSkip = document.getElementById('btn-modal-cancel-skip');
  if (btnCancelSkip) {
    btnCancelSkip.addEventListener('click', function() {
      var modal = document.getElementById('modal-skip-topic');
      if (modal) modal.setAttribute('hidden', '');
      pendingSkipIndex = null;
    });
  }

  var btnConfirmSkip = document.getElementById('btn-modal-confirm-skip');
  if (btnConfirmSkip) {
    btnConfirmSkip.addEventListener('click', async function() {
      var modal = document.getElementById('modal-skip-topic');
      if (modal) modal.setAttribute('hidden', '');

      try {
        ui.setChatLockout(true);
        ui.updateHud('thinking');
        
        // 1. Fetch mind map snapshot and show
        var response = await window.LearnBackAPI.fetchMindMap(state.sessionId);
        ui.showMindMapModal(response.mind_map_data || []);

        // 2. Perform the skip via HTTP POST
        var skipResponse = await window.LearnBackAPI.skipTopic(state.sessionId);
        if (skipResponse && skipResponse.session_state) {
          state.updateFromWsResponse({ session_state: skipResponse.session_state });
          ui.renderTopicList(state.getTopicTitles(), state.currentTopicIndex, []);
        }

      } catch (err) {
        console.error('[Session] skipTopic flow failed:', err);
      }
    });
  }

})();
