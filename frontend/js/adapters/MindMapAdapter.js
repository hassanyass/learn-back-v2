/**
 * MindMapAdapter.js
 * 
 * Adapts various Mind Map data formats into a strict, unified Canonical Domain Model.
 * This guarantees the UIRenderer remains perfectly format-agnostic.
 * 
 * --- CANONICAL MIND MAP NODE FORMAT ---
 * {
 *   id: number,          // Unique integer identifier for sequence rendering
 *   label: string,       // The high-level concept / point title
 *   value: string,       // Kido's detailed understanding / generated summary
 *   status: string,      // UI Interaction State: 'pending', 'reviewed', or 'corrected'
 *   correction: string   // The user's revised input (empty if uncorrected)
 * }
 */

export const MindMapAdapter = {

  /**
   * Normalizes any supported mind map payload into the Canonical array format.
   * Handles:
   * 1. New Target WS Payload format: { nodes: [{ point, kido_sentence }] }
   * 2. Legacy KC format (raw arrays): [{ title, thought }]
   * 3. Transient UI/legacy fallbacks: [{ label, summary }]
   * 
   * @param {Object|Array} input - The raw Mind Map data to normalize
   * @returns {Array<Object>} Strictly formatted array of canonical MindMapNodes
   */
  normalize: function (input) {
    var rawNodes = [];

    // 1. Detect direct array input (Legacy KC logic bypass)
    if (Array.isArray(input)) {
      rawNodes = input;
    }
    // 2. Detect standard object payload format
    else if (input && Array.isArray(input.nodes)) {
      rawNodes = input.nodes;
    }

    // Safety fallback
    if (!rawNodes || rawNodes.length === 0) {
      return [];
    }

    // Strict normalization map
    return rawNodes.map(function (node, index) {
      // Handle null/undefined nodes safely
      var safeNode = node || {};

      return {
        id: safeNode.id || (index + 1),

        // Label Resolution: prefers new WS `point`, falls back through legacy chains
        label: safeNode.point || safeNode.title || safeNode.label || 'Untitled Concept',

        // Value Resolution: prefers new WS `kido_sentence`, falls back through legacy chains
        value: safeNode.kido_sentence || safeNode.thought || safeNode.summary || safeNode.value || 'Kido has no thoughts here.',

        // Interaction State Resolution
        status: safeNode.status || 'pending',
        correction: safeNode.correction || ''
      };
    });
  }
};
