(function () {
  'use strict';

  var State = window.LearnBackWalkthroughState;
  var Renderer = window.LearnBackWalkthroughRenderer;
  var steps = window.LearnBackWalkthroughSteps || [];
  var currentRoute = null;
  var renderTimer = null;

  function routeFromLocation() {
    var name = window.location.pathname.split('/').pop() || 'dashboard.html';
    return name || 'dashboard.html';
  }

  function readState() {
    return State ? State.read() : null;
  }

  function saveState(state) {
    return State ? State.write(state) : state;
  }

  function getStep(index) {
    return steps[index] || null;
  }

  function getSegmentIndexes(segment) {
    var indexes = [];
    steps.forEach(function (step, index) {
      if (step.segment === segment) indexes.push(index);
    });
    return indexes;
  }

  function firstIndexForSegment(segment) {
    var indexes = getSegmentIndexes(segment);
    return indexes.length ? indexes[0] : -1;
  }

  function segmentForRoute(route) {
    if (route === 'dashboard.html') return 'dashboard';
    if (route === 'start_session.html') return 'choice';
    if (route === 'session.html') return 'session';
    return null;
  }

  function hasSegmentEnded(state, segment) {
    if (!state || !segment) return false;
    return state.completedSegments.indexOf(segment) !== -1
      || state.skippedSegments.indexOf(segment) !== -1;
  }

  function isFirstInSegment(index) {
    var step = getStep(index);
    if (!step) return index === 0;
    return firstIndexForSegment(step.segment) === index;
  }

  function isLastInSegment(index) {
    var step = getStep(index);
    var next = getStep(index + 1);
    return !step || step.endSegment === true || !next || next.segment !== step.segment;
  }

  function getCurrentStep() {
    var state = readState();
    return state ? getStep(state.stepIndex) : null;
  }

  function safeRequest(path, options) {
    if (!window.LearnBackAPI || typeof window.LearnBackAPI.request !== 'function') {
      return Promise.reject(new Error('API unavailable'));
    }
    return window.LearnBackAPI.request(path, options || {});
  }

  function getStoredUser() {
    if (window.LearnBackAPI && typeof window.LearnBackAPI.getStoredUser === 'function') {
      return window.LearnBackAPI.getStoredUser();
    }
    try {
      var raw = window.localStorage.getItem('learnback_user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function routeFromLocation() {
    var name = window.location.pathname.split('/').pop() || 'dashboard.html';
    if (!name) name = 'dashboard.html';
    /* Vercel cleanUrls removes .html from the pathname (e.g. /dashboard instead
       of /dashboard.html). Re-append it so segment lookups always work. */
    if (name && name.indexOf('.') === -1) name = name + '.html';
    return name;
  }

  function routeTo(route) {
    if (!route || route === currentRoute) return;
    window.location.href = route;
  }

  function isAwaitingTrigger(step) {
    if (!step) return false;
    return step.hidden === true;
  }

  function findStepIndexById(id) {
    for (var i = 0; i < steps.length; i += 1) {
      if (steps[i].id === id) return i;
    }
    return -1;
  }

  function nextRenderableIndex(state, fromIndex) {
    var idx = fromIndex + 1;
    while (idx < steps.length) {
      var s = getStep(idx);
      if (!s || s.segment !== state.segment) return -1;
      if (s.hidden === true) {
        idx += 1;
        continue;
      }
      return idx;
    }
    return -1;
  }

  function renderStep(step, state) {
    /* Run optional per-step setup (e.g. expand a panel) before rendering */
    if (step && typeof step.beforeRender === 'function') {
      try { step.beforeRender(); } catch (_) { /* never block the tour */ }
    }
    Renderer.destroy();
    Renderer.render(step, state, {
      index: state.stepIndex,
      total: steps.length,
      isFirstInSegment: isFirstInSegment(state.stepIndex),
      isLastInSegment: isLastInSegment(state.stepIndex)
    });
  }

  function renderCurrentWithRetry(attempt) {
    var state = readState();
    var step = state ? getStep(state.stepIndex) : null;
    var tries = attempt || 0;

    if (!state || !state.active || !step) {
      Renderer.destroy();
      return;
    }

    if (step.route !== currentRoute) return;

    if (isAwaitingTrigger(step)) {
      Renderer.destroy();
      return;
    }

    if (step.target) {
      var el = document.querySelector(step.target);
      var isSidebarHidden = window.innerWidth <= 1024 && !document.body.classList.contains('is-sidebar-open');
      var isInsideSidebar = el && el.closest('.dashboard-sidebar');

      // CHUNK 7: Session drawer/modal awareness
      var isMobile = window.innerWidth <= 768;
      var isInsideLeftDrawer = isMobile && el && el.closest('.zone--left');
      var isInsideRightDrawer = isMobile && el && el.closest('.zone--right');
      var isLeftDrawerClosed = isMobile && !document.querySelector('.zone--left.is-open');
      var isRightDrawerClosed = isMobile && !document.querySelector('.zone--right.is-open');
      var isSlideModalActive = isMobile && document.querySelector('#chat-panel.slides-open');
      var isInsideSlideModal = isMobile && el && el.closest('#slide-deck-view');

      // Pause: target inside closed drawer
      var isDrawerBlocked = (isInsideLeftDrawer && isLeftDrawerClosed)
        || (isInsideRightDrawer && isRightDrawerClosed);

      // Pause: target behind active slide modal (but not inside it)
      var isModalBlocked = isSlideModalActive && el && !isInsideSlideModal;

      if ((!el && tries < 20) || (isInsideSidebar && isSidebarHidden) || isDrawerBlocked || isModalBlocked) {
        window.clearTimeout(renderTimer);
        if ((isInsideSidebar && isSidebarHidden) || isDrawerBlocked || isModalBlocked) Renderer.destroy();
        renderTimer = window.setTimeout(function () {
          var shouldRetryWithoutIncrement = (isInsideSidebar && isSidebarHidden) || isDrawerBlocked || isModalBlocked;
          renderCurrentWithRetry(shouldRetryWithoutIncrement ? tries : tries + 1);
        }, 150);
        return;
      }
    }

    renderStep(step, state);
  }

  function bind(route) {
    currentRoute = route || routeFromLocation();
    var state = readState();
    if (state && state.active) {
      state.currentRoute = currentRoute;
      var current = getStep(state.stepIndex);

      /* ── Stale-state guard ───────────────────────────────────────
         If the active step belongs to a different page (e.g. the user
         navigated away from start_session.html by clicking Upload/Demo
         without completing the choice walkthrough), the tour state is
         abandoned. Clear active so the current page can start its own
         walkthrough. */
      if (current && current.route !== currentRoute) {
        state.active = false;
        state.dismissed = true;
        saveState(state);
        /* Fall through to the auto-start logic below */
      } else {
        if (current && current.hidden === true) {
          var resumeIdx = nextRenderableIndex(state, state.stepIndex);
          if (resumeIdx >= 0) {
            state.stepIndex = resumeIdx;
            var resumeStep = getStep(resumeIdx);
            state.segment = resumeStep.segment;
            state.currentRoute = resumeStep.route;
          }
        }
        saveState(state);
        renderCurrentWithRetry();
        return;
      }
    }

    var routeSegment = segmentForRoute(currentRoute);
    if (routeSegment && routeSegment !== 'dashboard') {
      var stored = getStoredUser();
      if (routeSegment === 'choice') {
        /* Only show to first-time users (has_seen_walkthrough === false) or
           when the user explicitly replays the tour. */
        var isReplayChoice = state && state.replay === true;
        if (!isReplayChoice && !(stored && stored.has_seen_walkthrough === false)) return;
        if (state) {
          state.completedSegments = (state.completedSegments || []).filter(function(s){ return s !== 'choice'; });
          state.skippedSegments   = (state.skippedSegments   || []).filter(function(s){ return s !== 'choice'; });
          saveState(state);
        }
        startSegment('choice', { replay: false });
        return;
      }

      if (routeSegment === 'session') {
        /* Only show to first-time users or on explicit replay. */
        var isReplaySession = state && state.replay === true;
        if (!isReplaySession && !(stored && stored.has_seen_walkthrough === false)) return;
        if (state) {
          state.skippedSegments = (state.skippedSegments || []).filter(function (s) { return s !== 'session'; });
          saveState(state);
        }
        var sessionDone = state
          && Array.isArray(state.completedSegments)
          && state.completedSegments.indexOf('session') !== -1;
        if (!sessionDone) {
          startSegment('session', { replay: false });
        }
        return;
      }
      if (stored && stored.has_seen_walkthrough === false && !hasSegmentEnded(state, routeSegment)) {
        startSegment(routeSegment, { replay: false });
      }
    }
  }

  function startSegment(segment, options) {
    var opts = options || {};
    var firstIndex = firstIndexForSegment(segment);
    if (firstIndex < 0) return;
    var previous = readState();
    var state = State.create({
      stepIndex: opts.stepIndex != null ? opts.stepIndex : firstIndex,
      currentRoute: currentRoute || routeFromLocation(),
      replay: opts.replay === true
    });
    if (previous) {
      state.completedSteps = previous.completedSteps || [];
      state.completedSegments = previous.completedSegments || [];
      state.skippedSegments = previous.skippedSegments || [];
      state.replay = previous.replay === true || opts.replay === true;
    }
    state.segment = segment;
    saveState(state);

    var step = getStep(state.stepIndex);
    if (step && step.route !== routeFromLocation()) {
      routeTo(step.route);
      return;
    }
    renderCurrentWithRetry();
  }

  function startTour(options) {
    startSegment('dashboard', options || {});
  }

  function replayTour() {
    if (State) State.clear();
    var route = routeFromLocation();
    if (route !== 'dashboard.html') {
      saveState(State.create({ stepIndex: 0, currentRoute: 'dashboard.html', replay: true }));
      routeTo('dashboard.html');
      return;
    }
    startTour({ replay: true });
  }

  function maybeStart(route) {
    bind(route || routeFromLocation());
    var existing = readState();
    if (existing && existing.active) return;

    var stored = getStoredUser();
    if (stored && stored.has_seen_walkthrough === false && !hasSegmentEnded(existing, 'dashboard')) {
      startTour({ replay: false });
      return;
    }

    safeRequest('/auth/me')
      .then(function (user) {
        if (!user || user.has_seen_walkthrough !== false || hasSegmentEnded(readState(), 'dashboard')) return;
        try {
          window.localStorage.setItem('learnback_user', JSON.stringify({
            user_id: user.user_id,
            username: user.username,
            has_seen_walkthrough: user.has_seen_walkthrough
          }));
        } catch (_) { /* ignore */ }
        startTour({ replay: false });
      })
      .catch(function () {
        // Do not block the app if onboarding status cannot be fetched.
      });
  }

  function completeTour(options) {
    var state = readState();
    var replay = state && state.replay === true;
    if (state) {
      var step = getStep(state.stepIndex);
      var segment = state.segment || (step && step.segment);
      if (segment && state.completedSegments.indexOf(segment) === -1) {
        state.completedSegments.push(segment);
      }
      state.active = false;
      state.dismissed = false;
      saveState(state);
      /* session segment completion is tracked in completedSegments only;
         no separate localStorage key is needed or used. */
    }
    Renderer.destroy();

    /* Always mark the local user as having seen the walkthrough on any
       non-replay completion. bind() reads this flag from localStorage to
       decide whether to start a segment, so it must be set even when the
       backend call is skipped. */
    if (!replay) {
      try {
        var rawUser = window.localStorage.getItem('learnback_user');
        var storedUser = rawUser ? JSON.parse(rawUser) : {};
        storedUser.has_seen_walkthrough = true;
        window.localStorage.setItem('learnback_user', JSON.stringify(storedUser));
      } catch (_) { /* ignore */ }
    }

    if (replay) return;

    /* Sync to backend so DB.has_seen_walkthrough is set. Wrapped in an
       async IIFE so we don't change completeTour's call signature, and
       guarded so a network/API failure logs a warning instead of silently
       leaving the system in a partial state. */
    (async function () {
      try {
        await safeRequest('/auth/onboarding_complete', { method: 'PATCH' });
      } catch (e) {
        console.warn('Failed to sync onboarding state to backend', e);
      }
    })();
  }

  function dismissCurrentPopup() {
    var state = readState();
    if (!state || !state.active) return;
    var step = getStep(state.stepIndex);
    if (!step) return;

    if (state.completedSteps.indexOf(step.id) === -1) {
      state.completedSteps.push(step.id);
    }
    if (step.endSegment === true) {
      saveState(state);
      completeTour({ skipBackend: true });
      return;
    }

    var nextIdx = nextRenderableIndex(state, state.stepIndex);
    if (nextIdx === -1) {
      saveState(state);
      completeTour({ skipBackend: true });
      return;
    }

    state.stepIndex = nextIdx;
    var nextObj = getStep(nextIdx);
    state.segment = nextObj.segment;
    state.currentRoute = nextObj.route;
    saveState(state);

    if (nextObj.route !== currentRoute) {
      Renderer.destroy();
      routeTo(nextObj.route);
      return;
    }

    Renderer.destroy();
    renderCurrentWithRetry();
  }

  function skipTour() {
    var state = readState();
    var activeStep = state ? getStep(state.stepIndex) : null;
    if (!activeStep) return;
    if (activeStep.mandatory === true) return;

    if (activeStep.skipDismissesPopup === true) {
      dismissCurrentPopup();
      return;
    }

    if (state) {
      var segment = state.segment || activeStep.segment;
      if (segment && state.skippedSegments.indexOf(segment) === -1) {
        state.skippedSegments.push(segment);
      }
      state.active = false;
      state.dismissed = true;
      saveState(state);
    }
    Renderer.destroy();
  }

  function move(delta) {
    var state = readState();
    if (!state || !state.active) return;

    var current = getStep(state.stepIndex);
    if (current && state.completedSteps.indexOf(current.id) === -1) {
      state.completedSteps.push(current.id);
    }

    if (current && current.endSegment === true && delta > 0) {
      completeTour({ skipBackend: true });
      return;
    }

    var nextIndex = state.stepIndex + delta;
    if (nextIndex < 0) nextIndex = 0;
    var nextStepObj = getStep(nextIndex);
    if (nextIndex >= steps.length || (current && nextStepObj && nextStepObj.segment !== current.segment)) {
      completeTour({ skipBackend: true });
      return;
    }

    state.stepIndex = nextIndex;
    var next = getStep(nextIndex);
    state.segment = next ? next.segment : state.segment;
    state.currentRoute = next ? next.route : currentRoute;
    saveState(state);

    if (next && next.route !== currentRoute) {
      Renderer.destroy();
      routeTo(next.route);
      return;
    }

    renderCurrentWithRetry();
  }

  function nextStep() {
    var state = readState();
    var step = state ? getStep(state.stepIndex) : null;
    if (!step) return;
    if (step.requireAction && step.allowNext !== true) return;
    if (step.dismissOnNext === true) {
      dismissCurrentPopup();
      return;
    }
    move(1);
  }

  function prevStep() {
    move(-1);
  }

  function notify(eventName, payload) {
    if (eventName === 'upload_content_ready') {
      startSegment('content-preview', { stepIndex: firstIndexForSegment('content-preview') });
    }
    if (eventName === 'demo_preview_ready') {
      var indexes = getSegmentIndexes('content-preview');
      var demoIndex = indexes.find(function (index) {
        return getStep(index).route === 'start_session.html';
      });
      startSegment('content-preview', { stepIndex: demoIndex >= 0 ? demoIndex : indexes[0] });
    }
  }

  document.addEventListener('click', function (event) {
    var state = readState();
    var step = state ? getStep(state.stepIndex) : null;
    if (!state || !state.active || !step) return;
    if (Renderer.isRendered && !Renderer.isRendered()) return;
    if (step.passThrough === true) return;
    if (event.target.closest('[data-walkthrough-action]')) return;
    if (step.target && event.target.closest(step.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('click', function (event) {
    var action = event.target.closest('[data-walkthrough-action]');
    if (!action) return;
    event.preventDefault();
    var name = action.getAttribute('data-walkthrough-action');
    if (name === 'next') nextStep();
    else if (name === 'prev') prevStep();
    else if (name === 'skip') skipTour();
  });

  document.addEventListener('click', function (event) {
    var state = readState();
    var step = state ? getStep(state.stepIndex) : null;
    if (!state || !state.active || !step || !step.target) return;
    if (Renderer.isRendered && !Renderer.isRendered()) return;
    var target = event.target.closest(step.target);
    if (!target) return;

    if (step.followUpId) {
      var followIdx = findStepIndexById(step.followUpId);
      if (followIdx >= 0) {
        var followStep = getStep(followIdx);
        if (state.completedSteps.indexOf(step.id) === -1) {
          state.completedSteps.push(step.id);
        }
        state.stepIndex = followIdx;
        state.segment = followStep.segment;
        state.currentRoute = followStep.route;
        saveState(state);
        renderStep(followStep, state);
      }
      return;
    }

    if (step.dismissOnNext === true) {
      dismissCurrentPopup();
      return;
    }

    if (step.requireAction) {
      if (step.allowNext === true) {
        completeTour({ skipBackend: true });
        return;
      }
      move(1);
    }
  }, true);

  window.addEventListener('resize', function () {
    var step = getCurrentStep();
    if (step) Renderer.refresh(step);
  });

  function isActive() {
    var s = readState();
    return !!(s && s.active);
  }

  window.LearnBackWalkthrough = {
    bind: bind,
    maybeStart: maybeStart,
    startSegment: startSegment,
    startTour: startTour,
    replayTour: replayTour,
    resumeTour: renderCurrentWithRetry,
    nextStep: nextStep,
    prevStep: prevStep,
    skipTour: skipTour,
    completeTour: completeTour,
    getCurrentStep: getCurrentStep,
    isActive: isActive,
    notify: notify
  };

  /* ── Auto-init for session.html ─────────────────────────────────────────
     Fire bind() immediately when this controller script executes on
     session.html. Because this is a <script defer>, it runs after the DOM
     is ready but BEFORE session.js (a <script type="module">) resumes from
     any await. This gives the walkthrough the earliest possible start time
     and removes the dependency on session.js calling bind() after a network
     round-trip.
  */
  (function () {
    var autoRoute = routeFromLocation();
    if (autoRoute === 'session.html') {
      bind(autoRoute);
    }
  }());

})();
