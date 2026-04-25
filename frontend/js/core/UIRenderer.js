/**
 * UIRenderer — Centralized DOM manipulation for the session UI.
 *
 * Preserves all visual patterns from the legacy script.js (HUD states,
 * concept card delta ghost, topic roadmap, typewriter animation) as
 * clean, callable methods.
 *
 * Built in 3 chunks:
 *   Part 1: Chat & Lockout (Chunk 2)
 *   Part 2: HUD, Progress & Concept Card (Chunk 3)
 *   Part 3: Roadmap, KWL, Modals & Connection State (Chunk 4)
 */

export class UIRenderer {
  /**
   * @param {Object} domRefs - The dom object from js/core/dom.js
   */
  constructor(domRefs) {
    this.dom = domRefs;
    this._messageCount = 0;
  }

  // ═══════════════════════════════════════════════════════════
  // PART 1: CHAT & LOCKOUT
  // ═══════════════════════════════════════════════════════════

  /**
   * Create a chat message DOM element.
   * Ported from script.js makeMsg() (L888-934).
   *
   * @param {string} text - Message text (use '...' for typing indicator)
   * @param {string} sender - 'user' | 'ai'
   * @param {number|string} msgId - Unique message ID
   * @returns {HTMLElement} The message wrapper element
   */
  _makeMsg(text, sender, msgId, options) {
    var isHint = options && options.isHint === true;
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
        b.innerHTML = '<div class="hint-note__label"><span class="hint-note__accent"></span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">' +
          '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5"></path>' +
          '<path d="M9 18h6"></path><path d="M10 22h4"></path></svg>' +
          '<span>Hint</span></div><div class="hint-note__text">' + dots + '</div>';
      } else {
        b.innerHTML = dots;
      }
    } else if (isHint) {
      b.innerHTML = '<div class="hint-note__label"><span class="hint-note__accent"></span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">' +
        '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5"></path>' +
        '<path d="M9 18h6"></path><path d="M10 22h4"></path></svg>' +
        '<span>Hint</span></div><div class="hint-note__text"></div>';
      b.querySelector('.hint-note__text').textContent = rawText;
    } else {
      b.textContent = rawText;
    }

    bubbleWrap.appendChild(b);
    stack.appendChild(bubbleWrap);
    w.appendChild(stack);
    return w;
  }

  /**
   * Append a message to the chat panel and auto-scroll.
   * Ported from script.js addMessage() (L937-971).
   *
   * @param {string} text
   * @param {string} sender - 'user' | 'ai'
   * @param {number|string} [msgId]
   * @returns {HTMLElement} The appended message element
   */
  _addMessage(text, sender, msgId, options) {
    var dom = this.dom;

    // Hide welcome screen on first message
    if (dom.chatWelcome && dom.chatWelcome.style.display !== 'none') {
      dom.chatWelcome.style.display = 'none';
    }

    var mainMsg = this._makeMsg(text, sender, msgId, options);
    if (dom.chatMessages) {
      dom.chatMessages.appendChild(mainMsg);
      requestAnimationFrame(function () {
        dom.chatMessages.scrollTo({ top: dom.chatMessages.scrollHeight, behavior: 'smooth' });
      });
    }

    return mainMsg;
  }

  /**
   * Append a user message to the chat.
   * @param {string} text
   */
  appendUserMessage(text) {
    var id = this._messageCount++;
    this._addMessage(text, 'user', id);
  }

  /**
   * Append a Kido (AI) message with typing indicator, then typewrite the text.
   * Returns a promise that resolves when typing is complete.
   *
   * @param {string} text - Kido's response text
   * @returns {Promise<void>}
   */
  appendKidoMessage(text) {
    var id = this._messageCount++;
    var msgEl = this._addMessage('...', 'ai', id);
    var bubble = msgEl.querySelector('.message__bubble');
    if (!bubble) return Promise.resolve();
    return this.typeMessage(bubble, text);
  }

  /**
   * Append a hint message (styled differently from regular AI messages).
   * @param {string} text
   * @returns {Promise<void>}
   */
  appendHintMessage(text) {
    var id = this._messageCount++;
    var msgEl = this._addMessage('...', 'ai', '__HINT__' + id, { isHint: true });
    var hintText = msgEl.querySelector('.hint-note__text');
    if (!hintText) return Promise.resolve();
    return this.typeMessage(hintText, text);
  }

  /**
   * Word-by-word typewriter animation.
   * Ported from script.js typeMessage() (L861-885).
   *
   * @param {HTMLElement} element - The bubble/text element to type into
   * @param {string} text - The full text to render
   * @returns {Promise<void>} Resolves when typing is complete
   */
  typeMessage(element, text) {
    var dom = this.dom;
    return new Promise(function (resolve) {
      var words = text.split(' ');
      var i = 0;
      element.innerHTML = '';

      function scrollDown() {
        if (dom.chatMessages) {
          dom.chatMessages.scrollTo({ top: dom.chatMessages.scrollHeight, behavior: 'smooth' });
        }
      }

      function typeNext() {
        if (i < words.length) {
          element.textContent += (i > 0 ? ' ' : '') + words[i];
          i++;
          scrollDown();
          setTimeout(typeNext, 30 + Math.random() * 20);
        } else {
          scrollDown();
          resolve();
        }
      }
      typeNext();
    });
  }

  /**
   * Lock or unlock the chat input and send button.
   * Ported from script.js setChatLockout() (L837-858).
   *
   * @param {boolean} locked
   */
  setChatLockout(locked) {
    var dom = this.dom;

    if (dom.chatInputField) {
      dom.chatInputField.disabled = locked;
      dom.chatInputField.style.opacity = locked ? '0.5' : '1';
    }
    if (dom.btnSend) {
      dom.btnSend.disabled = locked;
      dom.btnSend.style.opacity = locked ? '0.5' : '1';
      dom.btnSend.style.pointerEvents = locked ? 'none' : 'auto';
    }

    // Spark/hint button
    var btnSpark = document.getElementById('btn-spark');
    if (btnSpark) {
      btnSpark.disabled = locked;
      btnSpark.style.opacity = locked ? '0.5' : '1';
      btnSpark.style.cursor = locked ? 'default' : 'pointer';
    }
  }

  /**
   * Clear all chat messages and restore the welcome screen.
   * Ported from script.js clearChat() (L826-832).
   */
  clearChat() {
    var dom = this.dom;
    if (dom.chatMessages) {
      dom.chatMessages.querySelectorAll('.message').forEach(function (m) { m.remove(); });
    }
    if (dom.chatWelcome) {
      dom.chatWelcome.style.display = '';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PART 2: HUD, PROGRESS & CONCEPT CARD
  // ═══════════════════════════════════════════════════════════

  /**
   * Map backend evaluator_label to internal HUD state key.
   * Backend sends: CORRECT, INCORRECT, NEEDS_INFO, OFF_TOPIC
   * HUD expects: correct, incorrect, needs_detail, irrelevant, thinking, waiting
   */
  _mapEvaluatorLabel(label) {
    if (!label) return 'waiting';
    var map = {
      'CORRECT': 'correct',
      'correct': 'correct',
      'INCORRECT': 'incorrect',
      'incorrect': 'incorrect',
      'misconception': 'incorrect',
      'NEEDS_INFO': 'needs_detail',
      'needs_info': 'needs_detail',
      'needs_detail': 'needs_detail',
      'OFF_TOPIC': 'irrelevant',
      'off_topic': 'irrelevant',
      'irrelevant': 'irrelevant',
      'thinking': 'thinking',
      'waiting': 'waiting'
    };
    return map[label] || 'waiting';
  }

  /**
   * Update the KIDO Status HUD.
   * Ported from script.js updateHud() (L431-493).
   * Triggers AudioManager sounds (C1 preservation).
   *
   * @param {string} evaluatorLabel - Backend label or internal state key
   */
  updateHud(evaluatorLabel) {
    var stateKey = this._mapEvaluatorLabel(evaluatorLabel);
    var dom = this.dom;
    var hud = dom.hudEl;
    if (!hud) return;

    var cfg = UIRenderer.HUD_STATES[stateKey] || UIRenderer.HUD_STATES['waiting'];

    // Update data-state (drives all CSS state variants)
    hud.dataset.state = stateKey;

    // C1: Trigger gamification audio
    if (window.AudioManager) {
      if (stateKey === 'correct') {
        window.AudioManager.playSound('correct');
      } else if (stateKey === 'incorrect') {
        window.AudioManager.playSound('incorrect');
      }
    }

    // Swap icon + text
    if (dom.hudBadgeIcon) dom.hudBadgeIcon.innerHTML = cfg.icon;
    if (dom.hudBadgeText) dom.hudBadgeText.textContent = cfg.text;

    // Clear lingering animation classes
    hud.classList.remove('hud-anim-pop', 'hud-anim-shake', 'hud-anim-pulse');
    if (this._hudAnimTimeout) { clearTimeout(this._hudAnimTimeout); this._hudAnimTimeout = null; }

    if (cfg.anim === 'pulse') {
      hud.classList.add('hud-anim-pulse');
    } else if (cfg.anim) {
      void hud.offsetWidth; // force reflow for re-trigger
      hud.classList.add('hud-anim-' + cfg.anim);
      var animDuration = cfg.anim === 'pop' ? 230 : 340;
      var self = this;
      this._hudAnimTimeout = setTimeout(function () {
        hud.classList.remove('hud-anim-' + cfg.anim);
        self._hudAnimTimeout = null;
      }, animDuration);
    }
  }

  /**
   * Update the BKT progress bar, ring stub, peek card, and HUD percentage.
   * Ported from script.js setProgress() (L386-423).
   *
   * @param {number} pct - Progress percentage (0-100)
   */
  updateBktProgress(pct) {
    var dom = this.dom;
    var progress = Math.min(100, Math.max(0, Math.round(pct)));
    this._currentProgress = progress;

    var pctStr = progress === 0 ? '0' : progress + '%';
    var fillBg = progress > 0 ? '#022B3A' : 'transparent';

    // Main progress bar
    if (dom.progressFill) {
      dom.progressFill.style.width = pctStr;
      dom.progressFill.style.backgroundColor = fillBg;
    }
    if (dom.progressValue) dom.progressValue.textContent = progress + '%';
    if (dom.progressCard) dom.progressCard.setAttribute('aria-valuenow', progress);

    // HUD progress fill
    if (dom.hudProgressFill) {
      dom.hudProgressFill.style.width = pctStr;
      dom.hudProgressFill.style.backgroundColor = progress === 0 ? 'transparent' : '';
    }
    if (dom.hudProgressPct) dom.hudProgressPct.textContent = progress + '%';

    // Progress ring stub (circumference = 2π×16 ≈ 100.5)
    var circumference = 100.5;
    var offset = circumference * (1 - progress / 100);
    if (dom.stubRingFill) dom.stubRingFill.setAttribute('stroke-dashoffset', offset.toFixed(1));
    if (dom.stubRingPct) dom.stubRingPct.textContent = progress + '%';

    // Peek card
    if (dom.peekPct) dom.peekPct.textContent = progress + '%';
    var peekFill = document.getElementById('peek-bar-fill');
    if (peekFill) {
      peekFill.style.width = pctStr;
      peekFill.style.backgroundColor = fillBg;
    }
  }

  /**
   * Update the Concept Card with delta ghost visuals.
   * Ported from script.js updateConceptCard() (L499-601).
   *
   * @param {Object} entry - { text, type, delta }
   *   type: 'mastered'|'developing'|'revising'|'thinking'|'waiting'
   *   delta: numeric progress delta (can be negative)
   */
  updateConceptCard(entry) {
    var dom = this.dom;
    var card = dom.conceptCard;
    var textEl = dom.conceptCardText;
    var titleEl = dom.conceptCardTitle;
    if (!card || !textEl) return;

    var progress = this._currentProgress || 0;

    // Phase 1: fade out
    textEl.classList.add('is-exiting');

    setTimeout(function () {
      // Swap content
      textEl.textContent = entry.text;
      if (titleEl) {
        var cfg = UIRenderer.BADGE_CONFIG[entry.type] || UIRenderer.BADGE_CONFIG['thinking'];
        titleEl.innerHTML = cfg.icon + ' ' + cfg.text;
      }
      var stateMap = { mastered: 'mastered', developing: 'developing', revising: 'revising', thinking: 'thinking', waiting: 'waiting' };
      card.setAttribute('data-state', stateMap[entry.type] || 'thinking');

      // Delta Ghost Visuals
      var f1 = dom.conceptGhostFill1;
      var f2 = dom.conceptGhostFill2;
      var out = dom.conceptGhostOutline;
      var badge = dom.conceptProgressBadge;

      if (f1 && f2 && out && badge) {
        f2.style.display = 'none';
        out.style.display = 'none';
        badge.style.display = 'flex';
        badge.className = 'concept-badge';
        badge.innerHTML = '';

        if (entry.type === 'mastered') {
          f1.style.width = progress + '%';
          badge.style.left = progress + '%';
          badge.style.borderColor = '#BBF7D0';
          badge.style.color = '#166534';
          badge.innerHTML = '+' + (entry.delta || 0) + '%';
          badge.style.opacity = '1';

        } else if (entry.type === 'developing') {
          f1.style.width = progress + '%';
          out.style.display = 'block';
          out.style.left = progress + '%';
          out.style.width = '15%';
          badge.style.left = (progress + 15) + '%';
          badge.style.color = 'rgba(26, 31, 54, 0.4)';
          badge.style.borderColor = '#FDE68A';
          badge.innerHTML = '+0%';
          badge.style.opacity = '1';

        } else if (entry.type === 'revising') {
          f1.style.width = progress + '%';
          f2.style.display = 'block';
          f2.style.left = progress + '%';
          f2.style.width = Math.abs(entry.delta || 0) + '%';
          badge.className = 'concept-badge negative';
          badge.style.left = progress + '%';
          badge.style.borderColor = '#FBCFE8';
          badge.innerHTML = '<span style="color: #7A3F60;">' + (entry.delta || 0) + '%</span>';
          badge.style.opacity = '1';

        } else {
          f1.style.width = progress + '%';
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

  // ═══════════════════════════════════════════════════════════
  // PART 3: ROADMAP, MODALS & CONNECTION STATE
  // ═══════════════════════════════════════════════════════════

  /**
   * Set the session title in the nav bar.
   * @param {string} title
   */
  updateSessionTitle(title) {
    var dom = this.dom;
    if (dom.sessionTitleEl) dom.sessionTitleEl.textContent = title || '';
    if (dom.headerTopic) dom.headerTopic.textContent = title || '';
  }

  /**
   * Render the topic roadmap in the right panel.
   * Ported from script.js renderRoadmap() (L166-236).
   *
   * @param {string[]} topics - Array of topic title strings
   * @param {number} currentIdx - Index of the current topic
   * @param {number[]} skippedIndices - Indices of skipped topics
   */
  renderTopicList(topics, currentIdx, skippedIndices) {
    var dom = this.dom;
    var tl = dom.topicList;
    if (!tl) return;
    tl.innerHTML = '';

    var skipped = skippedIndices || [];

    if (!topics || topics.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'topic-card topic-card--empty';
      empty.textContent = 'No session topics are loaded yet.';
      tl.appendChild(empty);
      return;
    }

    var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    var ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
    var ICON_SKIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

    topics.forEach(function (topic, i) {
      var card = document.createElement('div');
      card.className = 'topic-card';
      card.dataset.topicIndex = i;

      var icon = document.createElement('div');
      icon.className = 'topic-icon';

      var content = document.createElement('div');
      content.className = 'topic-content';

      var title = document.createElement('span');
      title.className = 'topic-title';
      title.textContent = topic;

      if (i < currentIdx) {
        if (skipped.indexOf(i) !== -1) {
          card.classList.add('is-skipped');
          icon.innerHTML = ICON_SKIP;
          content.appendChild(title);
          var badge = document.createElement('span');
          badge.className = 'topic-badge';
          badge.textContent = 'Skipped';
          content.appendChild(badge);
        } else {
          card.classList.add('is-past');
          icon.innerHTML = ICON_CHECK;
          content.appendChild(title);
        }
      } else if (i === currentIdx) {
        card.classList.add('is-current');
        icon.innerHTML = ICON_CLOCK;
        content.appendChild(title);
      } else {
        card.classList.add('is-upcoming');
        icon.innerHTML = ICON_CLOCK;
        content.appendChild(title);
        // Upcoming topics are clickable (skip-to) via event delegation
        card.setAttribute('data-action', 'skip_topic');
        card.setAttribute('data-target-index', String(i));
        card.style.cursor = 'pointer';
        card.title = 'Click to skip to this topic';
      }

      card.appendChild(icon);
      card.appendChild(content);
      tl.appendChild(card);
    });

    // Update header topic display
    var headerTopic = topics[currentIdx] || '';
    if (dom.headerTopic) dom.headerTopic.textContent = headerTopic;
  }

  /**
   * Render the misconceptions list in the right panel.
   * @param {SessionState} state 
   */
  renderMisconceptions(state) {
    var dom = this.dom;
    if (!dom.misconceptionsList || !dom.misconceptionsEmpty) return;

    var allMisc = [];
    if (state && Array.isArray(state.topics)) {
      state.topics.forEach(function (topic) {
        if (!Array.isArray(topic.points)) return;
        topic.points.forEach(function (point) {
          if (Array.isArray(point.misconceptions)) {
            point.misconceptions.forEach(function (m) {
              if (m && m.misconception) allMisc.push(m.misconception);
            });
          }
        });
      });
    }

    dom.misconceptionsList.innerHTML = '';

    if (dom.misconceptionsBadge) {
      dom.misconceptionsBadge.textContent = allMisc.length;
      if (allMisc.length > 0) {
        dom.misconceptionsBadge.removeAttribute('hidden');
      } else {
        dom.misconceptionsBadge.setAttribute('hidden', '');
      }
    }

    if (allMisc.length === 0) {
      dom.misconceptionsEmpty.style.display = 'flex';
      dom.misconceptionsList.style.display = 'none';
    } else {
      dom.misconceptionsEmpty.style.display = 'none';
      dom.misconceptionsList.style.display = 'block';

      allMisc.forEach(function (text) {
        var div = document.createElement('div');
        div.className = 'thought-stream__item';
        div.style.padding = '12px 16px';
        div.style.background = 'rgba(239, 68, 68, 0.06)';
        div.style.border = '1px solid rgba(239, 68, 68, 0.35)';
        div.style.borderRadius = '12px';
        div.style.marginBottom = '12px';
        div.style.fontSize = '0.92rem';
        div.style.lineHeight = '1.6';
        div.style.color = '#b91c1c';
        div.textContent = text;
        dom.misconceptionsList.appendChild(div);
      });
    }
  }

  /**
   * Set the Cube (Knowledge Graph) button state based on widget_type.
   * Disabled for TEXT, glowing for PROCESS/COMPARISON.
   *
   * @param {string} widgetType - 'TEXT'|'PROCESS'|'COMPARISON'|'MATH'|'MIND_MAP'
   */
  setCubeState(widgetType) {
    var btn = this.dom.btnRequestGraph;
    if (!btn) return;

    var type = (widgetType || 'TEXT').toUpperCase();
    if (type === 'TEXT' || type === 'MIND_MAP') {
      btn.disabled = true;
      btn.classList.remove('cube-active');
      btn.style.opacity = '0.4';
    } else {
      btn.disabled = false;
      btn.classList.add('cube-active');
      btn.style.opacity = '1';
    }
  }

  // ── C3: Mind Map Checkpoint Stub ────────────────────────────

  /**
   * Show the Mind Map checkpoint modal with editable cards.
   * @param {Array<{title: string, summary: string}>} mindMapData
   */
  showMindMapModal(mindMapData) {
    var dom = this.dom;
    var container = dom.mindmapNodesContainer;
    if (!container) return;

    container.innerHTML = '';

    var data = mindMapData || {};
    var nodes = data.nodes || [];

    if (nodes.length === 0) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary);">No mind map data available.</div>';
    } else {
      nodes.forEach(function (node) {
        var card = document.createElement('div');
        card.style.cssText = 'background:var(--bg-secondary,#f9fafb); border:1px solid var(--border-color,#e5e7eb); border-radius:10px; padding:12px; margin-bottom:12px;';

        var label = document.createElement('label');
        label.style.cssText = 'display:block; font-weight:600; font-size:13px; margin-bottom:6px; color:var(--text-primary,#1a1f36);';
        // TODO: REMOVE AFTER DTO STANDARDIZATION (remove node.title fallback)
        label.textContent = node.point || node.title || 'Untitled';

        var textarea = document.createElement('textarea');
        textarea.className = 'mindmap-correction';
        // TODO: REMOVE AFTER DTO STANDARDIZATION (remove node.title fallback)
        textarea.setAttribute('data-point-title', node.point || node.title || '');
        textarea.rows = 2;
        textarea.style.cssText = 'width:100%; padding:8px; border:1px solid var(--border-color,#e2e2e5); border-radius:6px; font-family:inherit; font-size:13px; resize:vertical;';
        // TODO: REMOVE AFTER DTO STANDARDIZATION (remove node.summary fallback)
        textarea.value = node.kido_sentence || node.summary || '';
        textarea.placeholder = 'Correct Kido\'s understanding here...';

        card.appendChild(label);
        card.appendChild(textarea);
        container.appendChild(card);
      });
    }

    if (dom.mindmapCheckpointModal) dom.mindmapCheckpointModal.removeAttribute('hidden');
  }

  /** Hide the Mind Map checkpoint modal. */
  hideMindMapModal() {
    if (this.dom.mindmapCheckpointModal) this.dom.mindmapCheckpointModal.setAttribute('hidden', '');
  }

  /**
   * Read corrections from the Mind Map modal textareas.
   * @returns {Object} { point_title: corrected_summary, ... }
   */
  getMindMapCorrections() {
    var corrections = {};
    var textareas = document.querySelectorAll('.mindmap-correction');
    textareas.forEach(function (ta) {
      var pointTitle = ta.getAttribute('data-point-title') || '';
      corrections[pointTitle] = ta.value || '';
    });
    return corrections;
  }

  // ── C3: Widget Stub Modal ──────────────────────────────────

  /**
   * Show the widget stub modal with data display.
   * @param {string} widgetType - 'PROCESS'|'COMPARISON'
   * @param {Object} widgetData - Raw widget_data from backend
   */
  showWidgetModal(widgetType, widgetData) {
    var dom = this.dom;
    if (dom.widgetModalTitle) {
      dom.widgetModalTitle.textContent = (widgetType || 'Widget').toUpperCase() + ' Widget';
    }
    
    var display = dom.widgetDataDisplay;
    if (display) {
      display.innerHTML = '';
      display.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 12px; font-family: inherit; font-size: 13px; white-space: normal;';
      
      var data = widgetData || {};
      
      if (Object.keys(data).length === 0) {
         display.innerHTML = '<span style="color:var(--text-tertiary);">No schema provided.</span>';
      } else {
         var html = '<strong>Schema Requirements:</strong><ul style="margin-top: 8px; padding-left: 20px; color: var(--text-secondary);">';
         
         if (Array.isArray(data.steps)) {
            data.steps.forEach(function(s) {
               html += '<li>' + s + '</li>';
            });
         } else if (Array.isArray(data.categories)) {
            data.categories.forEach(function(c) {
               html += '<li>Category: ' + c + '</li>';
            });
            if (Array.isArray(data.attributes)) {
               data.attributes.forEach(function(a) {
                  html += '<li>Item: ' + (a.text || a) + '</li>';
               });
            }
         } else {
            Object.keys(data).forEach(function(key) {
               html += '<li><strong>' + key + '</strong>: Structured Data</li>';
            });
         }
         html += '</ul>';
         display.innerHTML = html;
      }
    }
    
    if (dom.widgetInput) dom.widgetInput.value = '';
    if (dom.widgetModal) dom.widgetModal.removeAttribute('hidden');
  }

  /** Hide the widget stub modal. */
  hideWidgetModal() {
    if (this.dom.widgetModal) this.dom.widgetModal.setAttribute('hidden', '');
  }

  /**
   * Read user submission from the widget modal textarea.
   * @returns {Object} Parsed JSON, or empty object on parse failure
   */
  getWidgetSubmission() {
    var raw = this.dom.widgetInput ? this.dom.widgetInput.value.trim() : '';
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[UIRenderer] Widget submission JSON parse failed:', e.message);
      return {};
    }
  }

  // ── Session Complete Overlay ────────────────────────────────

  /**
   * Show the session complete overlay.
   * @param {string|number} sessionId
   */
  showSessionCompleteOverlay(sessionId) {
    if (this.dom.sessionCompleteOverlay) {
      this.dom.sessionCompleteOverlay.removeAttribute('hidden');
    }
    this.setChatLockout(true);
  }

  // ── Loading Overlay ────────────────────────────────────────

  /** Show the loading overlay (visible by default in HTML). */
  showLoading() {
    if (this.dom.sessionLoading) this.dom.sessionLoading.style.display = 'flex';
  }

  /** Hide the loading overlay. */
  hideLoading() {
    if (this.dom.sessionLoading) this.dom.sessionLoading.style.display = 'none';
  }

  // ── Connection State ───────────────────────────────────────

  /**
   * Display WS connection state to the user.
   * @param {string} state - 'connecting'|'connected'|'disconnected'|'reconnecting'
   */
  showConnectionState(state) {
    // Use the HUD text area for connection state feedback
    var dom = this.dom;
    if (state === 'connecting' || state === 'reconnecting') {
      if (dom.hudBadgeText) dom.hudBadgeText.textContent = state === 'reconnecting' ? 'RECONNECTING...' : 'CONNECTING...';
    } else if (state === 'disconnected') {
      if (dom.hudBadgeText) dom.hudBadgeText.textContent = 'DISCONNECTED';
    }
    // 'connected' state is handled by updateHud('waiting')
  }
}

// ── Static Constants ──────────────────────────────────────────

/** HUD SVG Icons (Lucide line-art) */
UIRenderer.HUD_ICONS = {
  correct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/><path d="M12 2 L13.5 5 L17 5.5 L14.5 8 L15 11.5 L12 10 L9 11.5 L9.5 8 L7 5.5 L10.5 5 Z" fill="currentColor" stroke="none" opacity="0.5"/></svg>',
  incorrect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  irrelevant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12" stroke-dasharray="4 3"/><polyline points="15 8 19 12 15 16"/></svg>',
  thinking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" stroke-dasharray="3 2"><animate attributeName="stroke-dashoffset" from="5" to="0" dur="0.8s" repeatCount="indefinite"/></line><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  waiting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
};

/** HUD state configuration */
UIRenderer.HUD_STATES = {
  correct: { text: 'Correct', icon: UIRenderer.HUD_ICONS.correct, anim: 'pop' },
  incorrect: { text: 'Incorrect', icon: UIRenderer.HUD_ICONS.incorrect, anim: 'shake' },
  needs_detail: { text: 'NEEDS MORE DETAIL', icon: UIRenderer.HUD_ICONS.irrelevant, anim: null },
  irrelevant: { text: 'OUT OF SCOPE', icon: UIRenderer.HUD_ICONS.irrelevant, anim: null },
  thinking: { text: 'THINKING...', icon: UIRenderer.HUD_ICONS.thinking, anim: 'pulse' },
  waiting: { text: 'READY TO LEARN', icon: UIRenderer.HUD_ICONS.waiting, anim: null }
};

/** Concept Card badge configuration */
UIRenderer.BADGE_CONFIG = {
  mastered: { text: 'Correct', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"></polyline></svg>' },
  developing: { text: 'Needs Detail', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' },
  revising: { text: 'Incorrect', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' },
  thinking: { text: 'THINKING', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4 4"><animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" /></line></svg>' },
  waiting: { text: 'WAITING FOR INPUT', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' }
};
