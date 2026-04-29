/* LearnBack — Start Session Choice Page
   Handles upload redirect and demo content flow.
   ============================================================ */

(function () {
  'use strict';

  // ── Auth Guard ──────────────────────────────────────────────
  if (window.LearnBackAPI && typeof window.LearnBackAPI.isLoggedIn === 'function' && !window.LearnBackAPI.isLoggedIn()) {
    window.location.href = 'auth';
    return;
  }
  if (!window.LearnBackAPI) {
    try {
      if (!window.localStorage.getItem('learnback_token')) {
        window.location.href = 'auth';
        return;
      }
    } catch (_) { /* proceed */ }
  }

  // ── DOM Refs ─────────────────────────────────────────────────
  var dom = {
    choiceCards: document.getElementById('choice-cards'),
    btnUpload: document.getElementById('btn-upload'),
    btnDemo: document.getElementById('btn-demo'),
    demoLoading: document.getElementById('demo-loading'),
    demoError: document.getElementById('demo-error'),
    demoErrorText: document.getElementById('demo-error-text'),
    btnDemoRetry: document.getElementById('btn-demo-retry'),
    demoPreview: document.getElementById('demo-preview'),
    demoTitle: document.getElementById('demo-title'),
    demoMeta: document.getElementById('demo-meta'),
    demoTopics: document.getElementById('demo-topics'),
    btnStartDemo: document.getElementById('btn-start-demo'),
    btnDemoBack: document.getElementById('btn-demo-back')
  };

  var demoData = null; // cached demo content response
  var isStarting = false; // double-click guard

  // ── Theme Toggle (reused across all pages) ──────────────────
  (function initThemeToggle() {
    var toggle = document.getElementById('btn-theme-toggle');
    if (!toggle) return;

    var body = document.body;
    var saved = localStorage.getItem('learnback_theme');
    if (saved === 'dark') {
      body.setAttribute('data-theme', 'dark');
    }

    toggle.addEventListener('click', function () {
      var isDark = body.getAttribute('data-theme') === 'dark';
      body.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('learnback_theme', isDark ? 'light' : 'dark');
    });
  })();

  // ── UI State Helpers ─────────────────────────────────────────
  function showState(state) {
    // state: 'choices' | 'loading' | 'error' | 'preview'
    dom.choiceCards.style.display = state === 'choices' ? '' : 'none';
    dom.demoLoading.classList.toggle('is-visible', state === 'loading');
    dom.demoError.classList.toggle('is-visible', state === 'error');
    dom.demoPreview.classList.toggle('is-visible', state === 'preview');
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Upload Flow ──────────────────────────────────────────────
  dom.btnUpload.addEventListener('click', function () {
    window.location.href = 'upload_slides';
  });

  // ── Demo Flow: Fetch Content ─────────────────────────────────
  function fetchDemoContent() {
    showState('loading');

    if (!window.LearnBackAPI || typeof window.LearnBackAPI.fetchDemoContent !== 'function') {
      showState('error');
      dom.demoErrorText.textContent = 'API client not available.';
      return;
    }

    window.LearnBackAPI.fetchDemoContent()
      .then(function (list) {
        if (!Array.isArray(list) || list.length === 0) {
          showState('error');
          dom.demoErrorText.textContent = 'No demo content available.';
          return;
        }

        // Use the first demo content item
        demoData = list[0];
        renderPreview(demoData);
        showState('preview');
        if (window.LearnBackWalkthrough) {
          window.LearnBackWalkthrough.notify('demo_preview_ready');
        }
      })
      .catch(function (err) {
        console.error('[StartSession] Demo fetch failed:', err);
        showState('error');
        dom.demoErrorText.textContent = 'Failed to load demo content. Please try again.';
      });
  }

  // ── Demo Flow: Render Preview ────────────────────────────────
  // Uses the exact same .syllabus-card markup from the upload flow (app.js)
  var bookIcon = '<svg class="syllabus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';

  function renderPreview(demo) {
    dom.demoTitle.textContent = demo.title || 'Demo Session';
    dom.demoMeta.textContent = demo.topic_count + ' topics \u00B7 ' + demo.total_points + ' learning points';

    // Clear existing topics
    dom.demoTopics.innerHTML = '';

    var topics = demo.topics || [];
    topics.forEach(function (topic, idx) {
      var card = document.createElement('div');
      card.className = 'syllabus-card';
      card.style.opacity = '0';
      card.style.transform = 'translateY(10px)';
      card.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

      var displayTitle = escapeHtml(topic.topic_title || 'Untitled');
      var displayDesc = 'No description generated.';
      if (topic.concepts && Array.isArray(topic.concepts) && topic.concepts.length > 0) {
        displayDesc = topic.concepts.map(escapeHtml).join(', ');
      } else if (topic.point_count) {
        displayDesc = topic.point_count + ' learning point' + (topic.point_count !== 1 ? 's' : '');
      }

      card.innerHTML = bookIcon +
        '<div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">' +
          '<span class="syllabus-title">' + displayTitle + '</span>' +
          '<span class="syllabus-desc">' + displayDesc + '</span>' +
        '</div>';

      dom.demoTopics.appendChild(card);

      // Staggered fade in (matching upload flow)
      setTimeout(function () {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 50 + (idx * 80));
    });

    // Enable start button
    dom.btnStartDemo.disabled = false;
  }

  // ── Demo Flow: Start Session ─────────────────────────────────
  function startDemoSession() {
    if (isStarting || !demoData) return;
    isStarting = true;
    dom.btnStartDemo.disabled = true;
    dom.btnStartDemo.querySelector('span').textContent = 'Starting...';

    window.LearnBackAPI.startDemoSession(demoData.id)
      .then(function (response) {
        var sessionId = response && response.sessionId;
        if (!sessionId) {
          throw new Error('No session ID returned');
        }
        window.location.href = 'session?sessionId=' + encodeURIComponent(sessionId);
      })
      .catch(function (err) {
        console.error('[StartSession] Demo session creation failed:', err);
        isStarting = false;
        dom.btnStartDemo.disabled = false;
        dom.btnStartDemo.querySelector('span').textContent = 'Start Demo Session';

        // Show inline error
        var detail = (err && err.message) || 'Failed to create session.';
        var code = err && err.payload && err.payload.detail && err.payload.detail.code;
        if (code === 'DAILY_SESSION_LIMIT_REACHED') {
          alert('You reached today\'s session limit. Please come back tomorrow to continue testing LearnBack.');
        } else if (detail.indexOf('active session') !== -1 || code === 'ACTIVE_SESSION_LIMIT_REACHED') {
          alert('You already have an active session. Please end it first from the session page.');
        } else {
          alert('Error: ' + detail);
        }
      });
  }

  // ── Wire Events ──────────────────────────────────────────────
  dom.btnDemo.addEventListener('click', function () {
    fetchDemoContent();
  });

  dom.btnDemoRetry.addEventListener('click', function () {
    fetchDemoContent();
  });

  dom.btnDemoBack.addEventListener('click', function () {
    showState('choices');
  });

  dom.btnStartDemo.addEventListener('click', function () {
    startDemoSession();
  });

  // Initial state
  showState('choices');
  if (window.LearnBackWalkthrough) {
    window.LearnBackWalkthrough.bind('start_session.html');
  }

})();
