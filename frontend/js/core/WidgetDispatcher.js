/**
 * WidgetDispatcher — Listens for widget requests and orchestrates the
 * fetch → render → submit lifecycle.
 *
 * Uses DOM CustomEvents as a lightweight EventBus since no dedicated
 * EventBus module exists in the codebase yet.
 *
 * Trigger a widget from anywhere in the app with:
 *   window.dispatchEvent(new CustomEvent('WIDGET_REQUESTED', {
 *     detail: { widgetType: 'sequence', sessionId: '...', topicId: '...' }
 *   }));
 */

import WidgetFactory from './WidgetFactory.js';

// Counter for generating unique container IDs per dispatch
let _dispatchCount = 0;

const WidgetDispatcher = {

  /**
   * Call once on page load to start listening for WIDGET_REQUESTED events.
   */
  init() {
    window.addEventListener('WIDGET_REQUESTED', (e) => {
      const detail = e.detail || {};
      console.log('[WidgetDispatcher] WIDGET_REQUESTED received:', detail);
      this._handleRequest(detail);
    });

    console.log('[WidgetDispatcher] Initialized — listening for WIDGET_REQUESTED events.');
  },

  /**
   * Internal handler: fetch payload → inject container → render → submit.
   */
  async _handleRequest(detail) {
    const { widgetType, sessionId, topicId } = detail;

    if (!widgetType) {
      console.error('[WidgetDispatcher] Missing widgetType in event detail.');
      return;
    }

    // ── 1. Fetch widget payload from backend ────────────────────────────
    const api = window.LearnBackAPI;
    let payload = null;

    if (api && typeof api.request === 'function') {
      try {
        payload = await api.request(`/api/widgets/demo/${encodeURIComponent(widgetType)}`);
      } catch (err) {
        console.warn('[WidgetDispatcher] Backend fetch failed, using local stub:', err.message);
      }
    } else {
      console.warn('[WidgetDispatcher] LearnBackAPI not available — using local stub.');
    }

    // Fallback stub payload when the backend route is not yet live
    if (!payload || payload._error) {
      payload = {
        widget_type: widgetType,
        widget_id: `demo_${widgetType}_${Date.now()}`,
        data: {}
      };
    }

    // ── 2. Create a container div inside the chat messages area ─────────
    _dispatchCount += 1;
    const containerId = `widget-dispatch-${_dispatchCount}`;
    const chatMessages = document.getElementById('chat-messages');

    if (!chatMessages) {
      console.error('[WidgetDispatcher] #chat-messages container not found in DOM.');
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = containerId;
    wrapper.className = 'kido-message-bubble';
    wrapper.style.marginTop = '16px';
    chatMessages.appendChild(wrapper);

    // Auto-scroll to the new widget
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // ── 3. Render via WidgetFactory ─────────────────────────────────────
    WidgetFactory.renderWidget(containerId, payload, (isCorrect, attempts) => {

      console.log(`[WidgetDispatcher] Widget completed — correct: ${isCorrect}, attempts: ${attempts}`);

      // ── 4. Submit result back to the backend ────────────────────────
      if (api && typeof api.request === 'function') {
        const body = JSON.stringify({
          session_id: sessionId || localStorage.getItem('learnback_session_id') || null,
          widget_id: payload.widget_id,
          topic_id: topicId || null,
          is_correct: !!isCorrect,
          attempts: attempts || 1
        });

        api.request('/api/widgets/submit', {
          method: 'POST',
          body: body
        }).then((res) => {
          console.log('[WidgetDispatcher] Submit acknowledged:', res);
        }).catch((err) => {
          console.warn('[WidgetDispatcher] Submit failed (non-blocking):', err.message);
        });
      }

      // Notify the rest of the app
      window.dispatchEvent(new CustomEvent('WIDGET_COMPLETED', {
        detail: { widgetId: payload.widget_id, isCorrect, attempts }
      }));
    });
  }
};

// Bind to window for legacy access
window.WidgetDispatcher = WidgetDispatcher;

export default WidgetDispatcher;
