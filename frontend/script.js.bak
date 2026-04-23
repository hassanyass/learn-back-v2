/* ============================================================
   LearnBack — Teaching Session · Script
   NotebookLM-Style 3-Zone Workspace
   ============================================================ */

import { dom } from './js/core/dom.js';

(function () {
  'use strict';

  // ─── Theme Toggle (light / dark) ──────────────────────────
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

  // ─── DOM refs moved to js/core/dom.js ───

  // ─── State ────────────────────────────────────────────────
  function normalizeTopicList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (item) {
      return typeof item === 'string' ? item : (item && (item.title || item.name || 'Untitled Segment'));
    }).filter(function (topic) {
      return typeof topic === 'string' && topic.trim().length > 0;
    });
  }

  var sessionBootstrap = window.SessionStore && typeof window.SessionStore.getSession === 'function'
    ? window.SessionStore.getSession()
    : null;
  var savedCategories = [];
  try {
    var loaded = localStorage.getItem('learnback_categories');
    if (loaded) {
      savedCategories = normalizeTopicList(JSON.parse(loaded));
    }
  } catch (e) {
    console.error('Error loading categories:', e);
  }

  var initialTopics = normalizeTopicList(sessionBootstrap && sessionBootstrap.topics ? sessionBootstrap.topics : savedCategories);
  var initialProgress = Math.max(0, Math.min(100, Number(sessionBootstrap && sessionBootstrap.progress != null ? sessionBootstrap.progress : (localStorage.getItem('learnback_progress') || 0)) || 0));
  var initialTopicIndex = Math.max(0, Math.min(initialTopics.length ? initialTopics.length - 1 : 0, Number(sessionBootstrap && sessionBootstrap.topicIndex != null ? sessionBootstrap.topicIndex : (localStorage.getItem('learnback_topic_index') || 0)) || 0));
  var initialSessionTitle = (sessionBootstrap && sessionBootstrap.sessionTitle) || localStorage.getItem('learnback_session_title') || 'Machine Learning';

  var state = {
    sessionTitle: initialSessionTitle,
    currentTopic: initialTopicIndex,
    topics: initialTopics,
    skippedTopics: [], // Array of indices that were skipped
    progress: initialProgress,
    messageCount: 0,
    showingSlides: false,
    leftCollapsed: false,
    rightCollapsed: false,
    knowledge: [],   // [ { text, type:'mastered'|'developing'|'revising', time } ]

    // PDF state
    pdfDoc: null,
    pdfPage: 1, // Current viewed page (approximate based on scroll)
    pdfTotalPages: 0,
    pdfZoom: 1.0,
    pdfHighlightActive: false,
    pdfRendering: false,

    // Resize State
    isDragging: false,

    // Layout State
    isReviewMode: false,
  };

  if (dom.sessionTitle) dom.sessionTitle.textContent = state.sessionTitle;

  // Session responses now flow through the shared API client.

  // ─── Helpers ──────────────────────────────────────────────
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function ts() {
    var d = new Date();
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  function mood() {
    var moods = ['confused', 'encouraging', 'understanding', 'thinking'];
    var w = [1, 2, 3, 2];
    var total = w.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    var cum = 0;
    for (var i = 0; i < moods.length; i++) {
      cum += w[i];
      if (r < cum) return moods[i];
    }
    return 'thinking';
  }

  // ─── Topic navigation ─────────────────────────────────────
  function refreshTopicUI() {
    var hasTopics = state.topics.length > 0;
    var isComplete = hasTopics && state.currentTopic >= state.topics.length;
    var t = !hasTopics ? state.sessionTitle : (isComplete ? 'Session Complete' : state.topics[state.currentTopic]);
    if (dom.headerTopic) dom.headerTopic.textContent = t;

    // Re-render the roadmap timeline
    renderRoadmap();

    // Sync peek card topic
    if (dom.peekTopic) dom.peekTopic.textContent = t;
    var peekTopicEl = document.getElementById('peek-topic');
    if (peekTopicEl) peekTopicEl.textContent = t;

    // Sync Dashboard Topic Card
    var dashCount = document.getElementById('topic-dash-count');
    var dashTitle = document.getElementById('topic-dash-title');
    if (dashCount) {
      if (!hasTopics) dashCount.textContent = 'SESSION READY';
      else if (isComplete) dashCount.textContent = 'ALL TOPICS COMPLETED';
      else dashCount.textContent = 'TOPIC ' + (state.currentTopic + 1) + ' OF ' + state.topics.length;
    }
    if (dashTitle) dashTitle.textContent = t;
  }

  function navigateTopic(dir) {
    var next = state.currentTopic + dir;
    if (next < 0 || next >= state.topics.length) return;
    state.currentTopic = next;
    refreshTopicUI();
  }

  // ─── Icon-Led Topic Cards Engine ──────────────────────────────
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  var ICON_SKIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  function renderRoadmap() {
    var tl = dom.topicList;
    if (!tl) return;
    tl.innerHTML = '';

    if (!state.topics.length) {
      var empty = document.createElement('div');
      empty.className = 'topic-card topic-card--empty';
      empty.textContent = 'No session topics are loaded yet.';
      tl.appendChild(empty);
      return;
    }

    state.topics.forEach(function (topic, i) {
      var card = document.createElement('div');
      card.className = 'topic-card';

      // Icon tile
      var icon = document.createElement('div');
      icon.className = 'topic-icon';

      // Content wrapper
      var content = document.createElement('div');
      content.className = 'topic-content';

      var title = document.createElement('span');
      title.className = 'topic-title';
      title.textContent = topic;

      if (i < state.currentTopic) {
        if (state.skippedTopics.indexOf(i) !== -1) {
          // ── SKIPPED ──
          card.classList.add('is-skipped');
          icon.innerHTML = ICON_SKIP;
          content.appendChild(title);
          var badge = document.createElement('span');
          badge.className = 'topic-badge';
          badge.textContent = 'Skipped';
          content.appendChild(badge);
        } else {
          // ── PAST (Done) ──
          card.classList.add('is-past');
          icon.innerHTML = ICON_CHECK;
          content.appendChild(title);
        }

      } else if (i === state.currentTopic) {
        // ── CURRENT ──
        card.classList.add('is-current');
        icon.innerHTML = ICON_CLOCK;
        content.appendChild(title);


      } else {
        // ── UPCOMING ──
        card.classList.add('is-upcoming');
        icon.innerHTML = ICON_CLOCK;
        content.appendChild(title);
        card.setAttribute('data-skip-target', String(i));
      }

      card.appendChild(icon);
      card.appendChild(content);
      tl.appendChild(card);
    });
  }

  // ─── Gamified Skip Logic ──────────────────────────────────
  var _pendingSkipTarget = null;

  function trySkipToTopic(targetIndex) {
    console.log('[DEBUG] trySkipToTopic called with targetIndex:', targetIndex);
    console.log('[DEBUG] Current state:', { currentTopic: state.currentTopic, topicsLength: state.topics.length });

    if (targetIndex <= state.currentTopic || targetIndex > state.topics.length) {
      console.log('[DEBUG] trySkipToTopic guard rejected because targetIndex is invalid');
      return;
    }
    _pendingSkipTarget = targetIndex;

    // Populate the modal with the current topic name and target topic name
    if (dom.skipTopicName) dom.skipTopicName.textContent = state.topics[state.currentTopic];
    if (dom.skipTargetName) dom.skipTargetName.textContent = state.topics[targetIndex] || 'the next topic';
    if (dom.modalSkip) dom.modalSkip.removeAttribute('hidden');
    console.log('[DEBUG] trySkipToTopic success, modal should be visible');
  }

  function confirmSkip() {
    if (_pendingSkipTarget === null) return;

    // Mark all topics between current and target as skipped
    for (var i = state.currentTopic; i < _pendingSkipTarget; i++) {
      if (state.skippedTopics.indexOf(i) === -1) {
        state.skippedTopics.push(i);
      }
    }

    state.currentTopic = _pendingSkipTarget;
    var targetIndex = _pendingSkipTarget;
    _pendingSkipTarget = null;

    // Reset progress for the new topic
    setProgress(0);
    updateHud('waiting');
    refreshTopicUI();

    if (dom.modalSkip) dom.modalSkip.setAttribute('hidden', '');

    if (window.SessionStore && typeof window.SessionStore.updateSession === 'function') {
      window.SessionStore.updateSession({
        topicIndex: targetIndex,
        progress: 0
      });
    }

    // Sync with backend when the skip endpoint is available
    var sessionId = null;
    if (window.SessionStore) {
      var sess = window.SessionStore.getSession();
      sessionId = sess ? sess.sessionId : null;
    }
    if (sessionId && window.LearnBackAPI && typeof window.LearnBackAPI.skipToTopic === 'function') {
      window.LearnBackAPI.skipToTopic(sessionId, targetIndex).catch(function (error) {
        console.warn('Skip endpoint unavailable. Session will remain synced locally.', error);
      });
    }
  }

  function cancelSkip() {
    _pendingSkipTarget = null;
    if (dom.modalSkip) dom.modalSkip.setAttribute('hidden', '');
  }

  // Wire skip modal buttons
  if (dom.btnModalConfirmSkip) {
    dom.btnModalConfirmSkip.addEventListener('click', confirmSkip);
  }
  if (dom.btnModalCancelSkip) {
    dom.btnModalCancelSkip.addEventListener('click', cancelSkip);
  }

  // Wire topic card clicks via event delegation
  if (dom.topicList) {
    dom.topicList.addEventListener('click', function (e) {
      console.log('[DEBUG] topicList clicked!', e.target);
      var card = e.target.closest('[data-skip-target]');
      console.log('[DEBUG] Closest card:', card);
      if (!card) return;
      var idx = parseInt(card.getAttribute('data-skip-target'), 10);
      console.log('[DEBUG] Parsed idx from card:', idx);
      if (!isNaN(idx)) {
        trySkipToTopic(idx);
      }
    });
  }

  // Wire Start Session Gate
  var btnStartSession = document.getElementById('btn-start-session');
  if (btnStartSession) {
    btnStartSession.addEventListener('click', function () {
      const startSound = new Audio('sounds/start.mp3');
      startSound.play().catch(e => console.log('Audio play failed:', e));

      // Unlock input
      if (dom.chatInputField) {
        dom.chatInputField.disabled = false;
        dom.chatInputField.style.opacity = '1';
      }
      if (dom.btnSend) {
        dom.btnSend.disabled = false;
        dom.btnSend.style.opacity = '1';
      }
      if (dom.slideDeckChatInput) {
        dom.slideDeckChatInput.disabled = false;
        dom.slideDeckChatInput.style.opacity = '1';
      }

      var welcome = document.getElementById('chat-welcome');
      if (welcome) {
        welcome.style.opacity = '0';
        setTimeout(function () {
          welcome.style.display = 'none';
        }, 500);
      }

      if (typeof isKidoThinking !== 'undefined' && isKidoThinking) return;
      setChatLockout(true);

      var kidoMsgId = state.messageCount++;
      var kidoUIElement = addMessage('...', 'ai', kidoMsgId);
      var bubbleToType = kidoUIElement.querySelector('.message__bubble');

      updateHud('thinking');
      updateConceptCard({ text: 'I\'m thinking about that. Keep going.', type: 'thinking', delta: 0 });

      var greeting = state.topics.length
        ? "I'm ready to learn about " + state.topics[state.currentTopic] + ". Teach it to me in your own words."
        : "I'm ready to learn. Start with the first idea when you're ready.";

      typeMessage(bubbleToType, greeting).then(function () {
        setChatLockout(false);
        updateHud('waiting');
      });
    });
  }

  // Initial roadmap render
  renderRoadmap();

  // Set initial "Waiting for input" state
  if (dom.conceptCard) {
    updateConceptCard({ text: 'I\'m ready to learn! Explain the topic to me.', type: 'waiting', delta: 0 });
  }

  // ─── Progress ─────────────────────────────────────────────
  function setProgress(val) {
    state.progress = Math.min(100, Math.max(0, val));

    // Explicit 0 logic to prevent min-width pill bleeding
    var pct = state.progress === 0 ? '0' : state.progress + '%';
    var fillBg = state.progress > 0 ? '#022B3A' : 'transparent';

    if (dom.progressFill) {
      dom.progressFill.style.width = pct;
      dom.progressFill.style.backgroundColor = fillBg;
    }
    if (dom.progressValue) dom.progressValue.textContent = state.progress + '%';
    if (dom.progressCard) dom.progressCard.setAttribute('aria-valuenow', state.progress);

    // Sync HUD progress fill
    if (dom.hudProgressFill) {
      dom.hudProgressFill.style.width = pct;
      // Allow CSS data-state to govern color >0, otherwise strictly transparent
      if (state.progress === 0) {
        dom.hudProgressFill.style.backgroundColor = 'transparent';
      } else {
        dom.hudProgressFill.style.backgroundColor = '';
      }
    }

    // Sync progress ring stub (circumference = 2π×16 ≈ 100.5)
    var circumference = 100.5;
    var offset = circumference * (1 - state.progress / 100);
    if (dom.stubRingFill) dom.stubRingFill.setAttribute('stroke-dashoffset', offset.toFixed(1));
    if (dom.stubRingPct) dom.stubRingPct.textContent = state.progress + '%';

    // Sync peek card
    if (dom.peekPct) dom.peekPct.textContent = state.progress + '%';
    var peekFill = document.getElementById('peek-bar-fill');
    if (peekFill) {
      peekFill.style.width = pct;
      peekFill.style.backgroundColor = fillBg;
    }
  }

  function bumpProgress(delta) {
    if (!delta) delta = 0;
    setProgress(state.progress + delta);
  }

  // ─── KIDO Status HUD Engine ──────────────────────────────────────────

  var HUD_ICON_CORRECT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/><path d="M12 2 L13.5 5 L17 5.5 L14.5 8 L15 11.5 L12 10 L9 11.5 L9.5 8 L7 5.5 L10.5 5 Z" fill="currentColor" stroke="none" opacity="0.5"/></svg>';
  var HUD_ICON_INCORRECT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var HUD_ICON_IRRELEVANT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12" stroke-dasharray="4 3"/><polyline points="15 8 19 12 15 16"/></svg>';
  var HUD_ICON_THINKING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" stroke-dasharray="3 2"><animate attributeName="stroke-dashoffset" from="5" to="0" dur="0.8s" repeatCount="indefinite"/></line><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  var HUD_ICON_WAITING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  var HUD_STATES = {
    correct: { text: 'Correct', icon: HUD_ICON_CORRECT, anim: 'pop' },
    incorrect: { text: 'Incorrect', icon: HUD_ICON_INCORRECT, anim: 'shake' },
    needs_detail: { text: 'NEEDS MORE DETAIL', icon: HUD_ICON_IRRELEVANT, anim: null },
    irrelevant: { text: 'OUT OF SCOPE', icon: HUD_ICON_IRRELEVANT, anim: null },
    thinking: { text: 'THINKING...', icon: HUD_ICON_THINKING, anim: 'pulse' },
    waiting: { text: "READY TO LEARN", icon: HUD_ICON_WAITING, anim: null },
  };

  var _hudAnimTimeout = null;

  function updateHud(stateKey) {
    var cfg = HUD_STATES[stateKey] || HUD_STATES['waiting'];
    var hud = dom.hudEl;
    if (!hud) return;

    // Update data-state (drives all CSS state variants)
    hud.dataset.state = stateKey;

    // Trigger Gamification Audio based on HUD state
    if (window.AudioManager) {
      if (stateKey === 'correct') {
        window.AudioManager.playSound('correct');
      } else if (stateKey === 'incorrect') {
        window.AudioManager.playSound('incorrect');
        // Show misconceptions button badge when incorrect
        showMisconceptionsBadge();
      }
    }

    // Swap icon + text
    if (dom.hudBadgeIcon) dom.hudBadgeIcon.innerHTML = cfg.icon;
    if (dom.hudBadgeText) dom.hudBadgeText.textContent = cfg.text;

    // Update progress percentage label
    if (dom.hudProgressPct) dom.hudProgressPct.textContent = state.progress + '%';

    // Clear any lingering animation classes
    hud.classList.remove('hud-anim-pop', 'hud-anim-shake', 'hud-anim-pulse');
    if (_hudAnimTimeout) { clearTimeout(_hudAnimTimeout); _hudAnimTimeout = null; }

    if (cfg.anim === 'pulse') {
      // Pulse persists while in thinking state
      hud.classList.add('hud-anim-pulse');
    } else if (cfg.anim) {
      // One-shot animations: re-trigger by forcing reflow
      void hud.offsetWidth;
      hud.classList.add('hud-anim-' + cfg.anim);
      // Remove class after animation completes so it can replay next time
      var animDuration = cfg.anim === 'pop' ? 230 : 340;
      _hudAnimTimeout = setTimeout(function () {
        hud.classList.remove('hud-anim-' + cfg.anim);
        _hudAnimTimeout = null;
      }, animDuration);
    }
  }

  // Set initial waiting state
  updateHud('waiting');

  // ─── Concept Card Engine (Delta Ghost) ───────────────────────────────
  var BADGE_CONFIG = {
    mastered: {
      text: 'Correct',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    },
    developing: {
      text: 'Needs Detail',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
    },
    revising: {
      text: 'Incorrect',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
    },
    thinking: {
      text: 'THINKING',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4 4"><animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" /></line></svg>'
    },
    waiting: {
      text: 'WAITING FOR INPUT',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
    }
  };
  var BUBBLE_STATE_MAP = { mastered: 'mastered', developing: 'developing', revising: 'revising', thinking: 'thinking', waiting: 'waiting' };

  function updateConceptCard(entry) {
    var card = dom.conceptCard;
    var textEl = dom.conceptCardText;
    var titleEl = dom.conceptCardTitle;
    if (!card || !textEl) return;

    // Phase 1: fade out
    textEl.classList.add('is-exiting');

    setTimeout(function () {
      // Swap content
      textEl.textContent = entry.text;
      if (titleEl) {
        var cfg = BADGE_CONFIG[entry.type] || BADGE_CONFIG['thinking'];
        titleEl.innerHTML = cfg.icon + ' ' + cfg.text;
      }
      card.setAttribute('data-state', BUBBLE_STATE_MAP[entry.type] || 'thinking');

      // Delta Ghost Visuals Update
      var f1 = dom.conceptGhostFill1;
      var f2 = dom.conceptGhostFill2;
      var out = dom.conceptGhostOutline;
      var badge = dom.conceptProgressBadge;

      if (f1 && f2 && out && badge) {
        // Reset styles initially
        f2.style.display = 'none';
        out.style.display = 'none';
        badge.style.display = 'flex';
        badge.className = 'concept-badge'; // Reset classes
        badge.innerHTML = '';

        if (entry.type === 'mastered') {
          f1.style.width = state.progress + '%';
          badge.style.left = state.progress + '%';
          badge.style.borderColor = '#BBF7D0';
          badge.style.color = '#166534';
          badge.innerHTML = '+' + entry.delta + '%';
          badge.style.opacity = '1';

        } else if (entry.type === 'developing') {
          f1.style.width = state.progress + '%';
          out.style.display = 'block';
          out.style.left = state.progress + '%';
          out.style.width = '15%'; // Ghost potential
          badge.style.left = (state.progress + 15) + '%';
          badge.style.color = 'rgba(26, 31, 54, 0.4)';
          badge.style.borderColor = '#FDE68A';
          badge.innerHTML = '+0%';
          badge.style.opacity = '1';

        } else if (entry.type === 'revising') {
          f1.style.width = state.progress + '%';
          f2.style.display = 'block';
          f2.style.left = state.progress + '%';
          f2.style.width = Math.abs(entry.delta) + '%';
          badge.className = 'concept-badge negative';
          badge.style.left = state.progress + '%';
          badge.style.borderColor = '#FBCFE8';
          badge.innerHTML = '<span class="fade">+' + (Math.floor(Math.random() * 3) + 1) + '%</span> <span style="margin: 0 4px; color: rgba(26, 31, 54, 0.2);">|</span> <span style="color: #7A3F60;">' + entry.delta + '%</span>';
          badge.style.opacity = '1';

        } else {
          // Thinking / Waiting state
          f1.style.width = state.progress + '%';
          badge.style.opacity = '0';
        }
      }

      // Phase 2: fade in
      textEl.classList.remove('is-exiting');
      textEl.classList.add('is-entering');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          textEl.classList.remove('is-entering');
        });
      });
    }, 190);
  }

  // ─── KWL Stream (full history in right panel) ────────────────
  var TYPE_LABELS = { mastered: 'Correct', developing: 'Needs Detail', revising: 'Incorrect' };

  function classifyKnowledge(moodKey) {
    if (moodKey === 'encouraging') return 'mastered';
    if (moodKey === 'understanding' || moodKey === 'thinking') return 'developing';
    return 'revising';
  }

  function calculateDelta(type) {
    if (type === 'mastered') return 5 + Math.floor(Math.random() * 11);
    if (type === 'developing') return 0;
    return -(3 + Math.floor(Math.random() * 8)); // negative penalty
  }

  function addKnowledge(text, type, delta) {
    var entry = { text: text, type: type, time: ts(), msgIndex: state.messageCount, delta: delta };
    state.knowledge.unshift(entry);
    // Update the single concept card on the left
    updateConceptCard(entry);
    // Prepend card to the KWL list
    renderKwlList();
    // Update count badge
    if (dom.kwlCountBadge) dom.kwlCountBadge.textContent = state.knowledge.length;
  }


  // SVG icons per state (Lucide line-art)
  var STATE_ICONS = {
    mastered: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    developing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    revising: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4 4"><animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" /></line></svg>',
  };

  function buildCard(entry) {
    var card = document.createElement('div');
    card.className = 'thought-card thought-card--' + entry.type;

    var header = document.createElement('div');
    header.className = 'thought-card__header';

    var iconWrap = document.createElement('span');
    iconWrap.className = 'thought-card__icon';
    iconWrap.innerHTML = STATE_ICONS[entry.type] || '';
    header.appendChild(iconWrap);

    var badge = document.createElement('span');
    badge.className = 'thought-card__badge';
    badge.textContent = TYPE_LABELS[entry.type] || entry.type;
    header.appendChild(badge);

    var time = document.createElement('span');
    time.className = 'thought-card__time';
    time.textContent = entry.time;
    header.appendChild(time);

    var textEl = document.createElement('p');
    textEl.className = 'thought-card__text';
    textEl.textContent = entry.text;

    card.appendChild(header);
    card.appendChild(textEl);
    return card;
  }

  function renderKwlList() {
    var list = dom.kwlList;
    var empty = dom.kwlEmpty;
    if (!list) return;

    list.innerHTML = '';
    var k = state.knowledge; // newest-first
    if (k.length === 0) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    // Render all, oldest first for reading order
    k.slice().reverse().forEach(function (entry) {
      list.appendChild(buildCard(entry));
    });
    // Scroll to newest (bottom)
    requestAnimationFrame(function () {
      var parent = list.parentElement;
      if (parent) parent.scrollTop = parent.scrollHeight;
    });
  }

  // ─── Misconceptions Feature (Panel View) ───────────────────
  state.misconceptions = []; // [ { text, time } ]

  function showMisconceptionsBadge() {
    var badge = document.getElementById('misconceptions-badge');
    var btn = document.getElementById('btn-misconceptions');
    if (btn && state.misconceptions.length > 0) btn.classList.add('action-card--alert');
    if (badge && state.misconceptions.length > 0) {
      badge.textContent = state.misconceptions.length;
      badge.removeAttribute('hidden');
    }
  }

  // ── Build a single misconception card ──
  var MISCONCEPTION_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  function buildMisconceptionCard(entry) {
    var card = document.createElement('div');
    card.className = 'thought-card thought-card--misconception';

    var header = document.createElement('div');
    header.className = 'thought-card__header';

    var iconWrap = document.createElement('span');
    iconWrap.className = 'thought-card__icon';
    iconWrap.innerHTML = MISCONCEPTION_ICON;
    header.appendChild(iconWrap);

    var badge = document.createElement('span');
    badge.className = 'thought-card__badge';
    badge.textContent = 'Misconception';
    header.appendChild(badge);

    var time = document.createElement('span');
    time.className = 'thought-card__time';
    time.textContent = entry.time;
    header.appendChild(time);

    var textEl = document.createElement('p');
    textEl.className = 'thought-card__text';
    textEl.textContent = entry.text;

    card.appendChild(header);
    card.appendChild(textEl);
    return card;
  }

  function renderMisconceptionsList() {
    var list = document.getElementById('misconceptions-list');
    var empty = document.getElementById('misconceptions-empty');
    if (!list) return;

    list.innerHTML = '';
    var items = state.misconceptions;
    if (items.length === 0) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    items.slice().reverse().forEach(function (entry) {
      list.appendChild(buildMisconceptionCard(entry));
    });
    requestAnimationFrame(function () {
      var parent = list.parentElement;
      if (parent) parent.scrollTop = parent.scrollHeight;
    });
  }

  // ── Show the misconceptions panel (covers right panel) ──
  function revealRightPanelSubview(activateView) {
    if (dom.rightPanel && state.rightCollapsed) {
      expandPanel(dom.rightPanel, '19.1%', 'right');
      requestAnimationFrame(function () {
        requestAnimationFrame(activateView);
      });
      return;
    }

    activateView();
  }

  function showMisconceptionsView() {
    revealRightPanelSubview(function () {
      var miscView = document.getElementById('misconceptions-view');
      if (dom.statusView) {
        dom.statusView.classList.remove('hidden');
        dom.statusView.classList.remove('active');
      }
      if (dom.slidesView) dom.slidesView.classList.remove('active');
      if (dom.kwlView) dom.kwlView.classList.remove('active');
      if (miscView) miscView.classList.add('active');
      // Clear badge
      var btn = document.getElementById('btn-misconceptions');
      if (btn) btn.classList.remove('action-card--alert');
      renderMisconceptionsList();
    });
  }

  // Wire misconceptions button and back button
  (function () {
    var btnMis = document.getElementById('btn-misconceptions');
    if (btnMis) btnMis.addEventListener('click', showMisconceptionsView);
    var btnBack = document.getElementById('btn-back-misconceptions');
    if (btnBack) btnBack.addEventListener('click', function () { showStatus(); });
  })();

  // ─── KWL View toggle (right panel) ──────────────────────
  function showKwl() {
    revealRightPanelSubview(function () {
      var miscView = document.getElementById('misconceptions-view');
      if (dom.statusView) {
        dom.statusView.classList.remove('hidden');
        dom.statusView.classList.remove('active');
      }
      if (dom.slidesView) dom.slidesView.classList.remove('active');
      if (miscView) miscView.classList.remove('active');
      if (dom.kwlView) dom.kwlView.classList.add('active');
      renderKwlList();
    });
  }

  function showStatus() {
    var miscView = document.getElementById('misconceptions-view');
    state.showingSlides = false;
    if (dom.slidesView) dom.slidesView.classList.remove('active');
    if (dom.kwlView) dom.kwlView.classList.remove('active');
    if (miscView) miscView.classList.remove('active');
    if (dom.statusView) {
      dom.statusView.classList.remove('hidden');
      dom.statusView.classList.add('active');
    }
  }

  // ─── Chat ─────────────────────────────────────────────────
  function clearChat() {
    dom.chatMessages.querySelectorAll('.message').forEach(function (m) { m.remove(); });
    if (dom.slideDeckChatMessages) dom.slideDeckChatMessages.querySelectorAll('.message').forEach(function (m) { m.remove(); });

    if (dom.chatWelcome) dom.chatWelcome.style.display = '';
    const sdWelcome = dom.slideDeckChatMessages?.querySelector('.chat-welcome');
    if (sdWelcome) sdWelcome.style.display = '';
  }

  var isKidoThinking = false;

  function setChatLockout(locked) {
    isKidoThinking = locked;
    if (dom.chatInputField) {
      dom.chatInputField.disabled = locked;
      dom.chatInputField.style.opacity = locked ? '0.5' : '1';
    }
    if (dom.btnSend) {
      dom.btnSend.disabled = locked;
      dom.btnSend.style.opacity = locked ? '0.5' : '1';
      dom.btnSend.style.pointerEvents = locked ? 'none' : 'auto';
    }
    var btnSparkEl = document.getElementById('btn-spark');
    if (btnSparkEl) {
      btnSparkEl.disabled = locked;
      btnSparkEl.style.opacity = locked ? '0.5' : '1';
      btnSparkEl.style.color = locked ? 'var(--text-soft)' : '';
      btnSparkEl.style.cursor = locked ? 'default' : 'pointer';
    }
    if (dom.slideDeckChatInput) {
      dom.slideDeckChatInput.disabled = locked;
      dom.slideDeckChatInput.style.opacity = locked ? '0.5' : '1';
    }
  }

  function typeMessage(element, text) {
    return new Promise(function (resolve) {
      var words = text.split(' ');
      var i = 0;
      element.innerHTML = ''; // Hide typing indicator the moment typing starts

      function scrollDownSmooth() {
        if (dom.chatMessages) {
          dom.chatMessages.scrollTo({ top: dom.chatMessages.scrollHeight, behavior: 'smooth' });
        }
      }

      function typeNextWord() {
        if (i < words.length) {
          element.textContent += (i > 0 ? ' ' : '') + words[i];
          i++;
          scrollDownSmooth();
          setTimeout(typeNextWord, 30 + Math.random() * 20); // 30-50ms delay
        } else {
          scrollDownSmooth();
          resolve(); // Resolve promise when typing reaches 100%
        }
      }
      typeNextWord();
    });
  }

  function makeMsg(text, sender, msgId) {
    var isHint = sender === 'ai' && text.startsWith('__HINT__');
    var rawText = isHint ? text.replace('__HINT__', '') : text;
    var senderLabel = sender === 'user' ? 'You' : 'Kido';

    var w = document.createElement('div');
    w.className = 'message ' + (isHint ? 'message--ai message--ai-hint' : 'message--' + sender);
    if (msgId !== undefined) w.id = 'msg-' + msgId;

    var stack = document.createElement('div');
    stack.className = 'message__stack';

    if (!isHint) {
      var label = document.createElement('div');
      label.className = 'message__label';
      label.innerHTML = '<span class="message__label-dot"></span><span>' + senderLabel + '</span>';
      stack.appendChild(label);
    }

    var bubbleWrap = document.createElement('div');
    bubbleWrap.className = isHint ? 'message__bubble-wrap message__bubble-wrap--hint' : 'message__bubble-wrap';

    var b = document.createElement('div');
    b.className = isHint ? 'hint-note' : 'message__bubble';
    if (!isHint && sender === 'ai') {
      b.classList.add('message__bubble--ai');
    }

    if (rawText === '...') {
      var dots = '<div class="typing-dots"><span></span><span></span><span></span></div>';
      if (isHint) {
        b.innerHTML = '<div class="hint-note__label"><span class="hint-note__accent"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg><span>Hint</span></div><div class="hint-note__text">' + dots + '</div>';
      } else {
        b.innerHTML = dots;
      }
    } else if (isHint) {
      b.innerHTML = '<div class="hint-note__label"><span class="hint-note__accent"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg><span>Hint</span></div><div class="hint-note__text"></div>';
      b.querySelector('.hint-note__text').textContent = rawText;
    } else {
      b.textContent = rawText;
    }

    bubbleWrap.appendChild(b);
    stack.appendChild(bubbleWrap);
    w.appendChild(stack);

    return w;
  }

  function addMessage(text, sender, msgId) {
    if (dom.chatWelcome && dom.chatWelcome.style.display !== 'none') {
      dom.chatWelcome.style.display = 'none';
      const sdWelcome = dom.slideDeckChatMessages?.querySelector('.chat-welcome');
      if (sdWelcome) sdWelcome.style.display = 'none';
    }

    // Append to main chat
    var mainMsg = makeMsg(text, sender, msgId);
    dom.chatMessages.appendChild(mainMsg);
    requestAnimationFrame(function () {
      dom.chatMessages.scrollTo({ top: dom.chatMessages.scrollHeight, behavior: 'smooth' });
    });

    // Append to slide deck chat mirror
    if (dom.slideDeckChatMessages) {
      dom.slideDeckChatMessages.appendChild(makeMsg(text, sender, msgId + '-mirror'));
      requestAnimationFrame(function () {
        dom.slideDeckChatMessages.scrollTo({ top: dom.slideDeckChatMessages.scrollHeight, behavior: 'smooth' });
      });
    }

    // If KIDO responds while left panel is collapsed, show notification
    if (sender === 'ai' && state.leftCollapsed) {
      var badge = dom.kidoNotifBadge;
      var avatar = dom.kidoAvatar;
      if (badge) {
        badge.removeAttribute('hidden');
        var prev = parseInt(badge.textContent, 10) || 0;
        badge.textContent = prev + 1;
      }
      if (avatar) avatar.classList.add('has-notification');
    }

    return mainMsg;
  }

  function sendMessage(sourceText) {
    if (isKidoThinking) return; // Prevent double sends

    var text = sourceText || dom.chatInputField.value.trim();
    if (!text) return;

    setChatLockout(true); // State 2 (Kido Processing): Input Disabled

    var currentId = state.messageCount++;
    addMessage(text, 'user', currentId);

    dom.chatInputField.value = '';
    // Reset auto-grow height back to single-line
    dom.chatInputField.style.height = 'auto';
    dom.chatInputField.style.height = '44px';
    if (dom.slideDeckChatInput) dom.slideDeckChatInput.value = '';

    // Show '...' indicator for Kido instantly
    var kidoMsgId = state.messageCount++;
    var kidoUIElement = addMessage('...', 'ai', kidoMsgId);
    var bubbleToType = kidoUIElement.querySelector('.message__bubble');

    // Set HUD + concept card to thinking state immediately
    updateHud('thinking');
    var thinkingEntry = { text: 'I\'m thinking about that. Keep going.', type: 'thinking', delta: 0 };
    updateConceptCard(thinkingEntry);

    // ── Real Backend Call ───────────────────────────────────────
    var sessionId = null;
    if (window.SessionStore) {
      var sess = window.SessionStore.getSession();
      sessionId = sess ? sess.sessionId : null;
    }

    if (!sessionId) {
      // No session loaded — show friendly fallback
      typeMessage(bubbleToType, "I don't have a session loaded yet! Please start from the upload page.").then(function () {
        setChatLockout(false);
      });
      updateHud('waiting');
      return;
    }

    if (!window.LearnBackAPI || typeof window.LearnBackAPI.sendChatMessage !== 'function') {
      typeMessage(bubbleToType, "I can't reach the learning service right now. Please try again in a moment.").then(function () {
        setChatLockout(false);
      });
      updateHud('waiting');
      return;
    }

    window.LearnBackAPI.sendChatMessage({
      sessionId: sessionId,
      message: text
    })
      .then(function (data) {
        var aiText = data.kidoResponse || "I'm thinking really hard... can you say that again?";
        var evaluatorStatus = data.evaluatorStatus;
        var isGeneric = evaluatorStatus === 'conversational' || evaluatorStatus === 'off_topic';

        if (evaluatorStatus === 'plagiarized' || evaluatorStatus === 'textbook_copy') {
          updateHud('needs_detail');
          typeMessage(bubbleToType, aiText).then(function () {
            setChatLockout(false);
          });
          return;
        }

        if (isGeneric) {
          updateHud('waiting');
          typeMessage(bubbleToType, aiText).then(function () {
            setChatLockout(false);
          });
          return;
        }

        var newProgress = typeof data.progressPercent === 'number' ? data.progressPercent : state.progress;
        var delta = newProgress - state.progress;
        var hudStateKey = 'needs_detail';
        var type = 'developing';

        if (evaluatorStatus === 'correct') {
          hudStateKey = 'correct';
          type = 'mastered';
        } else if (evaluatorStatus === 'misconception') {
          hudStateKey = 'incorrect';
          type = 'revising';
        } else if (delta > 0) {
          hudStateKey = 'correct';
          type = 'mastered';
        }

        if (Array.isArray(data.misconceptions) && data.misconceptions.length) {
          data.misconceptions.forEach(function (misconception) {
            if (!state.misconceptions.find(function (entry) { return entry.text === misconception; })) {
              state.misconceptions.unshift({ text: misconception, time: ts() });
            }
          });
          renderMisconceptionsList();
          showMisconceptionsBadge();
        }

        setProgress(newProgress);
        updateHud(hudStateKey);
        addKnowledge(aiText, type, delta);

        if (window.SessionStore && typeof window.SessionStore.updateSession === 'function') {
          window.SessionStore.updateSession({
            topicIndex: state.currentTopic,
            progress: newProgress
          });
        }

        typeMessage(bubbleToType, aiText).then(function () {
          setChatLockout(false);
        });
      })
      .catch(function (err) {
        console.error('Chat API error:', err);
        var fallback = "I'm having a bit of a glitch. Try explaining that again!";
        typeMessage(bubbleToType, fallback).then(function () {
          setChatLockout(false);
        });
        updateHud('waiting');
      });
  }

  // ─── Spark Button Logic ──────────────────────────────────────────
  var btnSparkEl = document.getElementById('btn-spark');
  if (btnSparkEl) {
    btnSparkEl.addEventListener('click', function () {
      if (isKidoThinking) return;
      setChatLockout(true);

        typeMessage(bubbleToType, fallback).then(function () {
          setChatLockout(false);
        });
        updateHud('waiting');
      });
  }

  // ─── Spark Button Logic ──────────────────────────────────────────
  var btnSparkEl = document.getElementById('btn-spark');
  if (btnSparkEl) {
    btnSparkEl.addEventListener('click', function () {
      if (isKidoThinking) return;
      setChatLockout(true);

      var newProgress = Math.max(0, state.progress - 5);
      setProgress(newProgress);
      updateHud('needs_detail');
      updateConceptCard({ text: 'Generating a pedagogical nudge...', type: 'developing', delta: -5 });

      var kidoMsgId = state.messageCount++;
      var kidoUIElement = addMessage('__HINT__...', 'ai', kidoMsgId);
      var bubbleToType = kidoUIElement.querySelector('.hint-note__text');

      var sessionId = null;
      if (window.SessionStore) {
        var sess = window.SessionStore.getSession();
        sessionId = sess ? sess.sessionId : null;
      }

      if (!sessionId || !window.LearnBackAPI || typeof window.LearnBackAPI.sendChatMessage !== 'function') {
        typeMessage(bubbleToType, "I can't fetch a hint right now. Please try asking Kido directly.").then(function () {
          setChatLockout(false);
        });
        return;
      }

      window.LearnBackAPI.sendChatMessage({
        sessionId: sessionId,
        message: 'I need a hint for this topic.',
        hintRequested: true
      })
        .then(function (data) {
          var text = data.kidoResponse || "Try thinking about the first principles behind this topic!";
          typeMessage(bubbleToType, text).then(function () {
            setChatLockout(false);
          });
        })
                  }, 800);

                }, 800);

              }, 800);

            }, 500);
          }
        };

        window.addEventListener("message", handleIframeReady);

        appBubble.appendChild(iframe);

        var timeLabel = document.createElement('span');
        timeLabel.className = 'message__time';
        timeLabel.textContent = ts();

        appMsgWrapper.appendChild(senderLabel);
        appMsgWrapper.appendChild(appBubble);
        appMsgWrapper.appendChild(timeLabel);

        if (dom.chatWelcome && dom.chatWelcome.style.display !== 'none') {
          dom.chatWelcome.style.display = 'none';
        }

        dom.chatMessages.appendChild(appMsgWrapper);
        requestAnimationFrame(function () {
          dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        });

      }, 400); // small delay after intro text

    }, delay);
  }

  // ─── KNOWLEDGE CUBE WIDGET ─────────────────────────────────
  function buildKnowledgeCubeNodes() {
    if (!state.topics.length) {
      return [
        { id: 1, title: state.sessionTitle, thought: 'No roadmap topics have been loaded for this session yet.', status: 'pending', correction: '' }
      ];
    }

    return state.topics.slice(0, 6).map(function (topic, index) {
      return {
        id: index + 1,
        title: topic,
        thought: index < state.currentTopic
          ? 'Kido has already worked through ' + topic + '.'
          : index === state.currentTopic
            ? 'Kido is currently learning ' + topic + ' and still needs your explanation.'
            : 'Kido has not reached ' + topic + ' yet.',
        status: index < state.currentTopic ? 'reviewed' : 'pending',
        correction: ''
      };
    });
  }

  function buildKnowledgeCubeConnections(nodes) {
    var connections = [];
    var index;
    for (index = 0; index < nodes.length - 1; index += 1) {
      connections.push([nodes[index].id, nodes[index + 1].id]);
    }
    return connections;
  }

  var KC_NODES = buildKnowledgeCubeNodes();
  var KC_CONNECTIONS = buildKnowledgeCubeConnections(KC_NODES);

  function refreshKnowledgeCubeState() {
    KC_NODES = buildKnowledgeCubeNodes();
    KC_CONNECTIONS = buildKnowledgeCubeConnections(KC_NODES);
  }

  function kcNodeById(nodeid) { return KC_NODES.find(function (n) { return n.id === nodeid; }); }

  function injectKnowledgeCubeCard() {
    refreshKnowledgeCubeState();
    // ── 1. "Trigger" user message ──────────────────────────────
    var currentId = state.messageCount++;
    addMessage('Show me the Knowledge Map', 'user', currentId);

    // Brief thinking delay then inject the widget
    updateHud('thinking');
    setTimeout(function () {
      var aiIntro = "Here\'s a map of my current understanding. Tap a cube to review my thinking and correct me if I\'m wrong!";
      addMessage(aiIntro, 'ai');
      updateHud('correct');

      setTimeout(function () {
        var rootStyles = getComputedStyle(document.documentElement);
        function themeVar(name, fallback) {
          var value = rootStyles.getPropertyValue(name);
          return value ? value.trim() : fallback;
        }
        var isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
        var kcTheme = isDarkTheme ? {
          bubbleBg: themeVar('--surface-2', '#123543'),
          widgetBg: themeVar('--widget-shell-bg', 'linear-gradient(180deg, #173F4D, #123543)'),
          widgetBorder: themeVar('--widget-shell-border', 'rgba(234, 244, 247, 0.10)'),
          widgetShadow: themeVar('--shadow-zone', '0 14px 36px rgba(0,0,0,0.34)'),
          topBarBg: themeVar('--widget-header-bg', 'rgba(6, 23, 32, 0.72)'),
          topBarBorder: themeVar('--border', 'rgba(234, 244, 247, 0.10)'),
          topBarIconBg: themeVar('--navy', '#061720'),
          topBarIconFg: themeVar('--plum', '#B07A96'),
          title: themeVar('--widget-title', '#EAF4F7'),
          hint: themeVar('--widget-hint', 'rgba(243,210,224,0.82)'),
          legend: themeVar('--widget-legend', '#A9C0C8'),
          pendingBg: themeVar('--widget-pending-bg', '#123543'),
          pendingBorder: themeVar('--widget-pending-border', 'rgba(234, 244, 247, 0.18)'),
          pendingShadow: themeVar('--widget-pending-shadow', '#081d26'),
          pendingText: themeVar('--widget-pending-text', '#EAF4F7'),
          connector: themeVar('--widget-connector', '#d6a7bf'),
          reviewBadgeBg: themeVar('--navy', '#061720'),
          reviewBadgeText: themeVar('--text-primary', '#EAF4F7'),
          reviewTitle: themeVar('--text-primary', '#EAF4F7'),
          quoteCardBg: themeVar('--widget-quote-bg', '#123543'),
          quoteCardBorder: themeVar('--widget-quote-border', 'rgba(234, 244, 247, 0.18)'),
          quoteCardShadow: themeVar('--widget-pending-shadow', '#081d26'),
          quoteText: themeVar('--widget-quote-text', '#EAF4F7'),
          priorBg: themeVar('--widget-prior-bg', 'rgba(230,176,74,0.12)'),
          priorBorder: themeVar('--widget-prior-border', 'rgba(230,176,74,0.28)'),
          priorLabel: themeVar('--widget-prior-label', '#f6d58f'),
          buttonSecondaryBg: themeVar('--widget-secondary-bg', '#123543'),
          buttonSecondaryText: themeVar('--widget-secondary-text', '#f3d2e0'),
          textareaBg: themeVar('--widget-textarea-bg', '#0D2A34'),
          textareaBorder: themeVar('--widget-textarea-border', 'rgba(234, 244, 247, 0.18)'),
          textareaText: themeVar('--widget-textarea-text', '#EAF4F7')
        } : {
          bubbleBg: 'transparent',
          widgetBg: '#F6E8EA',
          widgetBorder: '#925E78',
          widgetShadow: '0 2px 12px rgba(0,0,0,0.07)',
          topBarBg: 'rgba(255,255,255,0.7)',
          topBarBorder: 'rgba(146,94,120,0.2)',
          topBarIconBg: '#022B3A',
          topBarIconFg: '#F6E8EA',
          title: '#022B3A',
          hint: '#925E78',
          legend: 'rgba(2,43,58,0.6)',
          pendingBg: 'white',
          pendingBorder: '#022B3A',
          pendingShadow: '#022B3A',
          pendingText: '#022B3A',
          connector: '#925E78',
          reviewBadgeBg: '#022B3A',
          reviewBadgeText: 'white',
          reviewTitle: '#022B3A',
          quoteCardBg: 'white',
          quoteCardBorder: '#022B3A',
          quoteCardShadow: '#022B3A',
          quoteText: '#022B3A',
          priorBg: '#FFF8E7',
          priorBorder: 'rgba(245,166,35,0.4)',
          priorLabel: '#D4870A',
          buttonSecondaryBg: 'white',
          buttonSecondaryText: '#925E78',
          textareaBg: 'white',
          textareaBorder: 'rgba(146,94,120,0.4)',
          textareaText: '#022B3A'
        };
        // ── 2. Build wrapper (same pattern as Excalidraw card) ─┐
        var msgWrapper = document.createElement('div');
        msgWrapper.className = 'message message--ai';

        var senderLabel = document.createElement('span');
        senderLabel.className = 'message__sender';
        senderLabel.textContent = 'KIDO (Knowledge Map)';

        var bubble = document.createElement('div');
        bubble.className = 'message__bubble message__bubble--app kc-root';
        bubble.style.cssText = 'padding:0; overflow:hidden; border-radius:14px; width:100%; max-width:100%; background:' + kcTheme.bubbleBg + '; border:none; box-shadow:none;';

        // ── 3. Widget root div ──────────────────────────────────
        var widget = document.createElement('div');
        widget.style.cssText = 'font-family:Inter,system-ui,sans-serif; background:' + kcTheme.widgetBg + '; border:1.5px solid ' + kcTheme.widgetBorder + '; border-radius:14px; overflow:hidden; box-shadow:' + kcTheme.widgetShadow + '; width:100%;';

        // Top pill badge
        var topBar = document.createElement('div');
        topBar.style.cssText = 'display:flex; align-items:center; gap:8px; padding:9px 14px; border-bottom:1px solid ' + kcTheme.topBarBorder + '; background:' + kcTheme.topBarBg + ';';
        topBar.innerHTML = [
          '<div style="width:26px;height:26px;border-radius:50%;background:' + kcTheme.topBarIconBg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">',
          '<svg width="14" height="10" viewBox="0 0 14 10" fill="none"><rect x="0" y="3" width="14" height="4" rx="2" fill="' + kcTheme.topBarIconFg + '"/></svg>',
          '</div>',
          '<span style="font-size:10px;font-weight:700;color:' + kcTheme.title + ';letter-spacing:.07em;text-transform:uppercase;">Knowledge Map</span>',
        ].join('');

        // ── 4. Graph View ────────────────────────────────────────
        var graphView = document.createElement('div');
        graphView.id = 'kc-graph-' + currentId;
        graphView.style.cssText = 'padding:22px 20px 20px;';

        // Progress bar removed per user request

        // Hint text
        var hint = document.createElement('p');
        hint.style.cssText = 'font-size:10px;color:' + kcTheme.hint + ';font-weight:600;text-align:center;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;';
        hint.textContent = 'Tap a cube to review my thinking';

        var canvas = document.createElement('div');
        canvas.style.cssText = 'position:relative; padding:0;';

        var svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgLayer.setAttribute('class', 'kc-svg-layer');
        svgLayer.id = 'kc-svg-' + currentId;

        var cubeWrap = document.createElement('div');
        cubeWrap.id = 'kc-cubes-' + currentId;
        cubeWrap.style.cssText = 'display:flex;justify-content:center;gap:40px;position:relative;z-index:1;padding:18px 0;';

        canvas.appendChild(svgLayer);
        canvas.appendChild(cubeWrap);

        // Legend
        var legend = document.createElement('div');
        legend.style.cssText = 'display:flex;justify-content:center;gap:14px;margin-top:10px;font-size:10px;font-weight:600;color:' + kcTheme.legend + ';';
        legend.innerHTML = [
          '<span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:' + kcTheme.pendingBg + ';border:1.5px solid ' + kcTheme.pendingBorder + ';display:inline-block;"></span>Pending</span>',
          '<span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:#D6EDDA;border:1.5px solid #5DA271;display:inline-block;"></span>Correct</span>',
          '<span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:#FFF3CD;border:1.5px solid #F5A623;display:inline-block;"></span>Corrected</span>',
        ].join('');

        graphView.appendChild(hint);
        graphView.appendChild(canvas);
        graphView.appendChild(legend);

        // ── 5. Review View ───────────────────────────────────────
        var reviewView = document.createElement('div');
        reviewView.id = 'kc-review-' + currentId;
        reviewView.className = 'kc-review-panel';
        reviewView.style.cssText = 'display:none; padding:14px 14px 12px;';

        reviewView.innerHTML = [
          // Back button
          '<button id="kc-back-' + currentId + '" style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:' + kcTheme.hint + ';background:none;border:none;cursor:pointer;margin-bottom:12px;padding:0;">',
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;"><path d="M9 11L5 7l4-4" stroke="' + kcTheme.hint + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          'Back to Map',
          '</button>',
          // Title row
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">',
          '<span id="kc-r-badge-' + currentId + '" style="font-size:10px;font-weight:700;background:' + kcTheme.reviewBadgeBg + ';color:' + kcTheme.reviewBadgeText + ';padding:2px 7px;border-radius:99px;"></span>',
          '<span id="kc-r-title-' + currentId + '" style="font-size:14px;font-weight:700;color:' + kcTheme.reviewTitle + ';"></span>',
          '</div>',
          // Thought bubble (removed "KIDO's current understanding" and "KIDO's internal model" per user request)
          '<div style="position:relative;background:' + kcTheme.quoteCardBg + ';border:2px solid ' + kcTheme.quoteCardBorder + ';border-radius:12px;padding:12px 12px 12px 20px;margin-bottom:10px;box-shadow:3px 3px 0 ' + kcTheme.quoteCardShadow + ';">',
          '<span style="position:absolute;top:-14px;left:-4px;font-size:32px;color:' + kcTheme.hint + ';line-height:1;user-select:none;">&ldquo;</span>',
          '<p id="kc-r-thought-' + currentId + '" style="font-size:12px;color:' + kcTheme.quoteText + ';line-height:1.55;font-style:italic;"></p>',
          '</div>',
          // Correction banner (hidden until used)
          '<div id="kc-prior-' + currentId + '" style="display:none;background:' + kcTheme.priorBg + ';border:1px solid ' + kcTheme.priorBorder + ';border-radius:8px;padding:8px 10px;margin-bottom:10px;">',
          '<p style="font-size:10px;font-weight:700;color:' + kcTheme.priorLabel + ';margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em;">Your previous correction</p>',
          '<p id="kc-prior-text-' + currentId + '" style="font-size:11px;color:' + kcTheme.quoteText + ';font-style:italic;"></p>',
          '</div>',
          // Action buttons
          '<div style="display:flex;gap:8px;margin-bottom:8px;">',
          '<button id="kc-good-' + currentId + '" style="flex:1;background:#5DA271;color:white;font-size:12px;font-weight:700;border:none;border-radius:10px;padding:9px;cursor:pointer;box-shadow:0 3px 0 #3d7a53;display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .15s,box-shadow .15s;">',
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Looks Good!',
          '</button>',
          '<button id="kc-wrong-' + currentId + '" style="flex:1;background:' + kcTheme.buttonSecondaryBg + ';color:' + kcTheme.buttonSecondaryText + ';font-size:12px;font-weight:700;border:2px solid ' + kcTheme.hint + ';border-radius:10px;padding:9px;cursor:pointer;box-shadow:0 3px 0 ' + kcTheme.hint + ';display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .15s,box-shadow .15s;">',
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="' + kcTheme.hint + '" stroke-width="2" stroke-linecap="round"/></svg>That\'s Wrong',
          '</button>',
          '</div>',
          // Correction area
          '<div id="kc-correct-area-' + currentId + '" style="display:none;">',
          '<label style="font-size:11px;font-weight:700;color:' + kcTheme.reviewTitle + ';display:block;margin-bottom:5px;">✏️ Rewrite KIDO\'s understanding:</label>',
          '<textarea id="kc-textarea-' + currentId + '" rows="3" placeholder="e.g. Weights are learnable parameters adjusted during training to minimise loss…" style="width:100%;font-size:12px;color:' + kcTheme.textareaText + ';background:' + kcTheme.textareaBg + ';border:2px solid ' + kcTheme.textareaBorder + ';border-radius:10px;padding:10px;resize:none;line-height:1.5;font-family:inherit;"></textarea>',
          '<button id="kc-save-' + currentId + '" style="margin-top:6px;width:100%;background:#925E78;color:white;font-size:12px;font-weight:700;border:none;border-radius:10px;padding:9px;cursor:pointer;box-shadow:0 3px 0 #5c3248;display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .15s,box-shadow .15s;">',
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Save &amp; Continue',
          '</button>',
          '</div>',
        ].join('');

        // ── 6. Assemble widget ───────────────────────────────────
        widget.appendChild(topBar);
        widget.appendChild(graphView);
        widget.appendChild(reviewView);
        bubble.appendChild(widget);

        msgWrapper.appendChild(senderLabel);
        msgWrapper.appendChild(bubble);

        if (dom.chatWelcome && dom.chatWelcome.style.display !== 'none') {
          dom.chatWelcome.style.display = 'none';
        }
        dom.chatMessages.appendChild(msgWrapper);
        requestAnimationFrame(function () {
          dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        });

        // ── 7. Wire interactivity after DOM paint ────────────────
        var kcActiveId = null;

        function kcNodeBg(status) {
          if (status === 'reviewed') return { bg: '#D6EDDA', border: '#5DA271' };
          if (status === 'corrected') return { bg: '#FFF3CD', border: '#F5A623' };
          return { bg: kcTheme.pendingBg, border: kcTheme.pendingBorder };
        }

        function kcNodeIcon(status) {
          if (status === 'reviewed') return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><path d="M1 6l3 3 7-6" stroke="#5DA271" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          if (status === 'corrected') return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><path d="M1 8.5l1.5-4 2.5 3.5 1.5-2.5 2.5 3" stroke="#F5A623" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="' + kcTheme.pendingBorder + '" stroke-width="1.4" stroke-opacity="0.55"/><circle cx="6" cy="6" r="1.5" fill="' + kcTheme.pendingText + '" fill-opacity="0.25"/></svg>';
        }

        function kcRenderCubes() {
          cubeWrap.innerHTML = '';
          KC_NODES.forEach(function (node) {
            var c = kcNodeBg(node.status);
            var isPending = node.status === 'pending';
            var btn = document.createElement('button');
            btn.id = 'kc-cube-' + currentId + '-' + node.id;
            btn.dataset.kcid = node.id;
            btn.className = 'kc-cube' + (isPending ? ' kc-ping' : '');
            btn.style.cssText = [
              'position:relative;z-index:1;',
              'background:' + c.bg + ';',
              'border:2px solid ' + c.border + ';',
              'box-shadow:3px 3px 0 ' + kcTheme.pendingShadow + ';',
              'border-radius:10px;',
              'padding:10px;',
              'width:100px;height:100px;',
              'text-align:center;',
              'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;',
              'flex-shrink:0;',
            ].join('');
            // Header row
            var hdr = document.createElement('div');
            hdr.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:3px;';
            hdr.innerHTML = kcNodeIcon(node.status);
            // Title
            var ttl = document.createElement('span');
            ttl.style.cssText = 'font-size:11px;font-weight:700;color:' + kcTheme.pendingText + ';line-height:1.25;text-align:center;';
            ttl.textContent = node.title;
            btn.appendChild(hdr);
            btn.appendChild(ttl);
            btn.addEventListener('click', function () { kcOpenReview(parseInt(this.dataset.kcid, 10)); });
            cubeWrap.appendChild(btn);
          });
          kcUpdateProgress();
          requestAnimationFrame(kcDrawConnectors);
        }

        function kcUpdateProgress() {
          // Progress bar removed — no-op
        }

        function kcDrawConnectors() {
          var svg = document.getElementById('kc-svg-' + currentId);
          if (!svg) return;
          svg.innerHTML = '';
          var canvasRect = canvas.getBoundingClientRect();
          KC_CONNECTIONS.forEach(function (pair) {
            var fromEl = document.getElementById('kc-cube-' + currentId + '-' + pair[0]);
            var toEl = document.getElementById('kc-cube-' + currentId + '-' + pair[1]);
            if (!fromEl || !toEl) return;
            var r1 = fromEl.getBoundingClientRect();
            var r2 = toEl.getBoundingClientRect();
            // Connect right edge of 'from' to left edge of 'to'
            var x1 = r1.right - canvasRect.left;
            var y1 = r1.top + r1.height / 2 - canvasRect.top;
            var x2 = r2.left - canvasRect.left;
            var y2 = r2.top + r2.height / 2 - canvasRect.top;
            var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('stroke', kcTheme.connector);
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-dasharray', '5 3');
            line.setAttribute('stroke-opacity', '0.45');
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);
            // Arrow dot at destination
            var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x2); dot.setAttribute('cy', y2);
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', kcTheme.connector);
            dot.setAttribute('fill-opacity', '0.5');
            svg.appendChild(dot);
          });
        }

        function kcShowGraph() {
          reviewView.style.display = 'none';
          graphView.style.display = '';
          reviewView.className = 'kc-review-panel';
          kcActiveId = null;
          kcRenderCubes();
          // Stable scroll: keep widget in view without jumping
          requestAnimationFrame(function () { widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
        }

        function kcOpenReview(id) {
          kcActiveId = id;
          var node = kcNodeById(id);

          document.getElementById('kc-r-badge-' + currentId).textContent = '#' + node.id;
          document.getElementById('kc-r-title-' + currentId).textContent = node.title;
          document.getElementById('kc-r-thought-' + currentId).textContent = node.thought;

          var priorEl = document.getElementById('kc-prior-' + currentId);
          var priorTxt = document.getElementById('kc-prior-text-' + currentId);
          if (node.correction) {
            priorEl.style.display = '';
            priorTxt.textContent = node.correction;
          } else {
            priorEl.style.display = 'none';
          }
          document.getElementById('kc-correct-area-' + currentId).style.display = 'none';
          var ta = document.getElementById('kc-textarea-' + currentId);
          if (ta) ta.value = node.correction || '';

          // Slide in review
          graphView.style.display = 'none';
          reviewView.style.display = '';
          // re-trigger animation
          reviewView.className = '';
          void reviewView.offsetWidth;
          reviewView.className = 'kc-review-panel';

          // Stable scroll: keep widget in view without jumping
          requestAnimationFrame(function () { widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
        }

        function kcAdvanceOrReturn() {
          var next = KC_NODES.find(function (n) { return n.status === 'pending'; });
          if (next) {
            // Smooth transition — no black screen
            reviewView.style.transition = 'opacity 0.15s ease';
            reviewView.style.opacity = '0.4';
            setTimeout(function () {
              reviewView.style.opacity = '1';
              kcOpenReview(next.id);
            }, 80);
          } else {
            kcShowGraph();
          }
        }

        // Back button
        document.getElementById('kc-back-' + currentId).addEventListener('click', kcShowGraph);

        // Looks Good
        document.getElementById('kc-good-' + currentId).addEventListener('click', function () {
          var node = kcNodeById(kcActiveId);
          node.status = 'reviewed';
          kcAdvanceOrReturn();
        });

        // That's Wrong — reveal textarea
        document.getElementById('kc-wrong-' + currentId).addEventListener('click', function () {
          var area = document.getElementById('kc-correct-area-' + currentId);
          area.style.display = '';
          var ta = document.getElementById('kc-textarea-' + currentId);
          if (ta) ta.focus();
          requestAnimationFrame(function () { widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
        });

        // Save & Continue
        document.getElementById('kc-save-' + currentId).addEventListener('click', function () {
          var ta = document.getElementById('kc-textarea-' + currentId);
          var txt = ta ? ta.value.trim() : '';
          if (!txt) {
            if (ta) { ta.style.borderColor = '#EF4444'; setTimeout(function () { ta.style.borderColor = ''; }, 1200); }
            return;
          }
          var node = kcNodeById(kcActiveId);
          node.correction = txt;
          node.status = 'corrected';
          kcAdvanceOrReturn();
        });

        // Initial render
        kcRenderCubes();

      }, 350); // delay after intro message
    }, 900);
  }

  // Bind the new button --- 4-phase Cube Presentation Remote
  if (dom.btnRequestGraph) {
    let cubeClickPhase = 0;
    dom.btnRequestGraph.addEventListener('click', function(e) {
      cubeClickPhase++;

      const seqWidget   = document.getElementById('seq-widget-wrapper');
      const swipeWidget = document.getElementById('swipe-widget-wrapper');

      if (cubeClickPhase === 1) {
        // Phase 1: Show Sequence Builder
        if (dom.chatWelcome) dom.chatWelcome.style.display = 'none';
        if (swipeWidget)  swipeWidget.style.display  = 'none';
        if (seqWidget)    seqWidget.style.display     = 'flex';
        requestAnimationFrame(() => {
          if (seqWidget) seqWidget.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });

      } else if (cubeClickPhase === 2) {
        // Phase 2: Close all widgets
        if (seqWidget)   seqWidget.style.display   = 'none';
        if (swipeWidget) swipeWidget.style.display  = 'none';

      } else if (cubeClickPhase === 3) {
        // Phase 3: Show Swipe Sorter
        if (seqWidget) seqWidget.style.display = 'none';
        if (swipeWidget) {
          swipeWidget.style.display = 'flex';
          if (typeof window.renderSwipeWidget === 'function' && window.mockSwipeData) {
            window.renderSwipeWidget(window.mockSwipeData);
          }
          requestAnimationFrame(() => {
            swipeWidget.scrollIntoView({ behavior: 'smooth', block: 'end' });
          });
        }

      } else {
        // Phase 4+: Inject Knowledge Map
        injectKnowledgeCubeCard(e);
        cubeClickPhase = 3; // clamp so next click keeps showing Knowledge Map
      }
    });
  }


  // ─── PANEL COLLAPSE / EXPAND ───────────────────────────────
  function collapsePanel(panel, direction) {
    if (!panel) return;
    panel.classList.add('is-collapsed');
    // Spring-like CSS transition applied via the class change
    // Animate manually for a snappy spring feel (stiffness:300, damping:30)
    panel.style.transition = 'flex-basis 320ms cubic-bezier(0.37, 0, 0.63, 1), min-width 320ms cubic-bezier(0.37, 0, 0.63, 1)';

    if (direction === 'left') state.leftCollapsed = true;
    if (direction === 'right') state.rightCollapsed = true;
  }

  function expandPanel(panel, targetFlex, direction) {
    if (!panel) return;
    panel.classList.remove('is-collapsed');
    panel.style.transition = 'flex-basis 400ms cubic-bezier(0.22, 1, 0.36, 1), min-width 400ms cubic-bezier(0.22, 1, 0.36, 1)';
    panel.style.flex = `0 0 ${targetFlex}`;

    if (direction === 'left') {
      state.leftCollapsed = false;
      // Clear KIDO notification state
      if (dom.kidoNotifBadge) dom.kidoNotifBadge.setAttribute('hidden', '');
      if (dom.kidoNotifBadge) dom.kidoNotifBadge.textContent = '1';
      if (dom.kidoAvatar) dom.kidoAvatar.classList.remove('has-notification');
    }
    if (direction === 'right') state.rightCollapsed = false;
  }

  if (dom.btnCollapseLeft) {
    dom.btnCollapseLeft.addEventListener('click', function () {
      if (state.leftCollapsed) {
        expandPanel(dom.aiPanel, '19.1%', 'left');
      } else {
        collapsePanel(dom.aiPanel, 'left');
      }
    });
  }

  if (dom.btnExpandLeft) {
    dom.btnExpandLeft.addEventListener('click', function () {
      if (state.showingSlides) {
        closeSlideDeck();
      } else {
        expandPanel(dom.aiPanel, '19.1%', 'left');
      }
    });
  }

  if (dom.btnCollapseRight) {
    dom.btnCollapseRight.addEventListener('click', function () {
      if (state.rightCollapsed) {
        expandPanel(dom.rightPanel, '19.1%', 'right');
      } else {
        collapsePanel(dom.rightPanel, 'right');
      }
    });
  }

  if (dom.btnExpandRight) {
    dom.btnExpandRight.addEventListener('click', function () {
      expandPanel(dom.rightPanel, '19.1%', 'right');
    });
  }

  // ─── SLIDE DECK MODE (PDF inside right panel) ──────────────
  function openSlideDeck() {
    state.showingSlides = true;

    // 1. Collapse the left (KIDO) panel to give maximum space
    if (!state.leftCollapsed) {
      collapsePanel(dom.aiPanel, 'left');
    }

    // 2. Grow the right panel & switch its content to the PDF view
    if (dom.rightPanel) {
      dom.rightPanel.classList.add('has-slide-deck');
    }
  }

  function closeSlideDeck() {
    state.showingSlides = false;

    // 1. Restore right panel to normal content
    if (dom.rightPanel) {
      dom.rightPanel.classList.remove('has-slide-deck');
    }

    // 2. Re-expand the left (KIDO) panel
    expandPanel(dom.aiPanel, '19.1%', 'left');
  }

  // Wire the Open Slides button from the "Slide Deck" action card
  if (dom.btnOpenSlides) dom.btnOpenSlides.addEventListener('click', openSlideDeck);

  // Wire the Close button inside the slide deck view
  var btnCloseSlides = document.getElementById('btn-close-slides');
  if (btnCloseSlides) btnCloseSlides.addEventListener('click', closeSlideDeck);

  // ─── Legacy back buttons ──────────────────────────────────
  if (dom.btnBackStatus) dom.btnBackStatus.addEventListener('click', showStatus);

  // ─── HEADER ACTIONS DROPDOWN & MUTE ──────────────────────────────
  if (dom.btnMuteSounds) {
    dom.btnMuteSounds.addEventListener('click', function (e) {
      if (window.AudioManager) {
        var isMuted = window.AudioManager.toggleMute();
        // Update UI
        if (isMuted) {
          dom.iconVolumeOn.style.display = 'none';
          dom.iconVolumeOff.style.display = 'inline-block';
          dom.textMuteSounds.textContent = 'Unmute';
        } else {
          dom.iconVolumeOn.style.display = 'inline-block';
          dom.iconVolumeOff.style.display = 'none';
          dom.textMuteSounds.textContent = 'Mute';
        }
      }
    });
  }

  if (dom.btnHeaderActions && dom.headerDropdown) {
    dom.btnHeaderActions.addEventListener('click', function (e) {
      e.stopPropagation();
      var isActive = dom.headerDropdown.classList.contains('active');
      if (isActive) {
        dom.headerDropdown.classList.remove('active');
        dom.btnHeaderActions.setAttribute('aria-expanded', 'false');
      } else {
        dom.headerDropdown.classList.add('active');
        dom.btnHeaderActions.setAttribute('aria-expanded', 'true');
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!dom.headerDropdown.contains(e.target) && e.target !== dom.btnHeaderActions) {
        dom.headerDropdown.classList.remove('active');
        dom.btnHeaderActions.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ─── PDF.JS INTEGRATION ────────────────────────────────────
  function loadPdf(url) {
    if (typeof pdfjsLib === 'undefined') {
      console.warn('PDF.js not loaded');
      return;
    }

    // Show placeholder while loading
    if (dom.pdfPlaceholder) {
      dom.pdfPlaceholder.style.display = 'flex';
      dom.pdfPlaceholder.innerHTML = '<p>Loading slides...</p>';
    }

    pdfjsLib.getDocument(url).promise.then(function (pdfDoc) {
      state.pdfDoc = pdfDoc;
      state.pdfTotalPages = pdfDoc.numPages;
      state.pdfPage = 1;

      // Hide placeholder
      if (dom.pdfPlaceholder) dom.pdfPlaceholder.style.display = 'none';

      // Show sidebar for thumbnails
      if (dom.thumbnailSidebar) {
        dom.thumbnailSidebar.style.display = 'flex';
        dom.thumbnailSidebar.innerHTML = ''; // clear old
      }

      // Clear old canvases
      const wrap = document.getElementById('pdf-canvas-wrap');
      if (wrap) wrap.innerHTML = '';

      // We will render ALL pages sequentially for native scrolling
      renderAllPages();

    }).catch(function (err) {
      console.warn('Could not load sample.pdf:', err.message);

      // Fallback: File Not Found Card
      if (dom.pdfPlaceholder) {
        dom.pdfPlaceholder.style.display = 'flex';
        dom.pdfPlaceholder.className = 'file-not-found-card';
        dom.pdfPlaceholder.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="9" y1="15" x2="15" y2="15"></line>
            <line x1="12" y1="12" x2="12" y2="18"></line>
          </svg>
          <h3>File Not Found</h3>
          <p>We couldn't load <code>sample.pdf</code>. Please upload your slides to continue.</p>
          <button class="file-upload-btn">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Upload Slides
          </button>
        `;
      }
    });
  }

  async function renderAllPages() {
    state.pdfRendering = true;
    const wrap = document.getElementById('pdf-canvas-wrap');
    const sidebar = dom.thumbnailSidebar;

    for (let i = 1; i <= state.pdfTotalPages; i++) {
      const page = await state.pdfDoc.getPage(i);

      // 1. Create Main Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.id = 'page-' + i;
      wrap.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      const containerWidth = wrap.clientWidth > 0 ? wrap.clientWidth : 800; // fallback

      // We render at 1x scale initially. CSS transform handles Zoom.
      // Actually, let's render at a higher resolution for crispness, and scale down via CSS.
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      // The CSS width:100% and height:auto will size it to the container.

      const renderCtx = { canvasContext: ctx, viewport: viewport };
      await page.render(renderCtx).promise;

      // 2. Create Thumbnail Canvas
      if (sidebar) {
        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'thumbnail-wrap';
        if (i === 1) thumbWrap.classList.add('active'); // First page active

        thumbWrap.onclick = () => {
          // Scroll main area to this page
          canvas.scrollIntoView({ behavior: 'smooth' });
        };

        const thumbCanvas = document.createElement('canvas');
        const thumbCtx = thumbCanvas.getContext('2d');

        const thumbScale = 100 / viewport.width; // 100px wide thumbs
        const thumbViewport = page.getViewport({ scale: thumbScale * 1.5 }); // factor in the 1.5 base scale

        thumbCanvas.width = thumbViewport.width;
        thumbCanvas.height = thumbViewport.height;

        await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;

        const pageNumText = document.createElement('div');
        pageNumText.className = 'thumbnail-page-num';
        pageNumText.textContent = i;

        thumbWrap.appendChild(thumbCanvas);
        thumbWrap.appendChild(pageNumText);
        sidebar.appendChild(thumbWrap);
      }
    }
    state.pdfRendering = false;
    updatePdfPageUI();

    // Add scroll listener to update active thumbnail
    if (dom.pdfRenderArea) {
      dom.pdfRenderArea.addEventListener('scroll', handlePdfScroll);
    }
  }

  function handlePdfScroll() {
    if (!dom.pdfRenderArea || state.pdfTotalPages === 0) return;

    const wrapOffset = dom.pdfRenderArea.getBoundingClientRect().top;
    const canvases = document.querySelectorAll('.pdf-page-canvas');
    let closestPage = 1;
    let minDistance = Infinity;

    canvases.forEach((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      // Distance from the top of the viewport to the top of the canvas
      const distance = Math.abs(rect.top - wrapOffset);

      if (distance < minDistance) {
        minDistance = distance;
        closestPage = index + 1;
      }
    });

    if (state.pdfPage !== closestPage) {
      state.pdfPage = closestPage;
      updatePdfPageUI();

      // Update thumbnail glow
      const thumbs = document.querySelectorAll('.thumbnail-wrap');
      thumbs.forEach((t, index) => {
        if (index + 1 === closestPage) {
          t.classList.add('active');
          // Optional: scroll sidebar so thumb is visible
          t.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          t.classList.remove('active');
        }
      });
    }
  }

  function updatePdfPageUI() {
    // If you want to keep a text indicator:
    // if (dom.pdfPageInfo) dom.pdfPageInfo.textContent = 'Page ' + state.pdfPage + ' of ' + state.pdfTotalPages;

    // Disable prev/next buttons (though we are hiding them now)
    if (dom.btnPdfPrev) dom.btnPdfPrev.disabled = (state.pdfPage <= 1);
    if (dom.btnPdfNext) dom.btnPdfNext.disabled = (state.pdfPage >= state.pdfTotalPages);

    // Zoom UI
    if (dom.pdfZoomLevel) dom.pdfZoomLevel.textContent = Math.round(state.pdfZoom * 100) + '%';

    if (dom.btnZoomReset) {
      dom.btnZoomReset.style.display = (state.pdfZoom !== 1.0) ? 'flex' : 'none';
      dom.btnZoomReset.classList.toggle('active', state.pdfZoom !== 1.0);
    }
  }

  // ─── Smart Zoom (CSS Transform) ────────────────────────
  function applyZoom() {
    const canvases = document.querySelectorAll('.pdf-page-canvas');
    canvases.forEach(c => {
      c.style.transform = `scale(${state.pdfZoom})`;
    });
    updatePdfPageUI();
  }

  // Mouse wheel zoom
  if (dom.pdfRenderArea) {
    dom.pdfRenderArea.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Prevent browser zoom
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        state.pdfZoom = Math.min(3.0, Math.max(0.5, state.pdfZoom + delta));
        applyZoom();
      }
    }, { passive: false });
  }

  // PDF zoom buttons
  if (dom.btnPdfZoomIn) {
    dom.btnPdfZoomIn.addEventListener('click', function () {
      state.pdfZoom = Math.min(3.0, state.pdfZoom + 0.25);
      applyZoom();
    });
  }

  if (dom.btnPdfZoomOut) {
    dom.btnPdfZoomOut.addEventListener('click', function () {
      state.pdfZoom = Math.max(0.5, state.pdfZoom - 0.25);
      applyZoom();
    });
  }

  if (dom.btnZoomReset) {
    dom.btnZoomReset.addEventListener('click', function () {
      state.pdfZoom = 1.0;
      applyZoom();
    });
  }

  // PDF highlighter toggle
  if (dom.btnPdfHighlight) {
    dom.btnPdfHighlight.addEventListener('click', function () {
      state.pdfHighlightActive = !state.pdfHighlightActive;
      dom.btnPdfHighlight.classList.toggle('active', state.pdfHighlightActive);
      if (dom.pdfCanvas) {
        dom.pdfCanvas.style.cursor = state.pdfHighlightActive ? 'crosshair' : 'default';
      }
    });
  }

  // ─── Chat send events ──────────────────────────────────────
  if (dom.btnSend) {
    dom.btnSend.addEventListener('click', function () {
      sendMessage(dom.chatInputField.value.trim());
    });
  }

  if (dom.chatInputField) {
    // Auto-grow: recalculate height on every keystroke
    dom.chatInputField.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });

    // Keyboard UX: Enter sends, Shift+Enter inserts newline
    dom.chatInputField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(dom.chatInputField.value.trim());
      }
      // Shift+Enter: allow default (new line), auto-grow will fire via 'input' event
    });
  }

  if (dom.btnPrev) dom.btnPrev.addEventListener('click', function () { navigateTopic(-1); });

  // ─── KWL button ───────────────────────────────────────────
  if (dom.btnKidoLearned) dom.btnKidoLearned.addEventListener('click', showKwl);
  if (dom.btnBackKwl) dom.btnBackKwl.addEventListener('click', showStatus);

  // ─── Differentiated Modal Events ──────────────────────────

  // 1. The < (Back Button) – The "Safety Net"
  if (dom.btnNavBack) {
    dom.btnNavBack.addEventListener('click', function (e) {
      e.preventDefault();
      if (dom.modalCrossroads) dom.modalCrossroads.removeAttribute('hidden');
    });
  }

  // 2. The "Save & Exit" Button – The "Direct Save"
  if (dom.btnNavPause) {
    dom.btnNavPause.addEventListener('click', function () {
      var toast = document.getElementById('toast-notification');
      if (toast) {
        toast.textContent = 'Progress saved. Returning to dashboard...';
        toast.removeAttribute('hidden');
        toast.classList.add('toast--show');
        setTimeout(function () {
          toast.classList.remove('toast--show');
          setTimeout(function () {
            toast.setAttribute('hidden', '');
            alert('Redirecting to dashboard...');
          }, 300);
        }, 1500);
      } else {
        alert('Progress saved. Returning to dashboard...');
      }
    });
  }

  // 3. The "Finish Teaching" Button – The "Final Validation"
  if (dom.btnNavFinish) {
    dom.btnNavFinish.addEventListener('click', function () {
      if (dom.modalFinalize) dom.modalFinalize.removeAttribute('hidden');
    });
  }

  // --- Modal Button Actions ---

  // Crossroads actions
  if (dom.btnModalCancelCrossroads) {
    dom.btnModalCancelCrossroads.addEventListener('click', function () {
      if (dom.modalCrossroads) dom.modalCrossroads.setAttribute('hidden', '');
    });
  }
  if (dom.btnModalSaveCrossroads) {
    dom.btnModalSaveCrossroads.addEventListener('click', function () {
      if (dom.modalCrossroads) dom.modalCrossroads.setAttribute('hidden', '');
      if (dom.btnNavPause) dom.btnNavPause.click();
    });
  }
  if (dom.btnModalFinalizeCrossroads) {
    dom.btnModalFinalizeCrossroads.addEventListener('click', function () {
      if (dom.modalCrossroads) dom.modalCrossroads.setAttribute('hidden', '');
      if (dom.btnNavFinish) dom.btnNavFinish.click();
    });
  }

  // Finalize actions
  if (dom.btnModalCancelFinalize) {
    dom.btnModalCancelFinalize.addEventListener('click', function () {
      if (dom.modalFinalize) dom.modalFinalize.setAttribute('hidden', '');
    });
  }
  function redirectToFeedbackSummary() {
    var session = window.SessionStore && typeof window.SessionStore.getSession === 'function'
      ? window.SessionStore.getSession()
      : null;

    if (window.SessionStore && typeof window.SessionStore.updateSession === 'function') {
      window.SessionStore.updateSession({
        topicIndex: state.currentTopic,
        progress: state.progress
      });
    }

    var url = 'feedback.html';
    if (session && session.sessionId) {
      url += '?id=' + encodeURIComponent(session.sessionId);
    }
    window.location.href = url;
  }
  if (dom.btnModalGrade) {
    dom.btnModalGrade.addEventListener('click', function () {
      if (dom.modalFinalize) dom.modalFinalize.setAttribute('hidden', '');
      redirectToFeedbackSummary();
    });
  }

  // ─── Init ─────────────────────────────────────────────────
  refreshTopicUI();
  setProgress(state.progress);

  // Preview seed removed; start with an empty knowledge stream.
  var initialKnowledgeSeed = []; /*
    { text: 'Input, hidden, and output layers form a directed graph — each edge is a weighted signal.', type: 'mastered', time: '07:10' },
    { text: 'Neurons activate only when weighted inputs exceed a threshold value.', type: 'developing', time: '07:14' },
    { text: 'Backpropagation propagates loss gradients backward to adjust weights iteratively.', type: 'revising', time: '07:18' },
    { text: 'ReLU clips negative activations to zero, preserving the forward signal.', type: 'mastered', time: '07:21' },
  ]; */
  for (var si = initialKnowledgeSeed.length - 1; si >= 0; si--) {
    state.knowledge.unshift(initialKnowledgeSeed[si]);
  }

  // Render KWL list and update thought bubble to the latest entry
  renderKwlList();
  if (dom.kwlCountBadge) dom.kwlCountBadge.textContent = state.knowledge.length;
  if (state.knowledge.length > 0) updateThoughtBubble(state.knowledge[0]);

  // Sync peek card learnings count
  if (dom.peekLearningsCount) dom.peekLearningsCount.textContent = state.knowledge.length;

  // Preview chat seed removed; wait for live session messages.
  var initialChatSeed = []; /*
    { text: 'A neural network has layers: input, hidden, and output.', sender: 'user' },
    { text: 'Interesting! Could you tell me more about how the layers connect?', sender: 'ai' },
    { text: 'Neurons fire when their weighted inputs exceed a threshold — like biological neurons.', sender: 'user' },
    { text: 'I think I understand now. The key point is the relationship between those ideas.', sender: 'ai' },
    { text: 'Backpropagation randomly adjusts weights until accuracy improves.', sender: 'user' },
    { text: "Hmm, I'm not sure I fully understand that part. Could you elaborate?", sender: 'ai' },
  ]; */
  initialChatSeed.forEach(function (m) { addMessage(m.text, m.sender); });

  // ─── MIND MAP (D3) LOGIC ─────────────────────────────────
  var MindMapManager = {
    getData: function () {
      if (!state.topics.length) {
        return {
          nodes: [
            { id: 'n1', label: state.sessionTitle, status: 'unverified', def: 'No concept nodes are available until session topics are loaded.' }
          ],
          links: []
        };
      }

      var nodes = state.topics.slice(0, 6).map(function (topic, index) {
        return {
          id: 'n' + (index + 1),
          label: topic,
          status: index < state.currentTopic ? 'verified' : (index === state.currentTopic ? 'unverified' : 'fallback'),
          def: index < state.currentTopic
            ? 'Kido has already reviewed this topic.'
            : index === state.currentTopic
              ? 'This is the current concept Kido is working through.'
              : 'This concept is still upcoming in the roadmap.'
        };
      });
      var links = [];
      var index;
      for (index = 0; index < nodes.length - 1; index += 1) {
        links.push({
          source: nodes[index].id,
          target: nodes[index + 1].id,
          type: index < state.currentTopic ? 'confirmed' : 'fallback'
        });
      }
      return { nodes: nodes, links: links };
    },

    init: function (containerId, isMini) {
      if (typeof d3 === 'undefined') return;
      var container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = '';
      var width = container.clientWidth || (isMini ? 400 : window.innerWidth);
      var height = container.clientHeight || (isMini ? 200 : window.innerHeight);

      var data = this.getData();

      var svg = d3.select(container).append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);

      var simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(function (d) { return d.id; }).distance(isMini ? 80 : 150))
        .force("charge", d3.forceManyBody().strength(isMini ? -200 : -600))
        .force("center", d3.forceCenter(width / 2, height / 2));

      var link = svg.append("g")
        .selectAll("line")
        .data(data.links)
        .join("line")
        .attr("class", function (d) { return "mm-link-" + d.type; });

      var nodeGroup = svg.append("g")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .attr("class", function (d) {
          var c = 'mm-node-group ';
          if (d.status === 'verified') c += 'kcc-node-verified ';
          if (d.status === 'fallback') c += 'mm-node-fallback ';
          return c;
        })
        .call(d3.drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended));

      var circle = nodeGroup.append("circle")
        .attr("class", "mm-node")
        .attr("r", isMini ? 12 : 24);

      var label = nodeGroup.append("text")
        .attr("class", "mm-node-text")
        .attr("dy", isMini ? 24 : 36)
        .attr("text-anchor", "middle")
        .text(function (d) { return d.label; });

      simulation.on("tick", function () {
        link
          .attr("x1", function (d) { return d.source.x; })
          .attr("y1", function (d) { return d.source.y; })
          .attr("x2", function (d) { return d.target.x; })
          .attr("y2", function (d) { return d.target.y; });
        nodeGroup
          .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
      });

      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return { svg: svg, nodes: nodeGroup, links: link, simulation: simulation };
    }
  };

  // ─── FULL SCREEN MIND MAP BINDINGS ───────────────────────
  var domBtnMindmap = document.getElementById('btn-open-mindmap');
  var domMindmapOverlay = document.getElementById('mindmap-overlay');
  var domBtnCloseMindmap = document.getElementById('btn-close-mindmap');
  var domBtnScanFallbacks = document.getElementById('btn-scan-fallbacks');
  var mindmapGraph = null;

  if (domBtnMindmap) {
    domBtnMindmap.addEventListener('click', function () {
      if (domMindmapOverlay) domMindmapOverlay.removeAttribute('hidden');
      if (!mindmapGraph) mindmapGraph = MindMapManager.init('mindmap-canvas-container', false);
    });
  }
  if (domBtnCloseMindmap) {
    domBtnCloseMindmap.addEventListener('click', function () {
      if (domMindmapOverlay) domMindmapOverlay.setAttribute('hidden', '');
    });
  }
  if (domBtnScanFallbacks) {
    domBtnScanFallbacks.addEventListener('click', function () {
      var container = document.getElementById('mindmap-canvas-container');
      if (container) container.classList.add('scan-glow');
    });
  }

  // ─── IN-CHAT KNOWLEDGE CHECK CARD ────────────────────────
  function injectKnowledgeCheckCard() {
    var kccId = 'kcc-' + Date.now();

    addMessage("KIDO is forming a map of this. Want to check his progress?", 'ai', 'sys-' + kccId);

    var cardHTML = `
      <div class="message message--system" style="margin-top:8px;">
        <span class="message__sender">System</span>
        <div class="knowledge-check-card" id="${kccId}">
          <div class="kcc-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Knowledge Check
          </div>
          <div class="kcc-map-container" id="map-${kccId}"></div>
          <div class="kcc-content" id="content-${kccId}">
            Select a node above to inspect KIDO's understanding.
          </div>
          <div class="kcc-actions">
            <button class="btn btn--sage-green" id="btn-approve-${kccId}" style="flex:1;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Approve
            </button>
            <button class="btn btn--unified-secondary" id="btn-correct-${kccId}" style="flex:1;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;margin-right:6px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              Correct
            </button>
          </div>
        </div>
      </div>
    `;

    if (dom.chatMessages) {
      dom.chatMessages.insertAdjacentHTML('beforeend', cardHTML);
      requestAnimationFrame(function () { dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight; });
    }

    if (dom.slideDeckChatMessages) {
      dom.slideDeckChatMessages.insertAdjacentHTML('beforeend', cardHTML.replace(kccId, kccId + '-mirror'));
      requestAnimationFrame(function () { dom.slideDeckChatMessages.scrollTop = dom.slideDeckChatMessages.scrollHeight; });
    }

    setTimeout(function () {
      var graph = MindMapManager.init('map-' + kccId, true);
      var contentArea = document.getElementById('content-' + kccId);
      var selectedNode = null;

      if (graph) {
        graph.nodes.on("click", function (event, d) {
          selectedNode = d;
          graph.nodes.classed('kcc-node-selected', false);
          d3.select(this).classed('kcc-node-selected', true);
          if (contentArea) contentArea.innerHTML = `<strong>KIDO's understanding of ${d.label}:</strong><br/>"${d.def}"`;
        });
      }

      var btnApprove = document.getElementById('btn-approve-' + kccId);
      var btnCorrect = document.getElementById('btn-correct-' + kccId);
      var mkidoWrap = document.getElementById('mindmap-kido-corner');

      if (btnApprove) {
        btnApprove.addEventListener('click', function () {
          if (!selectedNode || !graph) return;
          selectedNode.status = 'verified';
          graph.nodes.filter(function (n) { return n.id === selectedNode.id; })
            .classed('kcc-node-verified', true)
            .select('circle').classed('pulse-sage', true);
          if (contentArea) contentArea.innerHTML = `<span style="color:var(--state-mastered);font-weight:bold;">Approved!</span> KIDO's understanding is verified.`;

          if (mkidoWrap) mkidoWrap.classList.add('mkido-realization');
          setTimeout(function () { if (mkidoWrap) mkidoWrap.classList.remove('mkido-realization'); }, 2000);
        });
      }

      if (btnCorrect) {
        btnCorrect.addEventListener('click', function () {
          if (!selectedNode) return;
          if (contentArea) contentArea.innerHTML = `<textarea style="width:100%;height:60px;padding:8px;border:1px solid var(--plum);border-radius:4px;font-family:inherit;font-size:13px;" placeholder="Provide clarification for '${selectedNode.label}'..."></textarea>`;
        });
      }
    }, 50);
  }

  // ─── SPLIT PANE SLIDE DECK LOGIC ─────────────────────────────
  function openSlideDeck() {
    var pdfUrl = localStorage.getItem('learnback_pdf_url') || 'sample.pdf';
    var chatPanel = document.getElementById('chat-panel');
    var pdfPane = document.getElementById('slide-deck-view');
    var dragHandle = document.getElementById('center-resizer');
    var rightPanel = document.getElementById('right-panel');

    // Hide right panel to maximize teaching canvas space
    if (rightPanel) rightPanel.style.display = 'none';

    if (chatPanel) {
      chatPanel.classList.add('slides-open');
      if (!chatPanel.style.gridTemplateColumns) {
        requestAnimationFrame(function () {
          var rect = chatPanel.getBoundingClientRect();
          var gap = getSplitGapPx();
          var usableWidth = Math.max(0, rect.width - gap);
          setSplitLayout(usableWidth * 0.48);
        });
      }
    }
    if (pdfPane) {
      pdfPane.style.display = 'flex';
      pdfPane.removeAttribute('hidden');
      pdfPane.style.width = '';
    }
    if (dragHandle) {
      dragHandle.style.display = 'block';
      dragHandle.removeAttribute('hidden');
    }

    var chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.style.width = '';
    }

    if (window.LearnBackPDF) window.LearnBackPDF.open(pdfUrl);
  }

  function closeSlideDeck() {
    var chatPanel = document.getElementById('chat-panel');
    var pdfPane = document.getElementById('slide-deck-view');
    var dragHandle = document.getElementById('center-resizer');
    var rightPanel = document.getElementById('right-panel');

    // Restore right panel
    if (rightPanel) rightPanel.style.display = '';

    if (chatPanel) {
      chatPanel.classList.remove('slides-open');
      chatPanel.classList.remove('is-resizing');
      chatPanel.style.removeProperty('grid-template-columns');
    }
    if (pdfPane) {
      pdfPane.style.display = 'none';
      pdfPane.setAttribute('hidden', '');
    }
    if (dragHandle) {
      dragHandle.style.display = 'none';
      dragHandle.setAttribute('hidden', '');
    }

    var chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.style.width = 'auto';
    }

    setSlidePanelPointerEvents(true);
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (window.LearnBackPDF) window.LearnBackPDF.close();
  }

  // Resizer Drag Logic
  var dragHandle = document.getElementById('center-resizer');
  var chatContainer = document.getElementById('chat-container');
  var chatPanel = document.getElementById('chat-panel');
  var slideView = document.getElementById('slide-deck-view');
  var isDragging = false;
  var resizeShield = null;
  var applySplitFromClientX = function () { };
  var stopDragging = function () { };
  var startDragging = function () { };

  function getSplitGapPx() {
    if (!chatPanel) return 20;
    var rawGap = window.getComputedStyle(chatPanel).getPropertyValue('--session-split-gap');
    var gap = parseFloat(rawGap);
    return Number.isFinite(gap) ? gap : 20;
  }

  function getPanelMinWidth(varName, fallback) {
    if (!chatPanel) return fallback;
    var raw = window.getComputedStyle(chatPanel).getPropertyValue(varName);
    var value = parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function getSplitMetrics() {
    if (!chatPanel) {
      return { usableWidth: 0, minChatWidth: 48, minSlideWidth: 48, maxChatWidth: 48 };
    }

    var rect = chatPanel.getBoundingClientRect();
    var usableWidth = Math.max(0, rect.width - getSplitGapPx());
    var minChatWidth = Math.min(getPanelMinWidth('--session-chat-min-width', 200), Math.max(48, usableWidth - 48));
    var minSlideWidth = Math.min(getPanelMinWidth('--session-slide-min-width', 220), Math.max(48, usableWidth - 48));
    var maxChatWidth = usableWidth - minSlideWidth;

    if (maxChatWidth < minChatWidth) {
      minChatWidth = Math.max(48, usableWidth * 0.35);
      minSlideWidth = Math.max(48, usableWidth - minChatWidth);
      maxChatWidth = usableWidth - minSlideWidth;
    }

    return {
      usableWidth: usableWidth,
      minChatWidth: minChatWidth,
      minSlideWidth: minSlideWidth,
      maxChatWidth: Math.max(minChatWidth, maxChatWidth)
    };
  }

  function setSplitLayout(chatWidth) {
    if (!chatPanel) return;

    var gap = getSplitGapPx();
    var metrics = getSplitMetrics();
    if (!metrics.usableWidth) return;

    var clampedChatWidth = Math.min(metrics.maxChatWidth, Math.max(metrics.minChatWidth, chatWidth));
    chatPanel.style.gridTemplateColumns = clampedChatWidth + 'px ' + gap + 'px minmax(' + metrics.minSlideWidth + 'px, 1fr)';
  }

  function ensureResizeShield() {
    if (resizeShield) return resizeShield;

    resizeShield = document.createElement('div');
    resizeShield.id = 'session-resize-shield';
    resizeShield.style.position = 'fixed';
    resizeShield.style.inset = '0';
    resizeShield.style.zIndex = '9999';
    resizeShield.style.cursor = 'col-resize';
    resizeShield.style.background = 'transparent';
    resizeShield.style.display = 'none';
    resizeShield.style.touchAction = 'none';
    document.body.appendChild(resizeShield);

    resizeShield.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      applySplitFromClientX(e.clientX);
    });
    resizeShield.addEventListener('mouseup', stopDragging);
    resizeShield.addEventListener('mouseleave', stopDragging);
    resizeShield.addEventListener('touchmove', function (e) {
      if (!isDragging || !e.touches.length) return;
      e.preventDefault();
      applySplitFromClientX(e.touches[0].clientX);
    }, { passive: false });
    resizeShield.addEventListener('touchend', stopDragging);
    resizeShield.addEventListener('touchcancel', stopDragging);

    return resizeShield;
  }

  function showResizeShield() {
    ensureResizeShield().style.display = 'block';
  }

  function hideResizeShield() {
    if (resizeShield) {
      resizeShield.style.display = 'none';
    }
  }

  function setSlidePanelPointerEvents(enabled) {
    if (!slideView) return;

    var interactionLayer = slideView.querySelector('#pdf-viewer-container');
    var iframes = slideView.querySelectorAll('iframe');

    if (enabled) {
      delete slideView.dataset.resizing;
    } else {
      slideView.dataset.resizing = 'true';
    }

    if (interactionLayer) {
      interactionLayer.style.pointerEvents = enabled ? '' : 'none';
    }

    iframes.forEach(function (iframe) {
      iframe.style.pointerEvents = enabled ? 'auto' : 'none';
    });
  }

  if (dragHandle && chatContainer && chatPanel) {
    applySplitFromClientX = function (clientX) {
      var rect = chatPanel.getBoundingClientRect();
      if (!rect.width) return;
      var gap = getSplitGapPx();
      setSplitLayout(clientX - rect.left - (gap / 2));
    };

    stopDragging = function () {
      if (!isDragging) return;
      isDragging = false;
      chatPanel.classList.remove('is-resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      hideResizeShield();
      setSlidePanelPointerEvents(true);
    };

    startDragging = function (clientX) {
      isDragging = true;
      chatPanel.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      showResizeShield();
      setSlidePanelPointerEvents(false); // block iframe from stealing events
      applySplitFromClientX(clientX);
    };

    dragHandle.addEventListener('mousedown', function (e) {
      if (!chatPanel.classList.contains('slides-open') || e.button !== 0) return;
      e.preventDefault();
      startDragging(e.clientX);
    });

    dragHandle.addEventListener('touchstart', function (e) {
      if (!chatPanel.classList.contains('slides-open') || !e.touches.length) return;
      e.preventDefault();
      startDragging(e.touches[0].clientX);
    }, { passive: false });

    window.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      applySplitFromClientX(e.clientX);
    });

    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    window.addEventListener('resize', function () {
      if (!chatPanel.classList.contains('slides-open')) return;
      setSplitLayout(chatContainer.getBoundingClientRect().width);
    });
  }

  // Wire up the buttons
  var btnOpenSlides = document.getElementById('btn-open-slides');
  if (btnOpenSlides) btnOpenSlides.addEventListener('click', openSlideDeck);

  var btnCloseSlides = document.getElementById('btn-close-slides');
  if (btnCloseSlides) btnCloseSlides.addEventListener('click', closeSlideDeck);

  // Wire PDF Controls
  var btnZoomIn = document.getElementById('btn-zoom-in');
  if (btnZoomIn) btnZoomIn.addEventListener('click', function () { if (window.LearnBackPDF) window.LearnBackPDF.zoomIn(); });

  var btnZoomOut = document.getElementById('btn-zoom-out');
  if (btnZoomOut) btnZoomOut.addEventListener('click', function () { if (window.LearnBackPDF) window.LearnBackPDF.zoomOut(); });

  var btnZoomReset = document.getElementById('btn-zoom-reset');
  if (btnZoomReset) btnZoomReset.addEventListener('click', function () { if (window.LearnBackPDF) window.LearnBackPDF.zoomFit(); });

  // ─── Public API ───────────────────────────────────────────
  window.Session = {
    setTopic: function (i) { if (i >= 0 && i < state.topics.length) { state.currentTopic = i; refreshTopicUI(); } },
    setTopics: function (list) { state.topics = list; state.currentTopic = 0; refreshTopicUI(); },
    setTitle: function (title) {
      if (!title) return;
      state.sessionTitle = title;
      if (dom.sessionTitle) dom.sessionTitle.textContent = title;
      refreshTopicUI();
    },
    updateProgress: setProgress,
    appendMessage: addMessage,
    clearChat: clearChat,
    showSlides: openSlideDeck,
    closeSlides: closeSlideDeck,
    showStatus: showStatus,
    showKwl: showKwl,
    addKnowledge: addKnowledge,
    renderRoadmap: renderRoadmap,
    getState: function () { return Object.assign({}, state); },
  };

})();


// --- Plan 7: Session Persistence ---
document.addEventListener('DOMContentLoaded', async () => {
  if (!window.SessionStore || !window.Session) return;

  const sessionData = await window.SessionStore.resumeSession();
  if (!sessionData) return;

  if (typeof window.Session.setTopics === 'function' && Array.isArray(sessionData.topics)) {
    window.Session.setTopics(sessionData.topics.map(function (topic) {
      return typeof topic === 'string' ? topic : (topic.title || topic.name || 'Untitled Segment');
    }));
  }
  if (typeof window.Session.setTopic === 'function' && Number.isFinite(Number(sessionData.topicIndex))) {
    window.Session.setTopic(Number(sessionData.topicIndex));
  }
  if (typeof window.Session.updateProgress === 'function') {
    window.Session.updateProgress(Number(sessionData.progress) || 0);
  }
  if (typeof window.Session.setTitle === 'function' && sessionData.sessionTitle) {
    window.Session.setTitle(sessionData.sessionTitle);
  }

  console.log('Session Resumed:', sessionData);
});
