/**
 * LearnBack — Runtime Configuration (Single Source of Truth)
 *
 * This file defines window.__LEARNBACK_CONFIG__ which all other scripts
 * read for API and WebSocket URLs.
 *
 * LOAD ORDER: This script MUST be loaded before apiClient.js and auth.js.
 *             However, every consumer has an inline fallback so the app
 *             will NOT crash if this script fails to load or loads late.
 *
 * OVERRIDE (production hosting):
 *   Option A — Set window.__LEARNBACK_API_URL__ before this script:
 *       <script> window.__LEARNBACK_API_URL__ = 'https://api.learnback.app'; </script>
 *       <script src="config.js"></script>
 *
 *   Option B — Set the full config object before this script:
 *       <script>
 *         window.__LEARNBACK_CONFIG__ = {
 *           API_BASE_URL: 'https://api.learnback.app',
 *           WS_BASE_URL:  'wss://api.learnback.app'
 *         };
 *       </script>
 *       (config.js will detect the existing object and skip initialization)
 */
(function () {
  'use strict';

  // ── Guard: Do NOT overwrite if already fully configured ──
  if (
    window.__LEARNBACK_CONFIG__ &&
    window.__LEARNBACK_CONFIG__.API_BASE_URL &&
    window.__LEARNBACK_CONFIG__.WS_BASE_URL
  ) {
    return; // Already configured (e.g., by hosting platform injection)
  }

  // ── Resolve API base URL ──
  var apiBase;

  // Priority 1: Explicit override variable
  if (typeof window.__LEARNBACK_API_URL__ === 'string' && window.__LEARNBACK_API_URL__) {
    apiBase = window.__LEARNBACK_API_URL__.replace(/\/+$/, '');
  }
  // Priority 2: Detect environment from hostname
  else {
    var hostname = window.location.hostname;
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
      apiBase = 'http://127.0.0.1:8002';
    } else {
      // Production backend (Render)
      apiBase = 'https://learn-back-v2.onrender.com';
    }
  }

  // ── Derive WebSocket base URL from API base ──
  var wsBase = apiBase
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:');

  // ── Publish config ──
  window.__LEARNBACK_CONFIG__ = {
    API_BASE_URL: apiBase,
    WS_BASE_URL: wsBase
  };
})();
