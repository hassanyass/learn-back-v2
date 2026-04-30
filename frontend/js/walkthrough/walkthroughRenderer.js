(function () {
  'use strict';

  var overlay = null;
  var currentTarget = null;

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'walkthrough-overlay';
    overlay.innerHTML = [
      '<div class="walkthrough-scrim"></div>',
      '<div class="walkthrough-spotlight" aria-hidden="true"></div>',
      '<section class="walkthrough-card" role="dialog" aria-modal="true" aria-live="polite">',
      '  <button type="button" class="walkthrough-close" data-walkthrough-action="skip" aria-label="Skip walkthrough">&times;</button>',
      '  <div class="walkthrough-card__inner">',
      '    <div class="walkthrough-card__media" data-walkthrough-media></div>',
      '    <div class="walkthrough-card__content">',
      '      <p class="walkthrough-card__eyebrow" data-walkthrough-progress></p>',
      '      <h2 class="walkthrough-card__title" data-walkthrough-title></h2>',
      '      <p class="walkthrough-card__body" data-walkthrough-description></p>',
      '      <p class="walkthrough-card__required" data-walkthrough-required hidden></p>',
      '    </div>',
      '  </div>',
      '  <div class="walkthrough-dots" data-walkthrough-dots></div>',
      '  <div class="walkthrough-actions">',
      '    <button type="button" class="btn btn--neutral" data-walkthrough-action="prev">Previous</button>',
      '    <button type="button" class="btn btn--neutral" data-walkthrough-action="skip">Skip</button>',
      '    <button type="button" class="btn btn--primary" data-walkthrough-action="next">Next</button>',
      '  </div>',
      '</section>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
  }

  function isLargePanel(rect) {
    return rect.width > window.innerWidth * 0.6
      || rect.height > window.innerHeight * 0.6;
  }

  function positionSpotlight(target, step) {
    var spotlight = overlay.querySelector('.walkthrough-spotlight');
    if (!target || step.action === 'modal') {
      spotlight.style.display = 'none';
      return;
    }

    var rect = target.getBoundingClientRect();

    if (step.panelEdge === true && isLargePanel(rect)) {
      spotlight.style.display = 'none';
      return;
    }

    var padding = paddingFor(step.spotlightPadding, 8);
    spotlight.style.display = 'block';
    spotlight.style.top = Math.max(8, rect.top - padding.top) + 'px';
    spotlight.style.left = Math.max(8, rect.left - padding.left) + 'px';
    spotlight.style.width = Math.max(24, rect.width + padding.left + padding.right) + 'px';
    spotlight.style.height = Math.max(24, rect.height + padding.top + padding.bottom) + 'px';
  }

  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function unique(values) {
    return values.filter(function (value, index) {
      return value && values.indexOf(value) === index;
    });
  }

  function paddingFor(value, fallback) {
    if (typeof value === 'number') {
      return { top: value, right: value, bottom: value, left: value };
    }
    if (value && typeof value === 'object') {
      return {
        top: value.top != null ? value.top : (value.y != null ? value.y : fallback),
        right: value.right != null ? value.right : (value.x != null ? value.x : fallback),
        bottom: value.bottom != null ? value.bottom : (value.y != null ? value.y : fallback),
        left: value.left != null ? value.left : (value.x != null ? value.x : fallback)
      };
    }
    return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  }

  function expandRect(rect, padding) {
    return {
      left: Math.max(0, rect.left - padding.left),
      top: Math.max(0, rect.top - padding.top),
      right: Math.min(window.innerWidth, rect.right + padding.right),
      bottom: Math.min(window.innerHeight, rect.bottom + padding.bottom)
    };
  }

  function rectFor(left, top, width, height) {
    return {
      left: left,
      top: top,
      right: left + width,
      bottom: top + height
    };
  }

  function placementFor(name, rect, width, height, gap) {
    if (name === 'right') {
      return {
        left: rect.right + gap,
        top: rect.top + (rect.height - height) / 2
      };
    }
    if (name === 'left') {
      return {
        left: rect.left - width - gap,
        top: rect.top + (rect.height - height) / 2
      };
    }
    if (name === 'top') {
      return {
        left: rect.left + (rect.width - width) / 2,
        top: rect.top - height - gap
      };
    }
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.bottom + gap
    };
  }

  function largestFreePlacements(rect) {
    var spaces = [
      { name: 'right', size: window.innerWidth - rect.right },
      { name: 'left', size: rect.left },
      { name: 'bottom', size: window.innerHeight - rect.bottom },
      { name: 'top', size: rect.top }
    ];
    spaces.sort(function (a, b) { return b.size - a.size; });
    return spaces.map(function (space) { return space.name; });
  }

  function placementOrder(step, rect) {
    return unique(
      [step.placement || 'bottom']
        .concat(step.placementFallbacks || [])
        .concat(largestFreePlacements(rect))
        .concat(['right', 'left', 'bottom', 'top'])
    );
  }

  function applyDockPlacement(rect, width, height, margin, gap) {
    var dockRight = rect.left + rect.width / 2 < window.innerWidth / 2;
    var left = dockRight
      ? window.innerWidth - width - margin
      : margin;
    var top = clamp((window.innerHeight - height) / 2, margin, window.innerHeight - height - margin);
    var dockRect = rectFor(left, top, width, height);

    if (overlaps(dockRect, expandRect(rect, paddingFor(28, 28)))) {
      top = rect.top + rect.height / 2 < window.innerHeight / 2
        ? clamp(rect.bottom + gap, margin, window.innerHeight - height - margin)
        : clamp(rect.top - height - gap, margin, window.innerHeight - height - margin);
    }

    return { left: left, top: top };
  }

  function positionCard(target, step) {
    var card = overlay.querySelector('.walkthrough-card');
    card.className = 'walkthrough-card walkthrough-card--' + (step.placement || 'center')
      + (step.layout === 'media-side' ? ' walkthrough-card--media-side' : '')
      + (step.imageSize === 'large' ? ' walkthrough-card--image-large' : '')
      + (step.cardSize === 'compact' ? ' walkthrough-card--compact' : '')
      + (step.cardSize === 'pop' ? ' walkthrough-card--pop' : '');

    if (!target || step.placement === 'center' || step.action === 'modal' || window.innerWidth <= 768) {
      card.style.top = '';
      card.style.left = '';
      card.style.right = '';
      card.style.bottom = '';
      return;
    }

    var rect = target.getBoundingClientRect();
    var margin = 24;
    var gap = step.placementGap || 28;
    var measured = card.getBoundingClientRect();
    var width = Math.min(measured.width || card.offsetWidth || 400, window.innerWidth - margin * 2);
    var height = Math.min(measured.height || card.offsetHeight || 320, window.innerHeight - margin * 2);

    if (step.panelEdge === true && isLargePanel(rect)) {
      var anchored = anchorToPanelEdge(rect, width, height, margin, gap, step);
      card.style.left = anchored.left + 'px';
      card.style.top = anchored.top + 'px';
      card.style.right = 'auto';
      card.style.bottom = 'auto';
      return;
    }

    var safeRect = expandRect(rect, paddingFor(step.avoidPadding, 32));
    var left = margin;
    var top = margin;
    var chosen = null;
    var candidates = placementOrder(step, rect);

    candidates.some(function (placement) {
      var raw = placementFor(placement, rect, width, height, gap);
      var nextLeft = clamp(raw.left, margin, window.innerWidth - width - margin);
      var nextTop = clamp(raw.top, margin, window.innerHeight - height - margin);
      var nextRect = rectFor(nextLeft, nextTop, width, height);
      if (!overlaps(nextRect, safeRect)) {
        chosen = { left: nextLeft, top: nextTop };
        return true;
      }
      return false;
    });

    if (chosen) {
      left = chosen.left;
      top = chosen.top;
    } else {
      chosen = applyDockPlacement(rect, width, height, margin, gap);
      left = chosen.left;
      top = chosen.top;
    }

    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.right = 'auto';
    card.style.bottom = 'auto';
  }

  function anchorToPanelEdge(rect, width, height, margin, gap, step) {
    var leftSpace = rect.left;
    var rightSpace = window.innerWidth - rect.right;
    var preferLeft = (step.placement === 'left') || (rightSpace < width + gap + margin && leftSpace > rightSpace);
    var left;
    if (preferLeft && leftSpace >= width + gap + margin) {
      left = clamp(rect.left - width - gap, margin, window.innerWidth - width - margin);
    } else if (rightSpace >= width + gap + margin) {
      left = clamp(rect.right + gap, margin, window.innerWidth - width - margin);
    } else {
      left = leftSpace > rightSpace ? margin : window.innerWidth - width - margin;
    }
    var top = clamp(rect.top + (rect.height - height) / 2, margin, window.innerHeight - height - margin);
    return { left: left, top: top };
  }

  function positionElements(target, step) {
    if (!overlay) return;
    positionSpotlight(target, step);
    positionCard(target, step);
  }

  function schedulePosition(target, step) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        positionElements(target, step);
      });
    });
  }

  function renderDots(total, index) {
    var dots = overlay.querySelector('[data-walkthrough-dots]');
    var html = [];
    var maxDots = Math.min(total, 12);
    for (var i = 0; i < maxDots; i += 1) {
      html.push('<span class="walkthrough-dot' + (i === Math.min(index, maxDots - 1) ? ' is-active' : '') + '"></span>');
    }
    dots.innerHTML = html.join('');
  }

  function render(step, state, options) {
    var opts = options || {};
    var target = step.target ? document.querySelector(step.target) : null;
    currentTarget = target;
    ensureOverlay();

    var shouldBlurBackdrop = step.blurBackdrop === true || (step.action === 'modal' && step.segment === 'dashboard');
    overlay.classList.toggle('walkthrough-overlay--blur', shouldBlurBackdrop);
    overlay.classList.toggle('walkthrough-overlay--targeted', !shouldBlurBackdrop);
    document.documentElement.classList.add('walkthrough-active');
    if (target && step.action !== 'modal') {
      var rect = target.getBoundingClientRect();
      var isVisible = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );

      if (!isVisible) {
        target.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      }
      target.classList.add('walkthrough-target', 'walkthrough-target--' + (step.action || 'highlight'));
    }

    var card = overlay.querySelector('.walkthrough-card');
    card.classList.toggle('walkthrough-card--media-side', step.layout === 'media-side');
    card.classList.toggle('walkthrough-card--image-large', step.imageSize === 'large');
    card.classList.toggle('walkthrough-card--compact', step.cardSize === 'compact');
    card.classList.toggle('walkthrough-card--pop', step.cardSize === 'pop');

    var media = overlay.querySelector('[data-walkthrough-media]');
    media.innerHTML = step.image
      ? '<img src="' + escapeHtml(step.image) + '" alt="" onerror="this.closest(\\\'.walkthrough-card__media\\\').hidden=true;">'
      : '';
    media.hidden = !step.image;
    var image = media.querySelector('img');
    if (image) {
      image.addEventListener('load', function () {
        schedulePosition(target, step);
      }, { once: true });
    }

    overlay.querySelector('[data-walkthrough-progress]').textContent =
      'Step ' + (opts.index + 1) + ' of ' + opts.total;
    overlay.querySelector('[data-walkthrough-title]').textContent = step.title || '';
    overlay.querySelector('[data-walkthrough-description]').textContent = step.description || '';
    var required = overlay.querySelector('[data-walkthrough-required]');
    required.hidden = !step.requireAction;
    required.textContent = step.requireAction
      ? (step.actionLabel || 'Click the highlighted area to continue.')
      : '';
    var prevButton = overlay.querySelector('[data-walkthrough-action="prev"]');
    prevButton.disabled = opts.isFirstInSegment === true;
    prevButton.hidden = step.dismissOnNext === true;
    overlay.querySelector('[data-walkthrough-action="skip"]').hidden = step.mandatory === true;
    var nextButton = overlay.querySelector('[data-walkthrough-action="next"]');
    nextButton.hidden = step.requireAction === true && step.allowNext !== true;
    if (step.endSegment === true) {
      nextButton.textContent = 'Finish';
    } else if (step.dismissOnNext === true) {
      nextButton.textContent = 'Got it';
    } else if (opts.isLastInSegment === true) {
      nextButton.textContent = 'Finish';
    } else {
      nextButton.textContent = 'Next';
    }

    renderDots(opts.total, opts.index);
    schedulePosition(target, step);
  }

  function destroy() {
    if (currentTarget) {
      currentTarget.classList.remove(
        'walkthrough-target',
        'walkthrough-target--highlight',
        'walkthrough-target--focus',
        'walkthrough-target--pulse'
      );
      currentTarget = null;
    }
    document.documentElement.classList.remove('walkthrough-active');
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function refresh(step) {
    if (!overlay) return;
    positionSpotlight(currentTarget, step || {});
    positionCard(currentTarget, step || {});
  }

  function isRendered() {
    return overlay !== null;
  }

  window.LearnBackWalkthroughRenderer = {
    render: render,
    destroy: destroy,
    refresh: refresh,
    isRendered: isRendered
  };
})();
