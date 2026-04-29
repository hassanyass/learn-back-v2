/* ═══════════════════════════════════════════════════════
   SESSION WALKTHROUGH STEPS
   Appended to window.LearnBackWalkthroughSteps (dashboard
   steps are loaded first by walkthroughSteps.js).
   Segment: 'session'  |  Route: 'session.html'
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Helper: expand the right panel if it is collapsed ── */
  function ensureRightPanelOpen() {
    var iconBar = document.getElementById('right-icon-bar');
    if (!iconBar) return;
    var visible = window.getComputedStyle(iconBar).display !== 'none';
    if (visible) {
      var btn = document.getElementById('btn-expand-right');
      if (btn) btn.click();
    }
  }

  var sessionSteps = [
    /* ── 1. Left panel: Kido ─────────────────────────── */
    {
      id: 'session_kido_panel',
      segment: 'session',
      route: 'session.html',
      target: '#ai-panel',
      title: 'Meet Kido',
      description: 'This is Kido — your AI student. Watch the HUD react as your explanations improve. The better you explain, the higher the understanding score climbs.',
      action: 'highlight',
      placement: 'right',
      placementFallbacks: ['bottom', 'left'],
      cardSize: 'compact',
      spotlightPadding: 8
    },

    /* ── 2. Center: Chat area ─────────────────────────── */
    {
      id: 'session_chat_area',
      segment: 'session',
      route: 'session.html',
      target: '#chat-container',
      title: 'Teach here',
      description: 'Type your explanation in plain words. Kido will respond, push back, and ask follow-up questions. No multiple choice — only real explanation.',
      action: 'highlight',
      placement: 'left',
      placementFallbacks: ['right', 'bottom'],
      cardSize: 'compact',
      spotlightPadding: 8
    },

    /* ── 3. Knowledge Cube button ─────────────────────── */
    {
      id: 'session_cube_btn',
      segment: 'session',
      route: 'session.html',
      target: '#btn-request-graph',
      title: 'Knowledge Cube',
      description: 'Opens an interactive concept map showing how Kido has structured what you taught. Use it to check whether the big picture is forming correctly.',
      action: 'highlight',
      placement: 'top',
      placementFallbacks: ['bottom', 'right', 'left'],
      cardSize: 'compact',
      spotlightPadding: 16,
      avoidPadding: 20
    },

    /* ── 4. View Slides button ────────────────────────── */
    {
      id: 'session_slides_btn',
      segment: 'session',
      route: 'session.html',
      target: '#btn-open-slides',
      title: 'View your slides',
      description: 'Opens your lecture slides in a side panel. You can read — but not copy. You must understand the content to explain it.',
      action: 'highlight',
      placement: 'top',
      placementFallbacks: ['bottom', 'right', 'left'],
      cardSize: 'compact',
      spotlightPadding: 16,
      avoidPadding: 20
    },

    /* ── 5. Hint button ───────────────────────────────── */
    {
      id: 'session_hint_btn',
      segment: 'session',
      route: 'session.html',
      target: '#btn-spark',
      title: 'Need a hint?',
      description: 'Stuck? Ask for a hint. Kido gives you a nudge without giving away the answer. Use it sparingly — the more you explain yourself, the more you learn.',
      action: 'highlight',
      placement: 'top',
      placementFallbacks: ['bottom', 'left', 'right'],
      cardSize: 'compact',
      spotlightPadding: 16,
      avoidPadding: 20
    },

    /* ── 6. Misconceptions card (right panel) ─────────── */
    {
      id: 'session_misconceptions',
      segment: 'session',
      route: 'session.html',
      target: '#btn-misconceptions',
      title: 'Misconceptions',
      description: 'When Kido flags a mistake in your explanation, it appears here. Tap to see exactly what was misunderstood and why — before it costs you on the exam.',
      action: 'highlight',
      placement: 'left',
      placementFallbacks: ['top', 'bottom', 'right'],
      cardSize: 'compact',
      spotlightPadding: 12,
      /* Expand the right panel before rendering this step */
      beforeRender: ensureRightPanelOpen
    },

    /* ── 7. What Kido Learned card (right panel) ──────── */
    {
      id: 'session_kido_learned',
      segment: 'session',
      route: 'session.html',
      target: '#btn-kido-learned',
      title: 'What Kido Learned',
      description: 'As you teach, Kido logs the insights it picked up. Browse this to see how much understanding you have transferred — and what still needs work.',
      action: 'highlight',
      placement: 'left',
      placementFallbacks: ['top', 'bottom', 'right'],
      cardSize: 'compact',
      spotlightPadding: 12,
      beforeRender: ensureRightPanelOpen,
      endSegment: true
    }
  ];

  var existing = window.LearnBackWalkthroughSteps || [];
  window.LearnBackWalkthroughSteps = existing.concat(sessionSteps);
})();
