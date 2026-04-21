/* LearnBack - Dashboard
   Backend-ready dashboard state with local history fallback.
   ============================================================ */

(function () {
  'use strict';

  // ── Auth Guard ──────────────────────────────────────────────
  // Redirect to login if no JWT token is present
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
  var BADGE_ICONS = {
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
    medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.21 15 2.66 7.97a2 2 0 0 1 .13-2.2L4.4 3.8A2 2 0 0 1 6 3h12a2 2 0 0 1 1.6.8l1.6 2.97a2 2 0 0 1-.13 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
  };

  var state = {
    filter: 'all',
    dashboard: {
      user: {
        firstName: 'Teacher',
        streak: 0,
        totalHours: 0,
        masteryPct: 0,
        activeDates: []
      },
      badges: [],
      sessions: []
    }
  };

  var elements = {
    trophyShelf: document.getElementById('trophy-shelf'),
    sessionGrid: document.getElementById('session-grid'),
    streakValue: document.getElementById('streak-value'),
    streakBadge: document.getElementById('streak-badge'),
    statHours: document.getElementById('stat-total-hours'),
    statMastery: document.getElementById('stat-mastery'),
    calendar: document.getElementById('dashboard-activity-calendar'),
    calendarMonth: document.getElementById('calendar-month-label')
  };

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

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

  function initWelcome() {
    var name = state.dashboard.user.firstName || 'Teacher';
    var welcome = document.getElementById('welcome-name');
    var sideName = document.getElementById('sidebar-user-name');
    var sideAvatar = document.getElementById('sidebar-avatar');
    var navAvatar = document.getElementById('nav-avatar');
    var initial = name.charAt(0).toUpperCase();

    if (welcome) welcome.textContent = name;
    if (sideName) sideName.textContent = name;
    if (sideAvatar) sideAvatar.textContent = initial;
    if (navAvatar) navAvatar.textContent = initial;
  }

  function formatYmd(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function renderCalendar(activeDates) {
    if (!elements.calendar) return;

    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var today = formatYmd(now);
    var first = new Date(year, month, 1);
    var last = new Date(year, month + 1, 0);
    var startPad = first.getDay();
    var daysInMonth = last.getDate();
    var activeDateSet = {};

    (activeDates || []).forEach(function (date) {
      activeDateSet[date] = true;
    });

    if (elements.calendarMonth) {
      elements.calendarMonth.textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    elements.calendar.innerHTML = '';

    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (label) {
      var dow = document.createElement('div');
      dow.className = 'dashboard-calendar__dow';
      dow.textContent = label;
      elements.calendar.appendChild(dow);
    });

    for (var index = 0; index < startPad; index += 1) {
      var pad = document.createElement('div');
      pad.className = 'dashboard-calendar__cell is-outside';
      pad.setAttribute('aria-hidden', 'true');
      elements.calendar.appendChild(pad);
    }

    for (var day = 1; day <= daysInMonth; day += 1) {
      var dateKey = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var cell = document.createElement('div');
      cell.className = 'dashboard-calendar__cell';
      cell.textContent = String(day);
      cell.setAttribute('role', 'gridcell');

      if (activeDateSet[dateKey]) cell.classList.add('is-active');
      if (dateKey === today) cell.classList.add('is-today');

      elements.calendar.appendChild(cell);
    }
  }

  function renderStats() {
    var user = state.dashboard.user;

    if (elements.streakValue) elements.streakValue.textContent = String(user.streak || 0);
    if (elements.streakBadge) elements.streakBadge.classList.toggle('is-inactive', !(user.streak > 0));
    if (elements.statHours) elements.statHours.textContent = Number(user.totalHours || 0).toFixed(1) + 'h';
    if (elements.statMastery) elements.statMastery.textContent = Math.round(user.masteryPct || 0) + '%';
  }

  function renderTrophies(badges) {
    if (!elements.trophyShelf) return;
    elements.trophyShelf.innerHTML = '';

    if (!badges.length) {
      var empty = document.createElement('p');
      empty.className = 'dashboard-empty';
      empty.textContent = 'Milestones will appear here as you complete sessions.';
      elements.trophyShelf.appendChild(empty);
      return;
    }

    badges.forEach(function (badgeConfig) {
      var item = document.createElement('div');
      item.className = 'trophy-item' + (badgeConfig.unlocked ? ' is-unlocked' : ' is-locked');
      item.setAttribute('role', 'img');
      item.setAttribute('aria-label', badgeConfig.name + (badgeConfig.unlocked ? ', unlocked' : ', locked'));

      var iconKey = badgeConfig.icon && BADGE_ICONS[badgeConfig.icon] ? badgeConfig.icon : 'trophy';
      var iconWrap = document.createElement('div');
      iconWrap.innerHTML = BADGE_ICONS[iconKey];
      item.appendChild(iconWrap.firstChild);

      var tip = document.createElement('div');
      tip.className = 'trophy-tooltip';
      tip.innerHTML = '<strong>' + escapeHtml(badgeConfig.name) + '</strong>' + escapeHtml(badgeConfig.description);
      item.appendChild(tip);

      elements.trophyShelf.appendChild(item);
    });
  }

  function statusLabel(status) {
    if (status === 'mastered') return 'Mastered';
    if (status === 'needs_review') return 'Needs review';
    return 'In progress';
  }

  function formatDate(isoDate) {
    if (!isoDate) return 'No date';
    var date = new Date(isoDate + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderSessionCards() {
    if (!elements.sessionGrid) return;
    elements.sessionGrid.innerHTML = '';

    var filtered = state.dashboard.sessions.filter(function (sessionRecord) {
      return state.filter === 'all' ? true : sessionRecord.status === state.filter;
    });

    if (!filtered.length) {
      var empty = document.createElement('p');
      empty.className = 'dashboard-empty';
      empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:32px;color:var(--text-mid);font-size:var(--fs-sm);';
      empty.textContent = state.dashboard.sessions.length
        ? 'No sessions match this filter yet.'
        : 'No real session history yet. Finish a session and it will appear here automatically.';
      elements.sessionGrid.appendChild(empty);
      return;
    }

    filtered.forEach(function (sessionRecord) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'dashboard-session-card dashboard-session-card--' + sessionRecord.status;
      button.setAttribute('data-session-id', sessionRecord.id);

      var inner = document.createElement('div');
      inner.className = 'dashboard-session-card__inner';

      var top = document.createElement('div');
      top.className = 'dashboard-session-card__top';

      var left = document.createElement('div');
      var title = document.createElement('h3');
      title.className = 'dashboard-session-card__title';
      title.textContent = sessionRecord.title;

      var meta = document.createElement('div');
      meta.className = 'dashboard-session-card__meta';
      meta.textContent = formatDate(sessionRecord.date);

      left.appendChild(title);
      left.appendChild(meta);

      var pill = document.createElement('span');
      pill.className = 'session-status-pill session-status-pill--' + sessionRecord.status;
      pill.textContent = statusLabel(sessionRecord.status);

      top.appendChild(left);
      top.appendChild(pill);

      var progress = document.createElement('div');
      progress.className = 'session-progress';

      var track = document.createElement('div');
      track.className = 'session-progress__track';

      var fill = document.createElement('div');
      fill.className = 'session-progress__fill session-progress__fill--' + sessionRecord.status;
      fill.style.width = clampNumber(sessionRecord.progress, 0, 100) + '%';
      track.appendChild(fill);

      var label = document.createElement('div');
      label.className = 'session-progress__label';
      label.textContent = "Kido's progress · " + clampNumber(sessionRecord.progress, 0, 100) + '%';

      progress.appendChild(track);
      progress.appendChild(label);

      inner.appendChild(top);
      inner.appendChild(progress);
      button.appendChild(inner);

      button.addEventListener('click', function () {
        window.location.href = 'feedback.html?id=' + encodeURIComponent(sessionRecord.id);
      });

      elements.sessionGrid.appendChild(button);
    });
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function renderDashboard() {
    initWelcome();
    renderStats();
    renderCalendar(state.dashboard.user.activeDates || []);
    renderTrophies(state.dashboard.badges || []);
    renderSessionCards();
  }

  function showUserManual() {
    if (document.getElementById('user-manual-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'user-manual-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,0.55)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'z-index:9999',
      'padding:16px'
    ].join(';');

    var modal = document.createElement('div');
    modal.style.cssText = [
      'width:min(560px,100%)',
      'background:#ffffff',
      'border-radius:12px',
      'padding:24px',
      'box-shadow:0 20px 60px rgba(0,0,0,0.25)'
    ].join(';');

    var title = document.createElement('h2');
    title.textContent = 'User Manual';
    title.style.margin = '0 0 12px 0';

    var text = document.createElement('p');
    text.textContent = 'Welcome to LearnBack. This dashboard tracks your sessions, mastery progress, and milestones. Use "Start session" to begin your first guided lesson.';
    text.style.margin = '0 0 20px 0';
    text.style.lineHeight = '1.5';

    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Got it!';
    button.style.cssText = [
      'border:none',
      'border-radius:8px',
      'padding:10px 16px',
      'cursor:pointer',
      'background:#1f6feb',
      'color:#fff',
      'font-weight:600'
    ].join(';');

    button.addEventListener('click', async function () {
      if (window.LearnBackAPI && typeof window.LearnBackAPI.request === 'function') {
        var response = await window.LearnBackAPI.request('/api/auth/onboarding_complete', {
          method: 'PATCH'
        });
        if (response && response._error) {
          console.warn('Failed to mark onboarding complete:', response.message);
          return;
        }
      }
      overlay.remove();
    });

    modal.appendChild(title);
    modal.appendChild(text);
    modal.appendChild(button);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function wireFilters() {
    var pills = document.querySelectorAll('[data-filter]');

    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        var nextFilter = pill.getAttribute('data-filter') || 'all';
        state.filter = nextFilter;

        pills.forEach(function (button) {
          var isActive = button.getAttribute('data-filter') === nextFilter;
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        renderSessionCards();
      });
    });
  }

  function wireActionCards() {
    var start = document.getElementById('btn-start-session');
    if (start) {
      start.addEventListener('click', function () {
        window.location.href = 'upload_slides.html';
      });
    }
  }

  function wireDashboardTabs() {
    var tabButtons = document.querySelectorAll('[data-dashboard-tab]');
    var panelHome = document.getElementById('panel-home');
    var panelSessions = document.getElementById('panel-sessions');
    var title = document.getElementById('dashboard-page-title');
    var main = document.getElementById('dashboard-main');
    var tabTitles = { home: 'Home', sessions: 'Past sessions' };

    function setTab(tabId) {
      var nextTab = tabTitles[tabId] ? tabId : 'home';

      tabButtons.forEach(function (button) {
        var isActive = button.getAttribute('data-dashboard-tab') === nextTab;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      if (panelHome) panelHome.hidden = nextTab !== 'home';
      if (panelSessions) panelSessions.hidden = nextTab !== 'sessions';
      if (title) title.textContent = tabTitles[nextTab];
      if (main) main.scrollTop = 0;

      try {
        history.replaceState(null, '', nextTab === 'sessions' ? '#sessions' : '#home');
      } catch (error) {
        return;
      }
    }

    tabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setTab(button.getAttribute('data-dashboard-tab'));
      });
    });

    var hash = (window.location.hash || '').replace(/^#/, '');
    setTab(hash === 'sessions' ? 'sessions' : 'home');

    window.addEventListener('hashchange', function () {
      var nextHash = (window.location.hash || '').replace(/^#/, '');
      setTab(nextHash === 'sessions' ? 'sessions' : 'home');
    });
  }

  async function loadDashboardState() {
    if (window.LearnBackAPI && typeof window.LearnBackAPI.fetchDashboardState === 'function') {
      try {
        var remote = await window.LearnBackAPI.fetchDashboardState();
        if (remote && remote.user && Array.isArray(remote.sessions)) {
          return remote;
        }
      } catch (error) {
        console.warn('Dashboard API unavailable, falling back to local session history.', error);
      }
    }

    if (window.SessionStore && typeof window.SessionStore.buildDashboardState === 'function') {
      return window.SessionStore.buildDashboardState();
    }

    return state.dashboard;
  }

  // ── Token Validation ───────────────────────────────────────
  // Calls /api/auth/me to verify the JWT is still valid.
  // If expired or invalid, logs out and redirects to auth.html.
  async function validateSession() {
    if (!window.LearnBackAPI || typeof window.LearnBackAPI.request !== 'function') {
      return; // API client not loaded — token-only guard already ran
    }

    try {
      var me = await window.LearnBackAPI.request('/api/auth/me');
      // Update stored user details from backend
      if (me && me.username) {
        try {
          window.localStorage.setItem('learnback_user', JSON.stringify({
            user_id: me.user_id,
            username: me.username
          }));
        } catch (_) { /* ignore */ }

        // Refresh the UI with the server-authoritative name
        state.dashboard.user.firstName = me.username.split(' ')[0] || 'Teacher';
        initWelcome();
      }

      if (me && me.has_seen_walkthrough === false) {
        showUserManual();
      }
    } catch (error) {
      // 401 is handled by apiClient.js (auto-redirect)
      // For other errors, don't block the dashboard
      console.warn('Session validation failed:', error);
    }
  }

  // ── Logout Wiring ─────────────────────────────────────────
  function wireLogout() {
    var btn = document.getElementById('btn-logout');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (window.LearnBackAPI && typeof window.LearnBackAPI.logout === 'function') {
        window.LearnBackAPI.logout();
      } else {
        try {
          window.localStorage.removeItem('learnback_token');
          window.localStorage.removeItem('learnback_user');
        } catch (_) { /* ignore */ }
        window.location.href = 'auth.html';
      }
    });
  }

  async function init() {
    initTheme();
    wireDashboardTabs();
    wireFilters();
    wireActionCards();
    wireLogout();

    // Validate token with the backend (non-blocking — UI renders first)
    state.dashboard = await loadDashboardState();
    renderDashboard();

    // Fire session validation after initial render so the page feels fast
    validateSession();
  }

  init();
})();
