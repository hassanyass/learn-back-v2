/**
 * WidgetFactory — Central factory for building interactive widgets.
 *
 * Renders a widget into a target container based on a backend JSON payload.
 * Each widget_type ('sequence', 'swipe', 'math') currently injects a
 * placeholder stub. Real rendering logic will replace the stubs once
 * the backend /api/widgets routes are fully live.
 */

const WidgetFactory = {

  /**
   * @param {string}   containerId       - DOM id of the element to render into.
   * @param {Object}   widgetData        - Backend payload (must include widget_type, widget_id).
   * @param {Function} onSuccessCallback - Called with (isCorrect: boolean, attempts: number).
   */
  renderWidget(containerId, widgetData, onSuccessCallback) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[WidgetFactory] Container #${containerId} not found in DOM.`);
      return;
    }

    const type = widgetData.widget_type || 'unknown';
    const id   = widgetData.widget_id   || 'w_unknown';

    console.log(`[WidgetFactory] Rendering "${type}" widget (${id}) into #${containerId}`);

    switch (type) {

      case 'sequence':
        container.innerHTML = `
          <div class="widget-placeholder" data-widget-id="${id}" style="
            padding: 24px; border: 2px dashed #925E78; border-radius: 16px;
            text-align: center; color: #334155; background: #FDF8FA;
          ">
            <strong>🧩 Sequence Builder</strong><br>
            <span style="font-size: 13px; color: #64748B;">Widget ID: ${id}</span>
          </div>`;
        break;

      case 'swipe':
        container.innerHTML = `
          <div class="widget-placeholder" data-widget-id="${id}" style="
            padding: 24px; border: 2px dashed #4B6A88; border-radius: 16px;
            text-align: center; color: #334155; background: #F0F4F8;
          ">
            <strong>👆 Swipe Sorter</strong><br>
            <span style="font-size: 13px; color: #64748B;">Widget ID: ${id}</span>
          </div>`;
        break;

      case 'math':
        container.innerHTML = `
          <div class="widget-placeholder" data-widget-id="${id}" style="
            padding: 24px; border: 2px dashed #F6AE2D; border-radius: 16px;
            text-align: center; color: #334155; background: #FFFBF0;
          ">
            <strong>🔢 Math Auditor</strong><br>
            <span style="font-size: 13px; color: #64748B;">Widget ID: ${id}</span>
          </div>`;
        break;

      default:
        container.innerHTML = `
          <div class="widget-placeholder" style="
            padding: 24px; border: 2px dashed #CBD5E1; border-radius: 16px;
            text-align: center; color: #94A3B8;
          ">
            ⚠️ Unknown widget type: <code>${type}</code>
          </div>`;
        console.warn(`[WidgetFactory] Unknown widget_type "${type}"`);
        return; // No callback for unknown types
    }

    // Simulate user completion after 2 seconds (placeholder behavior)
    setTimeout(() => {
      console.log(`[WidgetFactory] Widget "${id}" completed (simulated).`);
      if (typeof onSuccessCallback === 'function') {
        onSuccessCallback(true, 1);
      }
    }, 2000);
  }
};

// Bind to window for legacy script access (session.html uses non-module scripts)
window.WidgetFactory = WidgetFactory;

export default WidgetFactory;
