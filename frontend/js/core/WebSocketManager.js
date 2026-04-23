/**
 * WebSocketManager — Manages the WebSocket connection lifecycle for a session.
 *
 * Handles connect, disconnect, message routing, and automatic reconnection
 * with exponential backoff.
 *
 * WS endpoint: ws://127.0.0.1:8002/ws/session/{session_id}
 */

export class WebSocketManager {
  /**
   * @param {string|number} sessionId
   */
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.ws = null;
    this.isConnected = false;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 3;
    this._reconnectTimer = null;
    this._intentionalClose = false;

    // ── Callback hooks (set by session.js orchestrator) ──
    this.onKidoResponse = null;     // (data) => void
    this.onSessionComplete = null;  // (data) => void
    this.onMindMap = null;          // (data) => void
    this.onSystemHint = null;       // (data) => void
    this.onError = null;            // (detail) => void
    this.onConnectionChange = null; // (state: 'connecting'|'connected'|'disconnected'|'reconnecting') => void
  }

  /** Build the WS URL based on current hostname. */
  _buildUrl() {
    var host = window.location.hostname;
    var wsHost = (host === '127.0.0.1' || host === 'localhost')
      ? '127.0.0.1:8002'
      : window.location.host;
    var protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return protocol + '://' + wsHost + '/ws/session/' + this.sessionId;
  }

  /** Open the WebSocket connection. */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.warn('[WS] Already connected or connecting.');
      return;
    }

    this._intentionalClose = false;
    var url = this._buildUrl();
    console.log('[WS] Connecting to:', url);
    this._emitConnectionChange('connecting');

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this._emitConnectionChange('disconnected');
      return;
    }

    var self = this;

    this.ws.onopen = function () {
      console.log('[WS] Connected.');
      self.isConnected = true;
      self._reconnectAttempts = 0;
      self._emitConnectionChange('connected');
    };

    this.ws.onmessage = function (event) {
      self._handleMessage(event);
    };

    this.ws.onclose = function (event) {
      console.log('[WS] Closed. Code:', event.code, 'Reason:', event.reason);
      self.isConnected = false;

      if (event.code === 1000) {
        // Normal closure — session complete
        self._emitConnectionChange('disconnected');
        if (typeof self.onSessionComplete === 'function') {
          // The session_complete message should have already been handled via onmessage.
          // This is a safety net.
          self.onSessionComplete({ kido_response: 'Session complete!' });
        }
        return;
      }

      if (self._intentionalClose) {
        self._emitConnectionChange('disconnected');
        return;
      }

      // Unexpected close — attempt reconnect
      self._reconnect();
    };

    this.ws.onerror = function (event) {
      console.error('[WS] Error:', event);
      // onerror is always followed by onclose, so reconnect logic lives there.
    };
  }

  /**
   * Send a JSON payload over the WebSocket.
   * @param {Object} payload - e.g. { type: "chat", text: "..." }
   */
  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WS] Cannot send — not connected.');
      if (typeof this.onError === 'function') {
        this.onError('WebSocket is not connected.');
      }
      return;
    }

    var json = JSON.stringify(payload);
    console.log('[WS] Sending:', json);
    this.ws.send(json);
  }

  /** Gracefully close the WebSocket. */
  close() {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
    }
    this.isConnected = false;
    this._emitConnectionChange('disconnected');
  }

  // ── Internal Methods ──────────────────────────────────────

  /** Route incoming WS messages by type. */
  _handleMessage(event) {
    var payload;
    try {
      payload = JSON.parse(event.data);
    } catch (err) {
      console.error('[WS] Failed to parse message:', event.data);
      return;
    }

    console.log('[WS] Received:', payload.type, payload);

    switch (payload.type) {
      case 'kido_response':
        if (payload.data && payload.data.topic_checkpoint) {
          // Topic checkpoint → Mind Map flow
          if (typeof this.onMindMap === 'function') {
            this.onMindMap(payload.data);
          }
        } else {
          // Normal Kido response
          if (typeof this.onKidoResponse === 'function') {
            this.onKidoResponse(payload.data || {});
          }
        }
        break;

      case 'session_complete':
        if (typeof this.onSessionComplete === 'function') {
          this.onSessionComplete(payload.data || {});
        }
        break;

      case 'system_hint':
        if (typeof this.onSystemHint === 'function') {
          this.onSystemHint(payload.data || {});
        }
        break;

      case 'error':
        console.error('[WS] Server error:', payload.detail);
        if (typeof this.onError === 'function') {
          this.onError(payload.detail || 'Unknown server error');
        }
        break;

      default:
        console.warn('[WS] Unknown message type:', payload.type);
    }
  }

  /** Attempt reconnection with exponential backoff. */
  _reconnect() {
    if (this._intentionalClose) return;
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached (' + this._maxReconnectAttempts + ').');
      this._emitConnectionChange('disconnected');
      if (typeof this.onError === 'function') {
        this.onError('Connection lost. Please refresh the page.');
      }
      return;
    }

    this._reconnectAttempts++;
    var delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts - 1), 8000);
    console.log('[WS] Reconnecting in ' + delay + 'ms (attempt ' + this._reconnectAttempts + '/' + this._maxReconnectAttempts + ')...');
    this._emitConnectionChange('reconnecting');

    var self = this;
    this._reconnectTimer = setTimeout(function () {
      self.connect();
    }, delay);
  }

  /** Emit connection state change. */
  _emitConnectionChange(state) {
    if (typeof this.onConnectionChange === 'function') {
      this.onConnectionChange(state);
    }
  }
}
