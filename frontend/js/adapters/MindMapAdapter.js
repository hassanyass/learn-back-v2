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
    var eventId = null;

    // 1. Detect graph structure (New Projection Mode)
    if (input && input.graph && Array.isArray(input.graph.nodes)) {
      rawNodes = input.graph.nodes;
      eventId = input.graph.event_id || null;
    }
    // 2. Detect direct array input (Legacy KC logic bypass)
    else if (Array.isArray(input)) {
      rawNodes = input;
    }
    // 3. Detect standard object payload format
    else if (input && Array.isArray(input.nodes)) {
      rawNodes = input.nodes;
      eventId = input.event_id || null;
    }

    // Safety fallback
    if (!rawNodes || rawNodes.length === 0) {
      var emptyNodes = [];
      emptyNodes.eventId = eventId;
      return emptyNodes;
    }

    // Attach event_id to the array object itself so UIRenderer can read it
    var normalizedNodes = rawNodes.map(function (node, index) {
      // Handle null/undefined nodes safely
      var safeNode = node || {};

      return {
        id: safeNode.node_id || safeNode.id || (index + 1),

        // Label Resolution: prefers new graph `point`
        label: safeNode.point || safeNode.label || safeNode.title || 'Untitled Concept',

        // Value Resolution: prefers new graph `kido_sentence`
        value: safeNode.kido_sentence || safeNode.kido_understanding || safeNode.thought || safeNode.summary || 'Kido has no thoughts here.',

        // Interaction State Resolution
        status: safeNode.status || 'unseen'
      };
    });
    
    // Mount the immutable backend identity string
    normalizedNodes.eventId = eventId;
    return normalizedNodes;
  }
};
