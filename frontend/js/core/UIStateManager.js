/**
 * UIStateManager.js — Lightweight DOM visibility controller.
 * 
 * Purpose: Prevent UI conflicts between right panel views.
 * Ensures only ONE of the following is active at a time:
 * - status
 * - kwl
 * - misconceptions
 * 
 * No routing framework, no architecture change, ONLY DOM visibility control.
 */

export class UIStateManager {
  constructor(domRefs) {
    this.dom = domRefs;
  }

  /**
   * Set the active right panel view.
   * @param {string} view - 'status', 'kwl', or 'misconceptions'
   */
  setRightPanelView(view) {
    var statusView = document.getElementById('status-view');
    var kwlView = document.getElementById('kwl-view');
    var misconceptionsView = document.getElementById('misconceptions-view');

    if (!statusView || !kwlView || !misconceptionsView) return;

    // Reset all
    statusView.classList.remove('active');
    kwlView.classList.remove('active');
    misconceptionsView.classList.remove('active');

    // Activate selected
    if (view === 'kwl') {
      kwlView.classList.add('active');
    } else if (view === 'misconceptions') {
      misconceptionsView.classList.add('active');
    } else {
      // Default fallback
      statusView.classList.add('active');
    }
  }
}
