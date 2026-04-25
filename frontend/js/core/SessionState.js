/**
 * SessionState — Client-side state mirror of the backend session_state JSONB.
 *
 * Populated from REST bootstrap (GET /session/{id}) and updated in real-time
 * from WebSocket kido_response payloads.
 *
 * Schema follows 04_session_orchestrator.md exactly.
 */

export class SessionState {
  /**
   * @param {Object} bootstrap - Normalized response from LearnBackAPI.fetchSession()
   */
  constructor(bootstrap) {
    this.sessionId = bootstrap.sessionId || null;
    this.sessionTitle = bootstrap.sessionTitle || 'Untitled Session';
    this.status = bootstrap.status || 'IN_PROGRESS';
    this.documentId = bootstrap.documentId || null;
    this.pdfUrl = bootstrap.pdfUrl || null;
    this.fileType = bootstrap.fileType || null;
    this.hasPreview = bootstrap.hasPreview === true;
    this.deckStatus = bootstrap.deckStatus || null;
    this.startedAt = bootstrap.startedAt || null;
    this.completedAt = bootstrap.completedAt || null;

    // ── Session state (nested topics/points from backend) ──
    // The REST bootstrap may include full session_state or flattened fields.
    // We normalize both paths.
    var rawState = bootstrap.sessionState || bootstrap.session_state || {};
    this.topics = Array.isArray(rawState.topics) ? rawState.topics : [];
    this.currentTopicIndex = rawState.current_topic_index || bootstrap.topicIndex || 0;
    this.currentPointIndex = rawState.current_point_index || 0;
    this.pointAttempts = rawState.point_attempts || 0;
    this.skippedIndices = rawState.skipped_indices || [];

    // If topics came as flat string array from REST (legacy), convert
    if (this.topics.length === 0 && Array.isArray(bootstrap.topics)) {
      this.topics = bootstrap.topics.map(function (t) {
        var title = typeof t === 'string' ? t : (t.topic_title || t.title || t.name || 'Untitled');
        return {
          topic_title: title,
          points: Array.isArray(t.points) ? t.points : []
        };
      });
    }

    // ── Mind map checkpoint state ──
    this.isMindMapPending = false;
    this.mindMapData = [];

    // ── Session completion flag ──
    this.isSessionComplete = this.status === 'COMPLETED' || this.status === 'completed';

    // ── Knowledge stream (client-side only, for KWL panel) ──
    this.knowledge = [];
    this.misconceptions = [];
    this.messageCount = 0;
  }

  /**
   * Merge incoming WS response data into local state.
   * @param {Object} data - The `data` field from a WS kido_response message
   */
  updateFromWsResponse(data) {
    if (!data) return;

    // Update session_state if present
    var ss = data.session_state;
    if (ss) {
      if (Array.isArray(ss.topics)) this.topics = ss.topics;
      if (typeof ss.current_topic_index === 'number') this.currentTopicIndex = ss.current_topic_index;
      if (typeof ss.current_point_index === 'number') this.currentPointIndex = ss.current_point_index;
      if (typeof ss.point_attempts === 'number') this.pointAttempts = ss.point_attempts;
      if (Array.isArray(ss.skipped_indices)) this.skippedIndices = ss.skipped_indices;
    }

    // Mind map checkpoint
    if (data.topic_checkpoint) {
      this.isMindMapPending = true;
      this.mindMapData = Array.isArray(data.mind_map_data) ? data.mind_map_data : [];
    }
  }

  /**
   * Mark session as complete (called on WS session_complete or close code 1000).
   */
  markComplete() {
    this.isSessionComplete = true;
    this.status = 'COMPLETED';
  }

  /** Clear mind map pending state after submission. */
  clearMindMap() {
    this.isMindMapPending = false;
    this.mindMapData = [];
  }

  /** Get current topic title string. */
  getCurrentTopicTitle() {
    var topic = this.topics[this.currentTopicIndex];
    return topic ? (topic.topic_title || 'Unknown Topic') : 'No Topic';
  }

  /** Get current point title string. */
  getCurrentPointTitle() {
    var topic = this.topics[this.currentTopicIndex];
    if (!topic || !Array.isArray(topic.points)) return '';
    var point = topic.points[this.currentPointIndex];
    return point ? (point.point_title || '') : '';
  }

  /** Get flat array of topic title strings (for roadmap rendering). */
  getTopicTitles() {
    return this.topics.map(function (t) {
      return t.topic_title || 'Untitled';
    });
  }

  /**
   * Compute aggregated BKT as a 0-100 percentage.
   * overall = mean of all per-point bkt_scores across all topics.
   */
  getAggregatedBkt() {
    var totalScore = 0;
    var totalPoints = 0;

    this.topics.forEach(function (topic) {
      if (!Array.isArray(topic.points)) return;
      topic.points.forEach(function (point) {
        if (point.status === 'completed' || point.status === 'in_progress') {
          totalScore += (typeof point.bkt_score === 'number' ? point.bkt_score : 0.3);
          totalPoints++;
        }
      });
    });

    if (totalPoints === 0) return 0;
    return Math.round((totalScore / totalPoints) * 100);
  }

  /** Get BKT score for a specific point. */
  getPointBkt(topicIndex, pointIndex) {
    var topic = this.topics[topicIndex];
    if (!topic || !Array.isArray(topic.points)) return 0;
    var point = topic.points[pointIndex];
    return point ? Math.round((point.bkt_score || 0.3) * 100) : 0;
  }
}
