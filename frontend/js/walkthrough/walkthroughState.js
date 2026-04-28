(function () {
  'use strict';

  var STORAGE_KEY = 'learnback_walkthrough_state';
  var VERSION = 1;

  function now() {
    return Date.now();
  }

  function createState(options) {
    var opts = options || {};
    return {
      active: true,
      stepIndex: opts.stepIndex || 0,
      completedSteps: [],
      completedSegments: [],
      skippedSegments: [],
      currentRoute: opts.currentRoute || 'dashboard.html',
      startedAt: now(),
      dismissed: false,
      replay: opts.replay === true,
      version: VERSION
    };
  }

  function read() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return null;
      if (!Array.isArray(parsed.completedSteps)) parsed.completedSteps = [];
      if (!Array.isArray(parsed.completedSegments)) parsed.completedSegments = [];
      if (!Array.isArray(parsed.skippedSegments)) parsed.skippedSegments = [];
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function write(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[Walkthrough] Unable to persist state:', error);
    }
    return state;
  }

  function clear() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* ignore */ }
  }

  window.LearnBackWalkthroughState = {
    key: STORAGE_KEY,
    version: VERSION,
    create: createState,
    read: read,
    write: write,
    clear: clear
  };
})();
