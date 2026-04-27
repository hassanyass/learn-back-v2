/**
 * feedback.js - LearnBack Session Summary
 * Loads backend feedback when available and falls back to persisted session data.
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function initTheme() {
    var saved = localStorage.getItem('lb-theme') || 'light';
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    updateThemeUI(saved === 'dark' ? 'dark' : 'light');

    var btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;

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
      return;
    }

    if (sun) sun.style.display = 'none';
    if (moon) moon.style.display = 'inline-block';
    if (label) label.textContent = 'Dark';
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function showLoading() {
    var grid = el('fb-grid');
    if (!grid) return;

    grid.innerHTML = [
      '<div style="text-align:center; padding:60px; grid-column:1 / -1; color: var(--plum);">',
      '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:48px;height:48px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2A10 10 0 0 1 22 12"></path></svg>',
      '<p style="margin-top:20px; font-weight:500;">Preparing your session summary...</p>',
      '</div>'
    ].join('');

    if (!document.getElementById('fb-spin-style')) {
      var style = document.createElement('style');
      style.id = 'fb-spin-style';
      style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
  }

  function showError(message) {
    var grid = el('fb-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="text-align:center; padding:40px; color: var(--plum); grid-column:1 / -1;">' + message + '</div>';
  }

  function gainDesc(score, completionType) {
    if (completionType === 'manual') {
      if (score >= 50) return 'Good effort! Kido made solid progress before the session ended.';
      if (score >= 25) return 'A useful start. Kido picked up some ideas before the session ended early.';
      return 'The session ended early. Try a full session next time so Kido can learn more.';
    }
    if (score >= 80) return 'Outstanding session. Kido mastered most of the ideas you covered today.';
    if (score >= 50) return 'Solid session. Kido made strong progress, with a few areas still worth revisiting.';
    if (score >= 25) return 'A useful start. Kido picked up some of the ideas, but the explanation still needs reinforcement.';
    return 'This session needs another pass so Kido can build a stronger foundation.';
  }

  function cardClass(topic) {
    if (topic.status === 'skipped') return 'skipped';
    if (topic.understanding === 'strong') return 'complete';
    if (topic.understanding === 'good') return 'good';
    return 'weak';
  }

  function levelLabel(level) {
    return { strong: 'Strong', good: 'Good', weak: 'Weak' }[level] || '';
  }

  function resolveSessionId() {
    var params = new URLSearchParams(window.location.search);
    var requestedId = params.get('sessionId') || params.get('id');
    if (requestedId) return requestedId;

    if (window.SessionStore && typeof window.SessionStore.getSession === 'function') {
      var current = window.SessionStore.getSession();
      return current && current.sessionId ? current.sessionId : null;
    }

    return null;
  }

  async function finalizeIfNeeded(sessionRecord) {
    if (!sessionRecord || sessionRecord.status === 'COMPLETED') return sessionRecord;

    try {
      if (window.LearnBackAPI && typeof window.LearnBackAPI.finalizeSession === 'function') {
        await window.LearnBackAPI.finalizeSession(sessionRecord.sessionId);
      }
    } catch (error) {
      console.warn('Unable to finalize session with backend. Continuing with persisted session data.', error);
    }

    if (window.SessionStore && typeof window.SessionStore.finalizeSession === 'function') {
      return window.SessionStore.finalizeSession(sessionRecord.sessionId, {
        progress: sessionRecord.progress,
        topicIndex: sessionRecord.topicIndex,
        clearCurrent: false
      });
    }

    return sessionRecord;
  }

  async function loadFeedbackSummary(sessionId, sessionRecord) {
    var record = sessionRecord;
    console.log('[Feedback] Loading feedback for session ' + sessionId);

    if (window.LearnBackAPI && typeof window.LearnBackAPI.fetchSessionFeedback === 'function') {
      try {
        var data = await window.LearnBackAPI.fetchSessionFeedback(sessionId, record && record.sessionTitle);
        console.log('[Feedback] Loaded feedback for session ' + sessionId);
        return data;
      } catch (error) {
        console.warn('[Feedback] Feedback endpoint unavailable, using defaults.', error);
      }
    }

    // Defensive fallback — never return null
    return {
      sessionId: sessionId,
      sessionTitle: 'Session Summary',
      completionType: 'natural',
      overallMastery: 0,
      durationMinutes: null,
      topics: [],
      strengths: [],
      weakAreas: []
    };
  }

  function renderMastery(summary) {
    var overallMastery = Math.max(0, Math.min(100, Number(summary.overallMastery) || 0));
    var masteryScore = el('mastery-score');
    var masteryDesc = el('mastery-desc');
    var masteryFill = el('mastery-fill');
    var sessionLabel = document.querySelector('.nav-bar__session');

    if (masteryScore) masteryScore.textContent = overallMastery + '%';
    if (masteryDesc) masteryDesc.textContent = gainDesc(overallMastery, summary.completionType);
    if (sessionLabel) sessionLabel.textContent = summary.sessionTitle || 'Session Summary';

    // Duration display
    var durationEl = el('session-duration');
    if (durationEl) {
      durationEl.textContent = summary.durationMinutes != null ? summary.durationMinutes + ' min' : '\u2014';
    }

    setTimeout(function () {
      if (masteryFill) masteryFill.style.width = overallMastery + '%';
    }, 250);
  }

  function renderMisconceptions(summary) {
    var toggle = el('fb-map-toggle');
    var drawer = el('fb-map-drawer');
    var list = el('fb-misconceptions-list');

    if (!toggle || !drawer || !list) return;

    var misconceptions = [];
    (summary.topics || []).forEach(function (topic) {
      if (!Array.isArray(topic.misconceptions)) return;
      topic.misconceptions.forEach(function (misconception) {
        misconceptions.push({
          topic: topic.title,
          text: misconception
        });
      });
    });

    toggle.addEventListener('click', function () {
      var isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));

      if (isOpen) {
        drawer.setAttribute('hidden', '');
        return;
      }

      drawer.removeAttribute('hidden');
      list.innerHTML = '';

      if (!misconceptions.length) {
        var empty = document.createElement('div');
        empty.className = 'fb-misc-empty';
        empty.textContent = 'No major misconceptions were captured for this session.';
        list.appendChild(empty);
        return;
      }

      var ul = document.createElement('ul');
      misconceptions.forEach(function (item) {
        var li = document.createElement('li');
        li.innerHTML = '<b>' + escapeHtml(item.topic) + '</b>' + escapeHtml(item.text);
        ul.appendChild(li);
      });
      list.appendChild(ul);
    });
  }

  function buildCard(topic) {
    // Defensive: null-guard every field
    var title = topic.title || topic.topic || 'Untitled Topic';
    var feedback = topic.feedback || 'No detailed feedback available.';
    var understanding = topic.understanding || 'unknown';
    var misconceptions = Array.isArray(topic.misconceptions) ? topic.misconceptions : [];
    var recommendation = topic.recommendation || '';
    var points = Array.isArray(topic.points) ? topic.points : [];
    var bktScore = typeof topic.bkt_score === 'number' ? topic.bkt_score : 0;
    var topicStatus = topic.status || 'pending';
    var topicId = topic.id || 'topic-unknown';

    var card = document.createElement('article');
    card.className = 'fb-topic-card fb-topic-card--' + cardClass(topic);
    card.id = topicId;
    card.setAttribute('aria-expanded', 'false');

    var head = document.createElement('div');
    head.className = 'fb-card-head';
    head.innerHTML = [
      '<h2 class="fb-card-title">' + escapeHtml(title) + '</h2>',
      '<svg class="fb-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<polyline points="6 9 12 15 18 9"/>',
      '</svg>'
    ].join('');

    head.addEventListener('click', function () {
      var expanded = card.getAttribute('aria-expanded') === 'true';
      card.setAttribute('aria-expanded', String(!expanded));
    });

    card.appendChild(head);

    if (understanding && understanding !== 'unknown') {
      var levelRow = document.createElement('div');
      levelRow.className = 'fb-level-row';
      levelRow.innerHTML = [
        '<span class="fb-level-label">Understanding</span>',
        '<div class="fb-level-track">',
        '<div class="fb-level-fill fb-level-fill--' + understanding + '"></div>',
        '</div>',
        '<span class="fb-level-text fb-level-text--' + understanding + '">' + levelLabel(understanding) + '</span>'
      ].join('');
      card.appendChild(levelRow);
    }

    var collapsible = document.createElement('div');
    collapsible.className = 'fb-card-collapsible';

    var divider = document.createElement('div');
    divider.className = 'fb-card-divider';
    collapsible.appendChild(divider);

    if (topicStatus === 'skipped') {
      var skipped = document.createElement('p');
      skipped.className = 'fb-card-skipped-note';
      skipped.textContent = feedback;
      collapsible.appendChild(skipped);
    } else {
      var body = document.createElement('div');
      body.className = 'fb-card-body';

      var fbParagraph = document.createElement('p');
      fbParagraph.textContent = feedback;
      body.appendChild(fbParagraph);

      if (misconceptions.length) {
        var focus = document.createElement('div');
        focus.className = 'fb-focus';
        focus.innerHTML = [
          '<div class="fb-focus__title">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
          '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
          '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
          '</svg>',
          'Focus Areas',
          '</div>',
          '<ul>' + misconceptions.map(function (item) { return '<li>' + escapeHtml(String(item)) + '</li>'; }).join('') + '</ul>'
        ].join('');
        body.appendChild(focus);
      }

      if (recommendation) {
        var rec = document.createElement('div');
        rec.className = 'fb-rec';
        rec.innerHTML = [
          '<div class="fb-rec__title">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;">',
          '<circle cx="12" cy="12" r="10"/>',
          '<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
          '</svg>',
          'For Next Time',
          '</div>',
          '<p>' + escapeHtml(recommendation) + '</p>'
        ].join('');
        body.appendChild(rec);
      }

      // Per-point breakdown
      if (points.length) {
        var pointsSection = document.createElement('div');
        pointsSection.className = 'fb-points-section';
        pointsSection.innerHTML = '<h3 class="fb-points-title">Point Breakdown</h3>';

        var ptList = document.createElement('div');
        ptList.className = 'fb-points-list';

        points.forEach(function (point) {
          var ptTitle = point.title || 'Unknown Point';
          var ptStatus = point.status || 'pending';
          var ptBkt = typeof point.bkt_score === 'number' ? Math.round(point.bkt_score * 100) : 0;
          var ptAttempts = typeof point.attempts === 'number' ? point.attempts : 0;
          var ptMemory = point.kido_memory || null;
          var ptMisc = Array.isArray(point.misconceptions) ? point.misconceptions : [];
          var ptVisited = point.was_visited !== false;

          var statusIcon = ptStatus === 'completed' ? '\u2705' : (ptVisited ? '\u23F3' : '\u26AA');
          var row = document.createElement('div');
          row.className = 'fb-point-row';
          row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border, #E2E8F0);';

          var details = '<strong>' + statusIcon + ' ' + escapeHtml(ptTitle) + '</strong>';
          details += '<br><span style="font-size:12px;color:var(--text-muted, #64748B);">Score: ' + ptBkt + '%';
          if (ptAttempts > 0) details += ' &middot; Attempts: ' + ptAttempts;
          if (point.widget_used) details += ' &middot; Widget used';
          details += '</span>';

          if (ptMemory) {
            details += '<br><span style="font-size:12px;font-style:italic;color:var(--text-muted, #64748B);">Kido learned: &ldquo;' + escapeHtml(ptMemory) + '&rdquo;</span>';
          }

          if (ptMisc.length) {
            details += '<br><span style="font-size:12px;color:#DC2626;">\u26A0 ' + ptMisc.map(function (m) { return escapeHtml(String(m)); }).join('; ') + '</span>';
          }

          row.innerHTML = details;
          ptList.appendChild(row);
        });

        pointsSection.appendChild(ptList);
        body.appendChild(pointsSection);
      }

      collapsible.appendChild(body);
    }

    card.appendChild(collapsible);
    return card;
  }

  function renderTopicCards(summary) {
    var grid = el('fb-grid');
    if (!grid) return;

    grid.innerHTML = '';
    var topics = Array.isArray(summary.topics) ? summary.topics : [];
    console.log('[Feedback] Rendering ' + topics.length + ' topic cards.');

    if (!topics.length) {
      showError('No topic-level feedback is available yet for this session.');
      return;
    }

    topics.forEach(function (topic) {
      grid.appendChild(buildCard(topic));
    });
  }

  function wireFooterActions(sessionId) {
    var current = window.SessionStore && window.SessionStore.getSession ? window.SessionStore.getSession() : null;
    if (current && current.sessionId === sessionId && window.SessionStore) {
      window.SessionStore.clearSession();
    }

    var dashboardButton = el('btn-dashboard');
    if (dashboardButton) {
      dashboardButton.addEventListener('click', function () {
        window.location.href = 'dashboard.html';
      });
    }

    var retryButton = el('btn-retry');
    if (retryButton) {
      retryButton.addEventListener('click', function () {
        window.location.href = 'upload_slides.html';
      });
    }

    var backTop = el('fb-back-top');
    if (backTop) {
      window.addEventListener('scroll', function () {
        if (window.scrollY > 280) {
          backTop.classList.add('visible');
          backTop.removeAttribute('hidden');
        } else {
          backTop.classList.remove('visible');
        }
      }, { passive: true });

      backTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  async function initFeedback() {
    initTheme();
    showLoading();

    var sessionId = resolveSessionId();
    if (!sessionId) {
      showError('No session summary is available yet.');
      return;
    }

    var sessionRecord = window.SessionStore && window.SessionStore.getSessionById
      ? window.SessionStore.getSessionById(sessionId)
      : null;

    sessionRecord = await finalizeIfNeeded(sessionRecord);

    var summary = await loadFeedbackSummary(sessionId, sessionRecord);

    renderMastery(summary);
    renderMisconceptions(summary);
    renderTopicCards(summary);
    wireFooterActions(sessionId);
  }

  initFeedback();
});
