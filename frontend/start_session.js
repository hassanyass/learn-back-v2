/* LearnBack — Start Session Choice Page
   Handles upload redirect and demo content flow.
   ============================================================ */

(function () {
  'use strict';

  // ── Auth Guard ──────────────────────────────────────────────
  if (window.LearnBackAPI && typeof window.LearnBackAPI.isLoggedIn === 'function' && !window.LearnBackAPI.isLoggedIn()) {
    window.location.href = 'auth.html';
    return;
  }
  if (!window.LearnBackAPI) {
    try {
      if (!window.localStorage.getItem('learnback_token')) {
        window.location.href = 'auth.html';
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
    window.location.href = 'upload_slides.html';
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
      })
      .catch(function (err) {
        console.error('[StartSession] Demo fetch failed:', err);
        showState('error');
        dom.demoErrorText.textContent = 'Failed to load demo content. Please try again.';
      });
  }

  // ── Demo Flow: Render Preview ────────────────────────────────
  function renderPreview(demo) {
    dom.demoTitle.textContent = demo.title || 'Demo Session';
    dom.demoMeta.textContent = demo.topic_count + ' topics \u00B7 ' + demo.total_points + ' learning points';

    // Clear existing topics
    dom.demoTopics.innerHTML = '';

    var topics = demo.topics || [];
    topics.forEach(function (topic, idx) {
      var li = document.createElement('li');
      li.className = 'demo-topic-item';

      var number = document.createElement('span');
      number.className = 'demo-topic-item__number';
      number.textContent = String(idx + 1);

      var textWrap = document.createElement('div');
      textWrap.className = 'demo-topic-item__text';

      var title = document.createElement('div');
      title.className = 'demo-topic-item__title';
      title.textContent = topic.topic_title || 'Untitled';

      var points = document.createElement('div');
      points.className = 'demo-topic-item__points';
      points.textContent = topic.point_count + ' learning point' + (topic.point_count !== 1 ? 's' : '');

      textWrap.appendChild(title);
      textWrap.appendChild(points);
      li.appendChild(number);
      li.appendChild(textWrap);
      dom.demoTopics.appendChild(li);
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
        window.location.href = 'session.html?sessionId=' + encodeURIComponent(sessionId);
      })
      .catch(function (err) {
        console.error('[StartSession] Demo session creation failed:', err);
        isStarting = false;
        dom.btnStartDemo.disabled = false;
        dom.btnStartDemo.querySelector('span').textContent = 'Start Demo Session';

        // Show inline error
        var detail = (err && err.message) || 'Failed to create session.';
        if (detail.indexOf('active session') !== -1) {
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

})();
