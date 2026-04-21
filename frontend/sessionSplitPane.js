(function () {
  'use strict';

  var chatPanel = document.getElementById('chat-panel');
  var chatContainer = document.getElementById('chat-container');
  var slidePane = document.getElementById('slide-deck-view');
  var dragHandle = document.getElementById('center-resizer');
  var rightPanel = document.getElementById('right-panel');
  var btnOpenSlides = document.getElementById('btn-open-slides');
  var btnCloseSlides = document.getElementById('btn-close-slides');
  var btnExpandLeft = document.getElementById('btn-expand-left');

  if (!chatPanel || !chatContainer || !slidePane || !dragHandle) {
    return;
  }

  var dragState = {
    active: false
  };

  var resizeShield = null;

  function getCssNumber(name, fallback) {
    var value = parseFloat(window.getComputedStyle(chatPanel).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function getGap() {
    return getCssNumber('--session-split-gap', 20);
  }

  function getMetrics() {
    var gap = getGap();
    var totalWidth = Math.max(0, chatPanel.getBoundingClientRect().width - gap);
    var minChat = Math.min(getCssNumber('--session-chat-min-width', 200), Math.max(56, totalWidth - 56));
    var minSlides = Math.min(getCssNumber('--session-slide-min-width', 220), Math.max(56, totalWidth - 56));
    var maxChat = totalWidth - minSlides;

    if (maxChat < minChat) {
      minChat = Math.max(56, totalWidth * 0.35);
      minSlides = Math.max(56, totalWidth - minChat);
      maxChat = totalWidth - minSlides;
    }

    return {
      gap: gap,
      totalWidth: totalWidth,
      minChat: minChat,
      minSlides: minSlides,
      maxChat: Math.max(minChat, maxChat)
    };
  }

  function setSplitColumns(chatWidth) {
    var metrics = getMetrics();
    if (!metrics.totalWidth) return;

    var clampedChat = Math.min(metrics.maxChat, Math.max(metrics.minChat, chatWidth));
    chatPanel.style.gridTemplateColumns =
      Math.round(clampedChat) + 'px ' +
      Math.round(metrics.gap) + 'px ' +
      'minmax(' + Math.round(metrics.minSlides) + 'px, 1fr)';
  }

  function setSlidePointerInteractivity(enabled) {
    var pdfContainer = slidePane.querySelector('#pdf-viewer-container');
    var iframes = slidePane.querySelectorAll('iframe');

    if (pdfContainer) {
      pdfContainer.style.pointerEvents = enabled ? '' : 'none';
    }

    iframes.forEach(function (iframe) {
      iframe.style.pointerEvents = enabled ? 'auto' : 'none';
    });
  }

  function ensureResizeShield() {
    if (resizeShield) return resizeShield;

    resizeShield = document.createElement('div');
    resizeShield.id = 'session-resize-shield';
    resizeShield.style.position = 'fixed';
    resizeShield.style.inset = '0';
    resizeShield.style.zIndex = '99999';
    resizeShield.style.display = 'none';
    resizeShield.style.cursor = 'col-resize';
    resizeShield.style.background = 'transparent';
    resizeShield.style.touchAction = 'none';

    resizeShield.addEventListener('mousemove', function (event) {
      if (!dragState.active) return;
      updateDrag(event.clientX);
    });

    resizeShield.addEventListener('mouseup', stopDrag);
    resizeShield.addEventListener('touchmove', function (event) {
      if (!dragState.active || !event.touches.length) return;
      event.preventDefault();
      updateDrag(event.touches[0].clientX);
    }, { passive: false });
    resizeShield.addEventListener('touchend', stopDrag);
    resizeShield.addEventListener('touchcancel', stopDrag);

    document.body.appendChild(resizeShield);
    return resizeShield;
  }

  function showResizeShield() {
    ensureResizeShield().style.display = 'block';
  }

  function hideResizeShield() {
    if (resizeShield) {
      resizeShield.style.display = 'none';
    }
  }

  function isOpen() {
    return chatPanel.classList.contains('slides-open');
  }

  function openSlidesPane() {
    var pdfUrl = localStorage.getItem('learnback_pdf_url') || 'sample.pdf';

    chatPanel.classList.add('slides-open');
    slidePane.style.display = 'flex';
    slidePane.removeAttribute('hidden');
    dragHandle.style.display = 'block';
    dragHandle.removeAttribute('hidden');

    if (rightPanel) {
      rightPanel.style.display = 'none';
    }

    requestAnimationFrame(function () {
      var metrics = getMetrics();
      setSplitColumns(metrics.totalWidth * 0.48);
    });

    if (window.LearnBackPDF && typeof window.LearnBackPDF.open === 'function') {
      window.LearnBackPDF.open(pdfUrl);
    }
  }

  function closeSlidesPane() {
    stopDrag();
    chatPanel.classList.remove('slides-open');
    chatPanel.classList.remove('is-resizing');
    chatPanel.style.removeProperty('grid-template-columns');
    slidePane.style.display = 'none';
    slidePane.setAttribute('hidden', '');
    dragHandle.style.display = 'none';
    dragHandle.setAttribute('hidden', '');

    if (rightPanel) {
      rightPanel.style.display = '';
    }

    setSlidePointerInteractivity(true);

    if (window.LearnBackPDF && typeof window.LearnBackPDF.close === 'function') {
      window.LearnBackPDF.close();
    }
  }

  function updateDrag(clientX) {
    var rect = chatPanel.getBoundingClientRect();
    setSplitColumns(clientX - rect.left - (getGap() / 2));
  }

  function startDrag(clientX) {
    if (!isOpen()) return;
    dragState.active = true;
    chatPanel.classList.add('is-resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    showResizeShield();
    setSlidePointerInteractivity(false);
    updateDrag(clientX);
  }

  function stopDrag() {
    if (!dragState.active) return;
    dragState.active = false;
    chatPanel.classList.remove('is-resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    hideResizeShield();
    setSlidePointerInteractivity(true);
  }

  function bindExclusiveClick(element, handler) {
    if (!element) return;
    element.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handler();
    }, true);
  }

  bindExclusiveClick(btnOpenSlides, openSlidesPane);
  bindExclusiveClick(btnCloseSlides, closeSlidesPane);

  if (btnExpandLeft) {
    btnExpandLeft.addEventListener('click', function (event) {
      if (!isOpen()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSlidesPane();
    }, true);
  }

  dragHandle.addEventListener('mousedown', function (event) {
    if (event.button !== 0 || !isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startDrag(event.clientX);
  }, true);

  dragHandle.addEventListener('touchstart', function (event) {
    if (!event.touches.length || !isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startDrag(event.touches[0].clientX);
  }, { passive: false, capture: true });

  window.addEventListener('mousemove', function (event) {
    if (!dragState.active) return;
    updateDrag(event.clientX);
  });

  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', stopDrag);
  window.addEventListener('resize', function () {
    if (!isOpen()) return;
    setSplitColumns(chatContainer.getBoundingClientRect().width);
  });

  if (window.Session) {
    window.Session.showSlides = openSlidesPane;
    window.Session.closeSlides = closeSlidesPane;
  }

  window.SessionSplitPane = {
    open: openSlidesPane,
    close: closeSlidesPane,
    isOpen: isOpen
  };
})();
