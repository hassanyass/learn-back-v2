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

import { MindMapAdapter } from '../adapters/MindMapAdapter.js';

export class UIRenderer {
  /**
   * @param {Object} domRefs - The dom object from js/core/dom.js
   */
  constructor(domRefs) {
    this.dom = domRefs;
    this._messageCount = 0;
    this._lastEvaluationEmotion = 'idle';
    this._emotionStreak = 1;
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
          // Use instant scroll during typewriter to prevent animation stuttering/popping
          dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
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

    // ── CHARACTER ANIMATION STATE INTEGRATION ──
    var canvas = document.getElementById('kido-canvas');
    var iframe = document.getElementById('kido-animation-frame');
    
    if (canvas && iframe) {
      if (stateKey === 'waiting' || stateKey === 'thinking') {
        // Fallback to default Idle Lottie visually, but DO NOT reset the streak history
        console.log('[UIRenderer] Animation State Fallback to IDLE (canvas visible). stateKey:', stateKey);
        canvas.style.display = 'block';
        canvas.style.opacity = '1';
        iframe.style.display = 'none';
        iframe.style.opacity = '0';
      } else {
        // Map states to emotions
        var emotion = 'idle';
        if (stateKey === 'correct') emotion = 'got_it';
        else if (stateKey === 'incorrect' || stateKey === 'irrelevant') emotion = 'confused';
        else if (stateKey === 'needs_detail') emotion = 'needs_more_information';
        
        if (emotion !== 'idle') {
          // Update streak (ignore waiting/thinking for streak calculations)
          if (this._lastEvaluationEmotion === emotion) {
            this._emotionStreak++;
          } else {
            this._lastEvaluationEmotion = emotion;
            this._emotionStreak = 1;
          }
          
          // Determine file level
          var maxLevel = 1;
          if (emotion === 'got_it') maxLevel = 3;
          if (emotion === 'confused') maxLevel = 2;
          
          var level = Math.min(this._emotionStreak, maxLevel);
          var fileName = emotion + '_level_' + level + '.html?headless=true';
          
          var targetSrc = './animation_states/' + fileName;
          
          console.log('[UIRenderer] Updating Animation State:', {
            emotion: emotion,
            streak: this._emotionStreak,
            targetSrc: targetSrc
          });
          
          // Avoid reloading the iframe if the source is exactly the same
          if (!iframe.src || !iframe.src.includes(fileName)) {
             iframe.onload = function() {
               canvas.style.display = 'none';
               canvas.style.opacity = '0';
               iframe.style.opacity = '1';
             };
             // Keep iframe invisible while loading
             iframe.style.display = 'block';
             iframe.style.opacity = '0';
             iframe.src = targetSrc;
          } else {
             // Already loaded, just toggle
             canvas.style.display = 'none';
             canvas.style.opacity = '0';
             iframe.style.display = 'block';
             iframe.style.opacity = '1';
          }
        }
      }
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
   * Render the KWL (What Kido Learned) tab list.
   * @param {Array<{title: string, summary: string}>} list
   */
  updateKWLTab(list) {
    var dom = this.dom;
    if (!dom.kwlList || !dom.kwlEmpty) return;

    dom.kwlList.innerHTML = '';
    
    if (dom.kwlCountBadge) {
      dom.kwlCountBadge.textContent = list.length;
      if (list.length > 0) {
        dom.kwlCountBadge.removeAttribute('hidden');
      } else {
        dom.kwlCountBadge.setAttribute('hidden', '');
      }
    }

    if (list.length === 0) {
      dom.kwlEmpty.style.display = 'flex';
      dom.kwlList.style.display = 'none';
    } else {
      dom.kwlEmpty.style.display = 'none';
      dom.kwlList.style.display = 'block';

      list.forEach(function (item) {
        var card = document.createElement('div');
        card.style.cssText = 'background:var(--bg-secondary,#f9fafb); border:1px solid var(--border-color,#e5e7eb); border-radius:10px; padding:12px; margin-bottom:12px;';

        var title = document.createElement('div');
        title.style.cssText = 'font-weight:600; font-size:13px; margin-bottom:6px; color:var(--text-primary,#1a1f36);';
        title.textContent = item.title || 'Untitled';

        var summary = document.createElement('div');
        summary.style.cssText = 'font-size:12px; color:var(--text-secondary,#4b5563); line-height:1.4;';
        summary.textContent = item.summary || 'No summary available.';

        card.appendChild(title);
        card.appendChild(summary);
        dom.kwlList.appendChild(card);
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

  /**
   * Render the Knowledge Cube widget directly into the chat feed.
   * Ported from script.js.bak injectKnowledgeCubeCard().
   * Enforces idempotent rendering via backend event_id.
   *
   * @param {Object} graphData - The backend mind_map_data payload
   * @param {Function} onSubmitCallback - Called with (nodeLabel, correctionText) on annotation
   */
  renderKnowledgeCubeWidget(graphData, onSubmitCallback, onContinueCallback) {
    var dom = this.dom;
    if (!dom.chatMessages) return;

    var rawData = graphData || {};
    var normalizedNodes = MindMapAdapter.normalize(rawData);
    var nodes = normalizedNodes || [];
    var renderId = normalizedNodes.eventId || 'mm_evt_unknown';

    console.log('[UIRenderer] Mind Map rawData:', rawData);
    console.log('[UIRenderer] Normalized Nodes:', nodes.length, 'nodes, eventId:', renderId);

    // 1. Idempotency Check
    var existingRender = dom.chatMessages.querySelector('.kc-root[data-render-id="' + renderId + '"]');
    if (existingRender) {
      console.warn('[UI] Duplicate mind map render blocked:', renderId);
      requestAnimationFrame(function () {
        existingRender.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return existingRender;
    }

    // 2. Destroy previous widget
    var existingWidget = dom.chatMessages.querySelector('.kc-root');
    if (existingWidget) {
      var existingWrapper = existingWidget.closest('.message--ai');
      if (existingWrapper) existingWrapper.remove();
      else existingWidget.remove();
    }

    // 3. Empty state
    var hasNodes = nodes.length > 0;

    // 4. Map adapter canonical → KC internal format
    var kcNodes = nodes.map(function(n) {
      var kcStatus = 'pending';
      if (n.status === 'correct') kcStatus = 'reviewed';
      else if (n.status === 'incorrect') kcStatus = 'corrected';
      return { id: n.id, title: n.label, thought: n.value, status: kcStatus, correction: '' };
    });

    var kcConnections = [];
    for (var ci = 0; ci < kcNodes.length - 1; ci++) {
      kcConnections.push([kcNodes[ci].id, kcNodes[ci + 1].id]);
    }

    function kcNodeById(nid) { return kcNodes.find(function(n) { return n.id === nid; }); }

    var currentId = this._messageCount++;

    // 5. Theme
    var rootStyles = getComputedStyle(document.documentElement);
    function tv(name, fb) { var v = rootStyles.getPropertyValue(name); return v ? v.trim() : fb; }
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var T = isDark ? {
      bubbleBg: tv('--surface-2', '#123543'), widgetBg: tv('--widget-shell-bg', 'linear-gradient(180deg, #173F4D, #123543)'),
      widgetBorder: tv('--widget-shell-border', 'rgba(234, 244, 247, 0.10)'), widgetShadow: tv('--shadow-zone', '0 14px 36px rgba(0,0,0,0.34)'),
      topBarBg: tv('--widget-header-bg', 'rgba(6, 23, 32, 0.72)'), topBarBorder: tv('--border', 'rgba(234, 244, 247, 0.10)'),
      topBarIconBg: tv('--navy', '#061720'), topBarIconFg: tv('--plum', '#B07A96'),
      title: tv('--widget-title', '#EAF4F7'), hint: tv('--widget-hint', 'rgba(243,210,224,0.82)'),
      legend: tv('--widget-legend', '#A9C0C8'), pendingBg: tv('--widget-pending-bg', '#123543'),
      pendingBorder: tv('--widget-pending-border', 'rgba(234, 244, 247, 0.18)'), pendingShadow: tv('--widget-pending-shadow', '#081d26'),
      pendingText: tv('--widget-pending-text', '#EAF4F7'), connector: tv('--widget-connector', '#d6a7bf'),
      reviewBadgeBg: tv('--navy', '#061720'), reviewBadgeText: tv('--text-primary', '#EAF4F7'),
      reviewTitle: tv('--text-primary', '#EAF4F7'), quoteCardBg: tv('--widget-quote-bg', '#123543'),
      quoteCardBorder: tv('--widget-quote-border', 'rgba(234, 244, 247, 0.18)'), quoteCardShadow: tv('--widget-pending-shadow', '#081d26'),
      quoteText: tv('--widget-quote-text', '#EAF4F7'), priorBg: tv('--widget-prior-bg', 'rgba(230,176,74,0.12)'),
      priorBorder: tv('--widget-prior-border', 'rgba(230,176,74,0.28)'), priorLabel: tv('--widget-prior-label', '#f6d58f'),
      buttonSecondaryBg: tv('--widget-secondary-bg', '#123543'), buttonSecondaryText: tv('--widget-secondary-text', '#f3d2e0'),
      textareaBg: tv('--widget-textarea-bg', '#0D2A34'), textareaBorder: tv('--widget-textarea-border', 'rgba(234, 244, 247, 0.18)'),
      textareaText: tv('--widget-textarea-text', '#EAF4F7')
    } : {
      bubbleBg: 'transparent', widgetBg: '#F6E8EA', widgetBorder: '#925E78',
      widgetShadow: '0 2px 12px rgba(0,0,0,0.07)', topBarBg: 'rgba(255,255,255,0.7)',
      topBarBorder: 'rgba(146,94,120,0.2)', topBarIconBg: '#022B3A', topBarIconFg: '#F6E8EA',
      title: '#022B3A', hint: '#925E78', legend: 'rgba(2,43,58,0.6)',
      pendingBg: 'white', pendingBorder: '#022B3A', pendingShadow: '#022B3A', pendingText: '#022B3A',
      connector: '#925E78', reviewBadgeBg: '#022B3A', reviewBadgeText: 'white', reviewTitle: '#022B3A',
      quoteCardBg: 'white', quoteCardBorder: '#022B3A', quoteCardShadow: '#022B3A', quoteText: '#022B3A',
      priorBg: '#FFF8E7', priorBorder: 'rgba(245,166,35,0.4)', priorLabel: '#D4870A',
      buttonSecondaryBg: 'white', buttonSecondaryText: '#925E78',
      textareaBg: 'white', textareaBorder: 'rgba(146,94,120,0.4)', textareaText: '#022B3A'
    };

    // 6. Build wrapper
    var msgWrapper = document.createElement('div');
    msgWrapper.className = 'message message--ai message--ai-widget';
    var bubble = document.createElement('div');
    bubble.className = 'message__bubble message__bubble--app kc-root';
    bubble.setAttribute('data-render-id', renderId);
    bubble.style.cssText = 'padding:0; overflow:hidden; border-radius:14px; width:100%; max-width:100%; background:' + T.bubbleBg + '; border:none; box-shadow:none;';

    // 7. Widget root
    var widget = document.createElement('div');
    widget.style.cssText = 'font-family:Inter,system-ui,sans-serif; background:' + T.widgetBg + '; border:1.5px solid ' + T.widgetBorder + '; border-radius:14px; overflow:hidden; box-shadow:' + T.widgetShadow + '; width:100%;';

    var topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:14px 16px 12px; border-bottom:1px solid ' + T.topBarBorder + '; background:' + T.topBarBg + '; text-align:center;';
    topBar.innerHTML = '<div style="width:26px;height:26px;border-radius:50%;background:' + T.topBarIconBg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="14" height="10" viewBox="0 0 14 10" fill="none"><rect x="0" y="3" width="14" height="4" rx="2" fill="' + T.topBarIconFg + '"/></svg></div><div style="font-size:10px;font-weight:700;color:' + T.title + ';letter-spacing:.07em;text-transform:uppercase;">KIDO (Knowledge Map)</div><div style="font-size:10px;color:' + T.hint + ';font-weight:600;letter-spacing:.04em;text-transform:uppercase;">' + (hasNodes ? 'Tap a cube to review my thinking' : 'Start teaching to build the map') + '</div>';

    // 8. Graph View
    var graphView = document.createElement('div');
    graphView.id = 'kc-graph-' + currentId;
    graphView.style.cssText = 'padding:22px 20px 20px;';
    var canvas = document.createElement('div');
    canvas.style.cssText = 'position:relative; padding:0;';
    var svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgLayer.setAttribute('class', 'kc-svg-layer');
    svgLayer.id = 'kc-svg-' + currentId;
    var cubeWrap = document.createElement('div');
    cubeWrap.id = 'kc-cubes-' + currentId;
    cubeWrap.style.cssText = 'display:flex;justify-content:center;gap:40px;position:relative;z-index:1;padding:18px 0;flex-wrap:wrap;';
    canvas.appendChild(svgLayer);
    canvas.appendChild(cubeWrap);

    var legendEl = document.createElement('div');
    legendEl.style.cssText = 'display:flex;justify-content:center;gap:14px;margin-top:10px;font-size:10px;font-weight:600;color:' + T.legend + ';';
    legendEl.innerHTML = '<span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:' + T.pendingBg + ';border:1.5px solid ' + T.pendingBorder + ';display:inline-block;"></span>Pending</span><span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:#D6EDDA;border:1.5px solid #5DA271;display:inline-block;"></span>Correct</span><span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:#FFF3CD;border:1.5px solid #F5A623;display:inline-block;"></span>Corrected</span>';
    graphView.appendChild(canvas);
    graphView.appendChild(legendEl);

    if (!hasNodes) {
      legendEl.style.display = 'none';
      canvas.innerHTML = '<div style="padding:28px 16px 18px; text-align:center; display:flex; flex-direction:column; gap:8px; align-items:center; justify-content:center; min-height:180px;"><div style="font-size:16px; font-weight:700; color:' + T.reviewTitle + ';">Kido hasn\'t learned anything yet.</div><div style="font-size:13px; line-height:1.5; color:' + T.legend + '; max-width:420px;">Start teaching to build the map.</div></div>';
    }

    var footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 16px 16px; border-top:1px solid ' + T.topBarBorder + '; background:' + T.topBarBg + ';';
    footer.innerHTML = '<button type="button" id="kc-continue-' + currentId + '" style="width:100%; background:#022B3A; color:white; font-size:13px; font-weight:700; border:none; border-radius:10px; padding:11px 14px; cursor:pointer; box-shadow:0 3px 0 rgba(2,43,58,0.28);">Continue Learning</button>';

    // 9. Review View
    var reviewView = document.createElement('div');
    reviewView.id = 'kc-review-' + currentId;
    reviewView.className = 'kc-review-panel';
    reviewView.style.cssText = 'display:none; padding:14px 14px 12px;';
    reviewView.innerHTML = [
      '<button id="kc-back-' + currentId + '" style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:' + T.hint + ';background:none;border:none;cursor:pointer;margin-bottom:12px;padding:0;">',
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="' + T.hint + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Back to Map</button>',
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">',
      '<span id="kc-r-badge-' + currentId + '" style="font-size:10px;font-weight:700;background:' + T.reviewBadgeBg + ';color:' + T.reviewBadgeText + ';padding:2px 7px;border-radius:99px;"></span>',
      '<span id="kc-r-title-' + currentId + '" style="font-size:14px;font-weight:700;color:' + T.reviewTitle + ';"></span></div>',
      '<div style="position:relative;background:' + T.quoteCardBg + ';border:2px solid ' + T.quoteCardBorder + ';border-radius:12px;padding:12px 12px 12px 20px;margin-bottom:10px;box-shadow:3px 3px 0 ' + T.quoteCardShadow + ';">',
      '<span style="position:absolute;top:-14px;left:-4px;font-size:32px;color:' + T.hint + ';line-height:1;user-select:none;">&ldquo;</span>',
      '<p id="kc-r-thought-' + currentId + '" style="font-size:12px;color:' + T.quoteText + ';line-height:1.55;font-style:italic;"></p></div>',
      '<div id="kc-prior-' + currentId + '" style="display:none;background:' + T.priorBg + ';border:1px solid ' + T.priorBorder + ';border-radius:8px;padding:8px 10px;margin-bottom:10px;">',
      '<p style="font-size:10px;font-weight:700;color:' + T.priorLabel + ';margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em;">Your previous correction</p>',
      '<p id="kc-prior-text-' + currentId + '" style="font-size:11px;color:' + T.quoteText + ';font-style:italic;"></p></div>',
      '<div style="display:flex;gap:8px;margin-bottom:8px;">',
      '<button id="kc-good-' + currentId + '" style="flex:1;background:#5DA271;color:white;font-size:12px;font-weight:700;border:none;border-radius:10px;padding:9px;cursor:pointer;box-shadow:0 3px 0 #3d7a53;display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .15s,box-shadow .15s;">',
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Looks Good!</button>',
      '<button id="kc-wrong-' + currentId + '" style="flex:1;background:' + T.buttonSecondaryBg + ';color:' + T.buttonSecondaryText + ';font-size:12px;font-weight:700;border:2px solid ' + T.hint + ';border-radius:10px;padding:9px;cursor:pointer;box-shadow:0 3px 0 ' + T.hint + ';display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .15s,box-shadow .15s;">',
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="' + T.hint + '" stroke-width="2" stroke-linecap="round"/></svg>That\'s Wrong</button></div>',
      '<div id="kc-correct-area-' + currentId + '" style="display:none;">',
      '<label style="font-size:11px;font-weight:700;color:' + T.reviewTitle + ';display:block;margin-bottom:5px;">✏️ Rewrite KIDO\'s understanding:</label>',
      '<textarea id="kc-textarea-' + currentId + '" rows="3" placeholder="e.g. Weights are learnable parameters adjusted during training..." style="width:100%;font-size:12px;color:' + T.textareaText + ';background:' + T.textareaBg + ';border:2px solid ' + T.textareaBorder + ';border-radius:10px;padding:10px;resize:none;line-height:1.5;font-family:inherit;"></textarea>',
      '<button id="kc-save-' + currentId + '" style="margin-top:6px;width:100%;background:#925E78;color:white;font-size:12px;font-weight:700;border:none;border-radius:10px;padding:9px;cursor:pointer;box-shadow:0 3px 0 #5c3248;display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .15s,box-shadow .15s;">',
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Save &amp; Continue</button></div>'
    ].join('');

    // 10. Assemble
    widget.appendChild(topBar);
    widget.appendChild(graphView);
    widget.appendChild(reviewView);
    widget.appendChild(footer);
    bubble.appendChild(widget);
    msgWrapper.appendChild(bubble);
    if (dom.chatWelcome && dom.chatWelcome.style.display !== 'none') {
      dom.chatWelcome.style.display = 'none';
    }
    dom.chatMessages.appendChild(msgWrapper);
    this.scrollToBottom();

    // 11. Interactivity
    var kcActiveId = null;
    function kcNodeBg(st) {
      if (st === 'reviewed') return { bg: '#D6EDDA', border: '#5DA271' };
      if (st === 'corrected') return { bg: '#FFF3CD', border: '#F5A623' };
      return { bg: T.pendingBg, border: T.pendingBorder };
    }
    function kcNodeIcon(st) {
      if (st === 'reviewed') return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><path d="M1 6l3 3 7-6" stroke="#5DA271" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      if (st === 'corrected') return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><path d="M1 8.5l1.5-4 2.5 3.5 1.5-2.5 2.5 3" stroke="#F5A623" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="' + T.pendingBorder + '" stroke-width="1.4" stroke-opacity="0.55"/><circle cx="6" cy="6" r="1.5" fill="' + T.pendingText + '" fill-opacity="0.25"/></svg>';
    }
    function kcRenderCubes() {
      cubeWrap.innerHTML = '';
      kcNodes.forEach(function(node) {
        var c = kcNodeBg(node.status);
        var isPending = node.status === 'pending';
        var btn = document.createElement('button');
        btn.id = 'kc-cube-' + currentId + '-' + node.id;
        btn.dataset.kcid = node.id;
        btn.className = 'kc-cube' + (isPending ? ' kc-ping' : '');
        btn.style.cssText = 'position:relative;z-index:1;background:' + c.bg + ';border:2px solid ' + c.border + ';box-shadow:3px 3px 0 ' + T.pendingShadow + ';border-radius:10px;padding:10px;width:100px;height:100px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;flex-shrink:0;';
        var hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:3px;';
        hdr.innerHTML = kcNodeIcon(node.status);
        var ttl = document.createElement('span');
        ttl.style.cssText = 'font-size:11px;font-weight:700;color:' + T.pendingText + ';line-height:1.25;text-align:center;';
        ttl.textContent = node.title;
        btn.appendChild(hdr);
        btn.appendChild(ttl);
        btn.addEventListener('click', function() { kcOpenReview(parseInt(this.dataset.kcid, 10)); });
        cubeWrap.appendChild(btn);
      });
      requestAnimationFrame(kcDrawConnectors);
    }
    function kcDrawConnectors() {
      var svg = document.getElementById('kc-svg-' + currentId);
      if (!svg) return;
      svg.innerHTML = '';
      var canvasRect = canvas.getBoundingClientRect();
      kcConnections.forEach(function(pair) {
        var fromEl = document.getElementById('kc-cube-' + currentId + '-' + pair[0]);
        var toEl = document.getElementById('kc-cube-' + currentId + '-' + pair[1]);
        if (!fromEl || !toEl) return;
        var r1 = fromEl.getBoundingClientRect();
        var r2 = toEl.getBoundingClientRect();
        var x1 = r1.right - canvasRect.left;
        var y1 = r1.top + r1.height / 2 - canvasRect.top;
        var x2 = r2.left - canvasRect.left;
        var y2 = r2.top + r2.height / 2 - canvasRect.top;
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', T.connector); line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5 3'); line.setAttribute('stroke-opacity', '0.45');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
        var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x2); dot.setAttribute('cy', y2);
        dot.setAttribute('r', '3'); dot.setAttribute('fill', T.connector); dot.setAttribute('fill-opacity', '0.5');
        svg.appendChild(dot);
      });
    }
    function kcShowGraph() {
      reviewView.style.display = 'none';
      graphView.style.display = '';
      reviewView.className = 'kc-review-panel';
      kcActiveId = null;
      kcRenderCubes();
      requestAnimationFrame(function() { widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    }
    function kcOpenReview(id) {
      kcActiveId = id;
      var node = kcNodeById(id);
      if (!node) return;
      document.getElementById('kc-r-badge-' + currentId).textContent = '#' + node.id;
      document.getElementById('kc-r-title-' + currentId).textContent = node.title;
      document.getElementById('kc-r-thought-' + currentId).textContent = node.thought;
      var priorEl = document.getElementById('kc-prior-' + currentId);
      var priorTxt = document.getElementById('kc-prior-text-' + currentId);
      if (node.correction) { priorEl.style.display = ''; priorTxt.textContent = node.correction; }
      else { priorEl.style.display = 'none'; }
      document.getElementById('kc-correct-area-' + currentId).style.display = 'none';
      var ta = document.getElementById('kc-textarea-' + currentId);
      if (ta) ta.value = node.correction || '';
      graphView.style.display = 'none';
      reviewView.style.display = '';
      reviewView.className = '';
      void reviewView.offsetWidth;
      reviewView.className = 'kc-review-panel';
      requestAnimationFrame(function() { widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    }
    function kcAdvanceOrReturn() {
      var next = kcNodes.find(function(n) { return n.status === 'pending'; });
      if (next) {
        reviewView.style.transition = 'opacity 0.15s ease';
        reviewView.style.opacity = '0.4';
        setTimeout(function() { reviewView.style.opacity = '1'; kcOpenReview(next.id); }, 80);
      } else { kcShowGraph(); }
    }
    // Wire events
    document.getElementById('kc-continue-' + currentId).addEventListener('click', function(evt) {
      evt.preventDefault();
      evt.stopPropagation();
      if (typeof onContinueCallback === 'function') {
        onContinueCallback({
          hasNodes: hasNodes,
          currentPointTitle: kcNodes.length ? kcNodes[0].title : ''
        });
      }
    });
    document.getElementById('kc-back-' + currentId).addEventListener('click', kcShowGraph);
    document.getElementById('kc-good-' + currentId).addEventListener('click', function() {
      var node = kcNodeById(kcActiveId);
      if (!node) return;
      node.status = 'reviewed';
      kcAdvanceOrReturn();
    });
    document.getElementById('kc-wrong-' + currentId).addEventListener('click', function() {
      document.getElementById('kc-correct-area-' + currentId).style.display = '';
      var ta = document.getElementById('kc-textarea-' + currentId);
      if (ta) ta.focus();
      requestAnimationFrame(function() { widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    });
    document.getElementById('kc-save-' + currentId).addEventListener('click', function() {
      var ta = document.getElementById('kc-textarea-' + currentId);
      var txt = ta ? ta.value.trim() : '';
      if (!txt) { if (ta) { ta.style.borderColor = '#EF4444'; setTimeout(function() { ta.style.borderColor = ''; }, 1200); } return; }
      var node = kcNodeById(kcActiveId);
      if (!node) return;
      node.correction = txt;
      node.status = 'corrected';
      if (typeof onSubmitCallback === 'function') { onSubmitCallback(node.title, txt); }
      kcAdvanceOrReturn();
    });
    kcRenderCubes();
    return msgWrapper;
  }

  // ── C3: Widget Stub Modal ──────────────────────────────────

  /**
   * Render the interactive widget inline in the chat feed.
   * @param {Object} widgetState - The stored state.pendingWidget object
   * @param {Function} onSubmitCallback - Callback when user submits the widget
   */
  renderInlineWidget(widgetState, onSubmitCallback) {
    if (!widgetState || !widgetState.type || !widgetState.data) {
      console.warn('[UIRenderer] renderInlineWidget called with invalid widgetState', widgetState);
      return;
    }

    var dom = this.dom;
    if (!dom.chatMessages) return;

    var wType = widgetState.type.toLowerCase();
    var payload = widgetState.data.payload || widgetState.data;
    var meta = widgetState.data.meta || {};
    var instruction = meta.instruction || 'Complete the exercise below:';
    
    // Store active state
    this._currentWidgetState = {};
    
    // Build wrapper
    var msgWrapper = document.createElement('div');
    msgWrapper.className = 'message message--ai message--ai-widget';
    msgWrapper.style.marginBottom = '16px';
    var bubble = document.createElement('div');
    bubble.className = 'message__bubble message__bubble--app';
    bubble.style.cssText = 'padding:0; overflow:auto; border-radius:16px; width:100%; max-width:100%; background:transparent; border:none; box-shadow:none;';

    // Build container
    var container = document.createElement('div');
    container.className = 'widget-container';
    
    // Header — contextual title for process widgets
    var header = document.createElement('div');
    header.className = 'widget-header';
    var title = document.createElement('h3');
    title.className = 'widget-title';
    var isProcess = (wType === 'process_sort' || wType === 'process');
    var isComparison = (wType === 'comparison_sort' || wType === 'comparison');
    if (isProcess) {
      title.textContent = 'Arrange the steps in the correct order';
      instruction = 'Drag the cards and press Check Answer';
    } else if (isComparison) {
      title.textContent = 'Sort items into the correct categories';
      instruction = 'Drag each item into its category, then press Check Answer';
    } else {
      title.textContent = wType.replace('_', ' ').toUpperCase();
    }
    var instr = document.createElement('p');
    instr.className = 'widget-instruction';
    instr.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> ' + instruction;
    header.appendChild(title);
    header.appendChild(instr);
    container.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'widget-body';
    
    var self = this;
    
    if (wType === 'multiple_choice') {
      this._renderMultipleChoice(payload, body);
    } else if (wType === 'fill_blank') {
      this._renderFillBlank(payload, body);
    } else if (isProcess) {
      this._renderProcessSort(payload, body);
    } else if (isComparison) {
      this._renderComparisonSort(payload, body);
    } else {
      // Fallback
      body.innerHTML = '<pre style="font-size:11px; white-space:pre-wrap; background:var(--surface-2); padding:10px; border-radius:8px;">' + JSON.stringify(payload, null, 2) + '</pre>';
    }
    
    container.appendChild(body);

    // Footer with submit button
    var footer = document.createElement('div');
    footer.className = 'widget-footer';
    var submitBtn = document.createElement('button');
    submitBtn.className = 'widget-submit-btn';
    submitBtn.textContent = 'Check Answer';
    
    // Store callback reference for Next button
    self._widgetSubmitCallback = onSubmitCallback;

    // Process and Comparison widgets use LOCAL evaluation with 3 trials
    if (isProcess || isComparison) {
      self._widgetTrialCount = 0;
      self._widgetMaxTrials = 3;

      submitBtn.onclick = function() {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Checking...';
        self._widgetTrialCount++;
        if (isProcess) {
          self._localProcessEvaluate(container, msgWrapper);
        } else {
          self._localComparisonEvaluate(container, msgWrapper);
        }
      };
    } else {
      submitBtn.onclick = function() {
        if (onSubmitCallback) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Checking...';
          onSubmitCallback(self._currentWidgetState, msgWrapper);
        }
      };
    }
    
    footer.appendChild(submitBtn);
    container.appendChild(footer);

    // Tag the wrapper with widget type for feedback targeting
    msgWrapper.dataset.widgetType = wType;

    bubble.appendChild(container);
    msgWrapper.appendChild(bubble);
    dom.chatMessages.appendChild(msgWrapper);

    // Track last rendered widget wrapper
    self._lastWidgetWrapper = msgWrapper;

    // Scroll widget into view — use a small delay so DOM is ready
    setTimeout(function() {
      msgWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  _renderMultipleChoice(payload, container) {
    var self = this;
    var question = document.createElement('p');
    question.style.cssText = 'font-size: 1.05rem; font-weight: 700; margin-bottom: 16px; color: var(--text-primary);';
    question.textContent = payload.question || '';
    container.appendChild(question);
    
    var optionsWrap = document.createElement('div');
    optionsWrap.className = 'widget-mc-options';
    
    var options = payload.options || [];
    options.forEach(function(opt) {
      var optEl = document.createElement('div');
      optEl.className = 'widget-mc-option';
      optEl.textContent = opt.text;
      optEl.onclick = function() {
        // Deselect others
        var all = optionsWrap.querySelectorAll('.widget-mc-option');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('is-selected');
        // Select this
        optEl.classList.add('is-selected');
        self._currentWidgetState = { selected_id: opt.id };
      };
      optionsWrap.appendChild(optEl);
    });
    
    container.appendChild(optionsWrap);
  }

  _renderFillBlank(payload, container) {
    var self = this;
    var textWrap = document.createElement('div');
    textWrap.className = 'widget-fb-text';
    
    self._currentWidgetState = { answers: {} };
    
    var segments = payload.segments || [];
    segments.forEach(function(seg) {
      if (seg.type === 'text') {
        var span = document.createElement('span');
        span.textContent = seg.value;
        textWrap.appendChild(span);
      } else if (seg.type === 'blank') {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'widget-fb-input';
        if (seg.hint) input.placeholder = seg.hint;
        input.oninput = function() {
          self._currentWidgetState.answers[seg.id] = input.value.trim();
        };
        textWrap.appendChild(input);
      }
    });
    
    container.appendChild(textWrap);
  }

  /**
   * Strip LLM prefixes like "Step 1:", "Process 2-", etc.
   * UI-only safety fallback — primary control is the LLM prompt.
   */
  _cleanStepText(text) {
    if (!text) return '';
    return text.replace(/^\s*(step|process)?\s*\d+[:.\-\s]*/i, '').trim();
  }

  _renderProcessSort(payload, container) {
    var self = this;
    var steps = payload.steps || [];

    // Store the correct order (IDs) for feedback — never mutated
    var correctOrder = steps.map(function(s) { return s.id; });

    // Shuffle steps for display (Fisher-Yates)
    var shuffled = steps.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    // Initial order state (shuffled)
    self._currentWidgetState = { order: shuffled.map(function(s) { return s.id; }) };

    // Store correct order + steps text on container for feedback access
    container.dataset.correctOrder = JSON.stringify(correctOrder);
    container.dataset.stepsMap = JSON.stringify(
      steps.reduce(function(m, s) { m[s.id] = self._cleanStepText(s.text); return m; }, {})
    );

    // Sortable list (no START/END labels)
    var list = document.createElement('div');
    list.className = 'widget-sort-list';

    var draggedItem = null;

    shuffled.forEach(function(step, idx) {
      var item = document.createElement('div');
      item.className = 'widget-sort-item';
      item.draggable = true;
      item.dataset.id = step.id;

      // Position number badge + text + drag grip
      var numBadge = '<div class="widget-sort-num">' + (idx + 1) + '</div>';
      var gripIcon = '<div class="widget-sort-handle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></div>';
      item.innerHTML = numBadge + '<div style="flex:1">' + self._cleanStepText(step.text) + '</div>' + gripIcon;

      item.addEventListener('dragstart', function(e) {
        draggedItem = item;
        setTimeout(function() { item.classList.add('is-dragging'); }, 0);
      });

      item.addEventListener('dragend', function() {
        item.classList.remove('is-dragging');
        draggedItem = null;
        // Recalculate order from DOM
        var newOrder = [];
        var currentItems = list.querySelectorAll('.widget-sort-item');
        for (var i = 0; i < currentItems.length; i++) {
          newOrder.push(currentItems[i].dataset.id);
          // Update position number badges
          currentItems[i].querySelector('.widget-sort-num').textContent = (i + 1);
        }
        self._currentWidgetState.order = newOrder;
      });

      list.appendChild(item);
    });

    // Single dragover listener on the list (not per-item)
    list.addEventListener('dragover', function(e) {
      e.preventDefault();
      var afterElement = getDragAfterElement(list, e.clientY);
      if (draggedItem) {
        if (afterElement == null) {
          list.appendChild(draggedItem);
        } else {
          list.insertBefore(draggedItem, afterElement);
        }
      }
    });

    function getDragAfterElement(container, y) {
      var draggableElements = [].slice.call(container.querySelectorAll('.widget-sort-item:not(.is-dragging)'));
      return draggableElements.reduce(function(closest, child) {
        var box = child.getBoundingClientRect();
        var offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    container.appendChild(list);
  }

  /**
   * Local evaluation for process sort widget.
   * Compares user order with correct order client-side.
   * Manages 3-trial retry flow with Next button gating.
   */
  _localProcessEvaluate(widgetContainer, msgWrapper) {
    var self = this;
    var body = widgetContainer.querySelector('.widget-body');
    if (!body) return;

    var correctOrder = JSON.parse(body.dataset.correctOrder || '[]');
    var stepsMap = JSON.parse(body.dataset.stepsMap || '{}');
    var items = widgetContainer.querySelectorAll('.widget-sort-item');
    var userOrder = self._currentWidgetState.order || [];

    // Compare user order with correct order
    var isCorrect = true;
    for (var i = 0; i < correctOrder.length; i++) {
      if (userOrder[i] !== correctOrder[i]) {
        isCorrect = false;
        break;
      }
    }

    // Apply partial correctness coloring
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('is-correct', 'is-wrong');
      if (isCorrect || items[i].dataset.id === correctOrder[i]) {
        items[i].classList.add('is-correct');
      } else {
        items[i].classList.add('is-wrong');
      }
      items[i].draggable = false;
    }

    // Remove existing footer
    var footer = widgetContainer.querySelector('.widget-footer');
    if (footer) footer.remove();
    // Remove any previous actions/sequences
    var oldActions = widgetContainer.querySelector('.widget-feedback-actions');
    if (oldActions) oldActions.remove();
    var oldSeq = widgetContainer.querySelector('.widget-correct-sequence');
    if (oldSeq) oldSeq.remove();

    if (isCorrect) {
      // Correct! Show Next button immediately
      self._showNextButton(widgetContainer, msgWrapper, correctOrder, stepsMap, true);
      return;
    }

    // Wrong — check if trials exhausted
    var trialsLeft = self._widgetMaxTrials - self._widgetTrialCount;

    // Build action buttons
    var actions = document.createElement('div');
    actions.className = 'widget-feedback-actions';

    // Try Again (if trials remain)
    if (trialsLeft > 0) {
      var retryBtn = document.createElement('button');
      retryBtn.className = 'widget-retry-btn';
      retryBtn.textContent = 'Try Again (' + trialsLeft + ' left)';
      retryBtn.onclick = function() {
        // Clear feedback
        for (var i = 0; i < items.length; i++) {
          items[i].classList.remove('is-correct', 'is-wrong');
          items[i].draggable = true;
        }
        actions.remove();
        var seq = widgetContainer.querySelector('.widget-correct-sequence');
        if (seq) seq.remove();
        // Re-add submit footer
        var newFooter = document.createElement('div');
        newFooter.className = 'widget-footer';
        var submitBtn = document.createElement('button');
        submitBtn.className = 'widget-submit-btn';
        submitBtn.textContent = 'Check Answer';
        submitBtn.onclick = function() {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Checking...';
          self._widgetTrialCount++;
          self._localProcessEvaluate(widgetContainer, msgWrapper);
        };
        newFooter.appendChild(submitBtn);
        widgetContainer.appendChild(newFooter);
        // Scroll
        self._scrollChatToBottom();
      };
      actions.appendChild(retryBtn);
    }

    // Show Correct Order
    var showBtn = document.createElement('button');
    showBtn.className = 'widget-show-correct-btn';
    showBtn.textContent = 'Show Correct Order';
    showBtn.onclick = function() {
      if (widgetContainer.querySelector('.widget-correct-sequence')) return;
      var seq = document.createElement('div');
      seq.className = 'widget-correct-sequence';
      var seqTitle = document.createElement('div');
      seqTitle.className = 'widget-correct-sequence-title';
      seqTitle.textContent = 'Correct Order';
      seq.appendChild(seqTitle);

      correctOrder.forEach(function(id, idx) {
        var stepDiv = document.createElement('div');
        stepDiv.className = 'widget-correct-step';
        stepDiv.innerHTML = '<div class="widget-correct-step-num">' + (idx + 1) + '</div><span>' + (stepsMap[id] || id) + '</span>';
        seq.appendChild(stepDiv);
      });

      widgetContainer.appendChild(seq);

      // After showing correct, remove Try Again, show Next
      actions.remove();
      self._showNextButton(widgetContainer, msgWrapper, correctOrder, stepsMap, false);
      self._scrollChatToBottom();
    };
    actions.appendChild(showBtn);

    // If no trials left, skip Try Again and go straight to Next after showing actions
    if (trialsLeft <= 0) {
      widgetContainer.appendChild(actions);
      // Also show Next button since they can't retry
      self._showNextButton(widgetContainer, msgWrapper, correctOrder, stepsMap, false);
    } else {
      widgetContainer.appendChild(actions);
    }

    self._scrollChatToBottom();
  }

  /**
   * Show the "Next" button that gates the backend submission.
   * Only when Next is clicked does the kido followup message appear.
   */
  _showNextButton(widgetContainer, msgWrapper, correctOrder, stepsMap, wasCorrect) {
    var self = this;
    // Don't add if already present
    if (widgetContainer.querySelector('.widget-next-btn')) return;

    var nextFooter = document.createElement('div');
    nextFooter.className = 'widget-footer';
    var nextBtn = document.createElement('button');
    nextBtn.className = 'widget-submit-btn widget-next-btn';
    nextBtn.textContent = 'Next →';
    nextBtn.style.background = '#3b82f6';
    nextBtn.style.boxShadow = '0 3px 0 #2563eb';

    nextBtn.onclick = function() {
      nextBtn.disabled = true;
      nextBtn.textContent = 'Loading...';
      // NOW send to backend for kido followup
      if (self._widgetSubmitCallback) {
        self._widgetSubmitCallback(self._currentWidgetState, msgWrapper);
      }
    };

    nextFooter.appendChild(nextBtn);
    widgetContainer.appendChild(nextFooter);
  }

  /** Scroll chat to bottom without jump */
  _scrollChatToBottom() {
    var dom = this.dom;
    if (dom.chatMessages) {
      var lastMsg = dom.chatMessages.lastElementChild;
      if (lastMsg) {
        setTimeout(function() {
          lastMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    }
  }

  _renderComparisonSort(payload, container) {
    var self = this;
    self._currentWidgetState = { placements: {} };

    var categories = payload.categories || [];
    var items = payload.items || [];

    // Store correct category mapping for local evaluation
    var correctMap = {};
    items.forEach(function(item) {
      correctMap[item.id] = item.category;
    });
    container.dataset.correctCategoryMap = JSON.stringify(correctMap);
    container.dataset.categories = JSON.stringify(categories);

    // Build drop zones
    var dropZonesWrap = document.createElement('div');
    dropZonesWrap.className = 'widget-drop-zones';

    categories.forEach(function(cat) {
      var zone = document.createElement('div');
      zone.className = 'widget-drop-zone';
      zone.dataset.category = cat;

      var title = document.createElement('div');
      title.className = 'widget-drop-zone-title';
      title.textContent = cat;
      zone.appendChild(title);

      zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.classList.add('drag-over');
      });

      zone.addEventListener('dragleave', function() {
        zone.classList.remove('drag-over');
      });

      zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        var itemId = e.dataTransfer.getData('text/plain');
        var itemEl = container.querySelector('.widget-sort-item[data-id="' + itemId + '"]');
        if (itemEl) {
          zone.appendChild(itemEl);
          self._currentWidgetState.placements[itemId] = cat;
        }
      });

      dropZonesWrap.appendChild(zone);
    });

    container.appendChild(dropZonesWrap);

    // Item bank
    var bank = document.createElement('div');
    bank.className = 'widget-bank';
    var bankTitle = document.createElement('div');
    bankTitle.className = 'widget-drop-zone-title';
    bankTitle.textContent = 'Item Bank';
    bank.appendChild(bankTitle);

    bank.addEventListener('dragover', function(e) {
      e.preventDefault();
      bank.classList.add('drag-over');
    });

    bank.addEventListener('dragleave', function() {
      bank.classList.remove('drag-over');
    });

    bank.addEventListener('drop', function(e) {
      e.preventDefault();
      bank.classList.remove('drag-over');
      var itemId = e.dataTransfer.getData('text/plain');
      var itemEl = container.querySelector('.widget-sort-item[data-id="' + itemId + '"]');
      if (itemEl) {
        bank.appendChild(itemEl);
        delete self._currentWidgetState.placements[itemId];
      }
    });

    items.forEach(function(item) {
      var itemEl = document.createElement('div');
      itemEl.className = 'widget-sort-item';
      itemEl.draggable = true;
      itemEl.dataset.id = item.id;
      itemEl.textContent = item.text;

      itemEl.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', item.id);
        setTimeout(function() { itemEl.classList.add('is-dragging'); }, 0);
      });

      itemEl.addEventListener('dragend', function() {
        itemEl.classList.remove('is-dragging');
      });

      bank.appendChild(itemEl);
    });

    container.appendChild(bank);
  }

  /**
   * Local evaluation for comparison sort widget.
   * Compares user placements with correct category mapping.
   * Same 3-trial + Next button flow as process widget.
   */
  _localComparisonEvaluate(widgetContainer, msgWrapper) {
    var self = this;
    var body = widgetContainer.querySelector('.widget-body');
    if (!body) return;

    var correctMap = JSON.parse(body.dataset.correctCategoryMap || '{}');
    var placements = self._currentWidgetState.placements || {};
    var allItemIds = Object.keys(correctMap);

    // Check if all items have been placed
    var allPlaced = allItemIds.every(function(id) { return placements[id] !== undefined; });
    if (!allPlaced) {
      // Not all placed — show message and re-enable submit
      var footer = widgetContainer.querySelector('.widget-footer');
      if (footer) {
        var btn = footer.querySelector('.widget-submit-btn');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Check Answer';
        }
      }
      self._widgetTrialCount--; // Don't count this as a trial
      alert('Please sort all items into categories first!');
      return;
    }

    // Compare placements with correct map
    var isCorrect = true;
    var items = widgetContainer.querySelectorAll('.widget-sort-item');
    for (var i = 0; i < items.length; i++) {
      var itemId = items[i].dataset.id;
      var userCat = placements[itemId];
      var correctCat = correctMap[itemId];
      items[i].classList.remove('is-correct', 'is-wrong');
      if (userCat === correctCat) {
        items[i].classList.add('is-correct');
      } else {
        items[i].classList.add('is-wrong');
        isCorrect = false;
      }
      items[i].draggable = false;
    }

    // Remove existing footer
    var footer = widgetContainer.querySelector('.widget-footer');
    if (footer) footer.remove();
    var oldActions = widgetContainer.querySelector('.widget-feedback-actions');
    if (oldActions) oldActions.remove();
    var oldSeq = widgetContainer.querySelector('.widget-correct-sequence');
    if (oldSeq) oldSeq.remove();

    if (isCorrect) {
      self._showNextButton(widgetContainer, msgWrapper, null, null, true);
      return;
    }

    // Wrong — check trials
    var trialsLeft = self._widgetMaxTrials - self._widgetTrialCount;
    var actions = document.createElement('div');
    actions.className = 'widget-feedback-actions';

    if (trialsLeft > 0) {
      var retryBtn = document.createElement('button');
      retryBtn.className = 'widget-retry-btn';
      retryBtn.textContent = 'Try Again (' + trialsLeft + ' left)';
      retryBtn.onclick = function() {
        for (var i = 0; i < items.length; i++) {
          items[i].classList.remove('is-correct', 'is-wrong');
          items[i].draggable = true;
        }
        actions.remove();
        var seq = widgetContainer.querySelector('.widget-correct-sequence');
        if (seq) seq.remove();
        // Re-add submit footer
        var newFooter = document.createElement('div');
        newFooter.className = 'widget-footer';
        var submitBtn = document.createElement('button');
        submitBtn.className = 'widget-submit-btn';
        submitBtn.textContent = 'Check Answer';
        submitBtn.onclick = function() {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Checking...';
          self._widgetTrialCount++;
          self._localComparisonEvaluate(widgetContainer, msgWrapper);
        };
        newFooter.appendChild(submitBtn);
        widgetContainer.appendChild(newFooter);
        self._scrollChatToBottom();
      };
      actions.appendChild(retryBtn);
    }

    var showBtn = document.createElement('button');
    showBtn.className = 'widget-show-correct-btn';
    showBtn.textContent = 'Show Correct Answer';
    showBtn.onclick = function() {
      if (widgetContainer.querySelector('.widget-correct-sequence')) return;
      var seq = document.createElement('div');
      seq.className = 'widget-correct-sequence';
      var seqTitle = document.createElement('div');
      seqTitle.className = 'widget-correct-sequence-title';
      seqTitle.textContent = 'Correct Sorting';
      seq.appendChild(seqTitle);

      var categories = JSON.parse(body.dataset.categories || '[]');
      categories.forEach(function(cat) {
        var catLabel = document.createElement('div');
        catLabel.style.cssText = 'font-weight:700; font-size:0.8rem; margin:8px 0 4px; color:var(--text-secondary);';
        catLabel.textContent = cat + ':';
        seq.appendChild(catLabel);

        allItemIds.forEach(function(id) {
          if (correctMap[id] === cat) {
            var stepDiv = document.createElement('div');
            stepDiv.className = 'widget-correct-step';
            var itemEl = widgetContainer.querySelector('.widget-sort-item[data-id="' + id + '"]');
            stepDiv.innerHTML = '<span>' + (itemEl ? itemEl.textContent : id) + '</span>';
            seq.appendChild(stepDiv);
          }
        });
      });

      widgetContainer.appendChild(seq);
      actions.remove();
      self._showNextButton(widgetContainer, msgWrapper, null, null, false);
      self._scrollChatToBottom();
    };
    actions.appendChild(showBtn);

    if (trialsLeft <= 0) {
      widgetContainer.appendChild(actions);
      self._showNextButton(widgetContainer, msgWrapper, null, null, false);
    } else {
      widgetContainer.appendChild(actions);
    }

    self._scrollChatToBottom();
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

