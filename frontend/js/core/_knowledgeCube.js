/**
 * renderKnowledgeCubeWidget — Ported from script.js.bak Knowledge Cube.
 * Renders an interactive cube-based mind map widget directly into the chat feed.
 *
 * @param {Object} graphData - Backend mind_map_data payload
 * @param {Function} onSubmitCallback - Called with (nodeLabel, correctionText) on annotation
 */
renderKnowledgeCubeWidget(graphData, onSubmitCallback) {
  var dom = this.dom;
  if (!dom.chatMessages) return;

  var rawData = graphData || {};
  var normalizedNodes = MindMapAdapter.normalize(rawData);
  var nodes = normalizedNodes || [];
  var renderId = normalizedNodes.eventId || 'mm_evt_unknown';

  // 1. Idempotency Check
  if (dom.chatMessages.querySelector('.kc-root[data-render-id="' + renderId + '"]')) {
    console.warn('[UI] Duplicate mind map render blocked:', renderId);
    return;
  }

  // 2. Destroy previous widget
  var existingWidget = dom.chatMessages.querySelector('.kc-root');
  if (existingWidget) {
    var existingWrapper = existingWidget.closest('.message--ai');
    if (existingWrapper) existingWrapper.remove();
    else existingWidget.remove();
  }

  // 3. Empty state
  if (nodes.length === 0) {
    var emptyMsg = document.createElement('div');
    emptyMsg.className = 'message message--ai';
    emptyMsg.setAttribute('data-render-id', renderId);
    emptyMsg.innerHTML = '<div class="message__bubble kc-root" data-render-id="' + renderId + '"><p style="padding:16px;text-align:center;color:var(--text-soft);font-size:13px;">Kido is ready! Teach the first point to start building the map.</p></div>';
    dom.chatMessages.appendChild(emptyMsg);
    this.scrollToBottom();
    return;
  }

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
    bubbleBg: tv('--surface-2', '#123543'),
    widgetBg: tv('--widget-shell-bg', 'linear-gradient(180deg, #173F4D, #123543)'),
    widgetBorder: tv('--widget-shell-border', 'rgba(234, 244, 247, 0.10)'),
    widgetShadow: tv('--shadow-zone', '0 14px 36px rgba(0,0,0,0.34)'),
    topBarBg: tv('--widget-header-bg', 'rgba(6, 23, 32, 0.72)'),
    topBarBorder: tv('--border', 'rgba(234, 244, 247, 0.10)'),
    topBarIconBg: tv('--navy', '#061720'),
    topBarIconFg: tv('--plum', '#B07A96'),
    title: tv('--widget-title', '#EAF4F7'),
    hint: tv('--widget-hint', 'rgba(243,210,224,0.82)'),
    legend: tv('--widget-legend', '#A9C0C8'),
    pendingBg: tv('--widget-pending-bg', '#123543'),
    pendingBorder: tv('--widget-pending-border', 'rgba(234, 244, 247, 0.18)'),
    pendingShadow: tv('--widget-pending-shadow', '#081d26'),
    pendingText: tv('--widget-pending-text', '#EAF4F7'),
    connector: tv('--widget-connector', '#d6a7bf'),
    reviewBadgeBg: tv('--navy', '#061720'),
    reviewBadgeText: tv('--text-primary', '#EAF4F7'),
    reviewTitle: tv('--text-primary', '#EAF4F7'),
    quoteCardBg: tv('--widget-quote-bg', '#123543'),
    quoteCardBorder: tv('--widget-quote-border', 'rgba(234, 244, 247, 0.18)'),
    quoteCardShadow: tv('--widget-pending-shadow', '#081d26'),
    quoteText: tv('--widget-quote-text', '#EAF4F7'),
    priorBg: tv('--widget-prior-bg', 'rgba(230,176,74,0.12)'),
    priorBorder: tv('--widget-prior-border', 'rgba(230,176,74,0.28)'),
    priorLabel: tv('--widget-prior-label', '#f6d58f'),
    buttonSecondaryBg: tv('--widget-secondary-bg', '#123543'),
    buttonSecondaryText: tv('--widget-secondary-text', '#f3d2e0'),
    textareaBg: tv('--widget-textarea-bg', '#0D2A34'),
    textareaBorder: tv('--widget-textarea-border', 'rgba(234, 244, 247, 0.18)'),
    textareaText: tv('--widget-textarea-text', '#EAF4F7')
  } : {
    bubbleBg: 'transparent',
    widgetBg: '#F6E8EA',
    widgetBorder: '#925E78',
    widgetShadow: '0 2px 12px rgba(0,0,0,0.07)',
    topBarBg: 'rgba(255,255,255,0.7)',
    topBarBorder: 'rgba(146,94,120,0.2)',
    topBarIconBg: '#022B3A',
    topBarIconFg: '#F6E8EA',
    title: '#022B3A',
    hint: '#925E78',
    legend: 'rgba(2,43,58,0.6)',
    pendingBg: 'white',
    pendingBorder: '#022B3A',
    pendingShadow: '#022B3A',
    pendingText: '#022B3A',
    connector: '#925E78',
    reviewBadgeBg: '#022B3A',
    reviewBadgeText: 'white',
    reviewTitle: '#022B3A',
    quoteCardBg: 'white',
    quoteCardBorder: '#022B3A',
    quoteCardShadow: '#022B3A',
    quoteText: '#022B3A',
    priorBg: '#FFF8E7',
    priorBorder: 'rgba(245,166,35,0.4)',
    priorLabel: '#D4870A',
    buttonSecondaryBg: 'white',
    buttonSecondaryText: '#925E78',
    textareaBg: 'white',
    textareaBorder: 'rgba(146,94,120,0.4)',
    textareaText: '#022B3A'
  };

  // 6. Build wrapper
  var msgWrapper = document.createElement('div');
  msgWrapper.className = 'message message--ai';

  var senderLabel = document.createElement('span');
  senderLabel.className = 'message__sender';
  senderLabel.textContent = 'KIDO (Knowledge Map)';

  var bubble = document.createElement('div');
  bubble.className = 'message__bubble message__bubble--app kc-root';
  bubble.setAttribute('data-render-id', renderId);
  bubble.style.cssText = 'padding:0; overflow:hidden; border-radius:14px; width:100%; max-width:100%; background:' + T.bubbleBg + '; border:none; box-shadow:none;';

  // 7. Widget root
  var widget = document.createElement('div');
  widget.style.cssText = 'font-family:Inter,system-ui,sans-serif; background:' + T.widgetBg + '; border:1.5px solid ' + T.widgetBorder + '; border-radius:14px; overflow:hidden; box-shadow:' + T.widgetShadow + '; width:100%;';

  // Top bar
  var topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex; align-items:center; gap:8px; padding:9px 14px; border-bottom:1px solid ' + T.topBarBorder + '; background:' + T.topBarBg + ';';
  topBar.innerHTML = '<div style="width:26px;height:26px;border-radius:50%;background:' + T.topBarIconBg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="14" height="10" viewBox="0 0 14 10" fill="none"><rect x="0" y="3" width="14" height="4" rx="2" fill="' + T.topBarIconFg + '"/></svg></div><span style="font-size:10px;font-weight:700;color:' + T.title + ';letter-spacing:.07em;text-transform:uppercase;">Knowledge Map</span>';

  // 8. Graph View
  var graphView = document.createElement('div');
  graphView.id = 'kc-graph-' + currentId;
  graphView.style.cssText = 'padding:22px 20px 20px;';

  var hintEl = document.createElement('p');
  hintEl.style.cssText = 'font-size:10px;color:' + T.hint + ';font-weight:600;text-align:center;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;';
  hintEl.textContent = 'Tap a cube to review my thinking';

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

  // Legend
  var legend = document.createElement('div');
  legend.style.cssText = 'display:flex;justify-content:center;gap:14px;margin-top:10px;font-size:10px;font-weight:600;color:' + T.legend + ';';
  legend.innerHTML = '<span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:' + T.pendingBg + ';border:1.5px solid ' + T.pendingBorder + ';display:inline-block;"></span>Pending</span><span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:#D6EDDA;border:1.5px solid #5DA271;display:inline-block;"></span>Correct</span><span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:#FFF3CD;border:1.5px solid #F5A623;display:inline-block;"></span>Corrected</span>';

  graphView.appendChild(hintEl);
  graphView.appendChild(canvas);
  graphView.appendChild(legend);

  // 9. Review View
  var reviewView = document.createElement('div');
  reviewView.id = 'kc-review-' + currentId;
  reviewView.className = 'kc-review-panel';
  reviewView.style.cssText = 'display:none; padding:14px 14px 12px;';

  reviewView.innerHTML = [
    '<button id="kc-back-' + currentId + '" style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:' + T.hint + ';background:none;border:none;cursor:pointer;margin-bottom:12px;padding:0;">',
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="' + T.hint + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'Back to Map</button>',
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
    '<textarea id="kc-textarea-' + currentId + '" rows="3" placeholder="e.g. Weights are learnable parameters adjusted during training…" style="width:100%;font-size:12px;color:' + T.textareaText + ';background:' + T.textareaBg + ';border:2px solid ' + T.textareaBorder + ';border-radius:10px;padding:10px;resize:none;line-height:1.5;font-family:inherit;"></textarea>',
    '<button id="kc-save-' + currentId + '" style="margin-top:6px;width:100%;background:#925E78;color:white;font-size:12px;font-weight:700;border:none;border-radius:10px;padding:9px;cursor:pointer;box-shadow:0 3px 0 #5c3248;display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .15s,box-shadow .15s;">',
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Save &amp; Continue</button></div>'
  ].join('');

  // 10. Assemble
  widget.appendChild(topBar);
  widget.appendChild(graphView);
  widget.appendChild(reviewView);
  bubble.appendChild(widget);
  msgWrapper.appendChild(senderLabel);
  msgWrapper.appendChild(bubble);

  if (dom.chatWelcome && dom.chatWelcome.style.display !== 'none') {
    dom.chatWelcome.style.display = 'none';
  }
  dom.chatMessages.appendChild(msgWrapper);
  this.scrollToBottom();

  // 11. Interactivity
  var kcActiveId = null;

  function kcNodeBg(status) {
    if (status === 'reviewed') return { bg: '#D6EDDA', border: '#5DA271' };
    if (status === 'corrected') return { bg: '#FFF3CD', border: '#F5A623' };
    return { bg: T.pendingBg, border: T.pendingBorder };
  }

  function kcNodeIcon(status) {
    if (status === 'reviewed') return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><path d="M1 6l3 3 7-6" stroke="#5DA271" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (status === 'corrected') return '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><path d="M1 8.5l1.5-4 2.5 3.5 1.5-2.5 2.5 3" stroke="#F5A623" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
      btn.style.cssText = [
        'position:relative;z-index:1;',
        'background:' + c.bg + ';',
        'border:2px solid ' + c.border + ';',
        'box-shadow:3px 3px 0 ' + T.pendingShadow + ';',
        'border-radius:10px;',
        'padding:10px;',
        'width:100px;height:100px;',
        'text-align:center;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;',
        'flex-shrink:0;',
      ].join('');
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
      line.setAttribute('stroke', T.connector);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5 3');
      line.setAttribute('stroke-opacity', '0.45');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x2); dot.setAttribute('cy', y2);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', T.connector);
      dot.setAttribute('fill-opacity', '0.5');
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
    document.getElementById('kc-r-badge-' + currentId).textContent = '#' + node.id;
    document.getElementById('kc-r-title-' + currentId).textContent = node.title;
    document.getElementById('kc-r-thought-' + currentId).textContent = node.thought;

    var priorEl = document.getElementById('kc-prior-' + currentId);
    var priorTxt = document.getElementById('kc-prior-text-' + currentId);
    if (node.correction) {
      priorEl.style.display = '';
      priorTxt.textContent = node.correction;
    } else {
      priorEl.style.display = 'none';
    }
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
      setTimeout(function() {
        reviewView.style.opacity = '1';
        kcOpenReview(next.id);
      }, 80);
    } else {
      kcShowGraph();
    }
  }

  // Back button
  document.getElementById('kc-back-' + currentId).addEventListener('click', kcShowGraph);

  // Looks Good (visual only — no backend call)
  document.getElementById('kc-good-' + currentId).addEventListener('click', function() {
    var node = kcNodeById(kcActiveId);
    node.status = 'reviewed';
    kcAdvanceOrReturn();
  });

  // That's Wrong — reveal textarea
  document.getElementById('kc-wrong-' + currentId).addEventListener('click', function() {
    var area = document.getElementById('kc-correct-area-' + currentId);
    area.style.display = '';
    var ta = document.getElementById('kc-textarea-' + currentId);
    if (ta) ta.focus();
    requestAnimationFrame(function() { widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  });

  // Save & Continue — sends annotation via callback
  document.getElementById('kc-save-' + currentId).addEventListener('click', function() {
    var ta = document.getElementById('kc-textarea-' + currentId);
    var txt = ta ? ta.value.trim() : '';
    if (!txt) {
      if (ta) { ta.style.borderColor = '#EF4444'; setTimeout(function() { ta.style.borderColor = ''; }, 1200); }
      return;
    }
    var node = kcNodeById(kcActiveId);
    node.correction = txt;
    node.status = 'corrected';
    // Fire annotation callback to session.js → WebSocket
    if (onSubmitCallback) {
      onSubmitCallback(node.title, txt);
    }
    kcAdvanceOrReturn();
  });

  // Initial render
  kcRenderCubes();
}
