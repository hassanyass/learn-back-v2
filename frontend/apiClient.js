(function () {
  'use strict';

  var STORAGE_KEYS = {
    apiBaseUrl: 'learnback_api_base_url',
    token: 'learnback_token',
    user: 'learnback_user'
  };

  // Nuke toxic cache on load to prevent zombie ports
  try {
    window.localStorage.removeItem('learnback_api_base_url');
  } catch (_) { /* ignore */ }

  var DEFAULTS = {
    apiBaseUrl: 'http://127.0.0.1:8002'
  };

  var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isValidUuid(value) {
    return UUID_REGEX.test(value || '');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeText(value, fallback) {
    if (typeof value !== 'string') return fallback;
    var trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  function normalizeApiBaseUrl(raw) {
    var value = normalizeText(raw, DEFAULTS.apiBaseUrl);
    return value.replace(/\/+$/, '');
  }

  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Unable to persist local storage key:', key, error);
    }
  }

  function getApiBaseUrl() {
    var hostname = window.location.hostname;
    // If we are testing locally, point to your FastAPI port
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      return 'http://127.0.0.1:8002'; 
    }
    // When we deploy to Vercel/Netlify later, it will automatically use this:
    return 'https://your-future-production-backend.com';
  }

  function getAuthToken() {
    return readLocalStorage(STORAGE_KEYS.token) || '';
  }

  function getStoredUser() {
    try {
      var raw = readLocalStorage(STORAGE_KEYS.user);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getAuthToken();
  }

  function logout() {
    try {
      window.localStorage.removeItem(STORAGE_KEYS.token);
      window.localStorage.removeItem(STORAGE_KEYS.user);
    } catch (_) { /* ignore */ }
    window.location.href = 'auth.html';
  }

  function ApiError(message, options) {
    this.name = 'ApiError';
    this.message = message;
    this.status = options && options.status ? options.status : 0;
    this.payload = options && options.payload ? options.payload : null;
    this.path = options && options.path ? options.path : '';
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function buildHeaders(extraHeaders, includeJsonHeader) {
    var headers = {
      Accept: 'application/json'
    };

    var token = getAuthToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    if (includeJsonHeader) {
      headers['Content-Type'] = 'application/json';
    }

    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (key) {
        headers[key] = extraHeaders[key];
      });
    }

    return headers;
  }

  function parseResponseBody(response) {
    var contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') !== -1) {
      return response.json().catch(function () { return null; });
    }

    return response.text().then(function (text) {
      return text ? { message: text } : null;
    }).catch(function () { return null; });
  }

  async function request(path, options) {
    var requestOptions = options || {};
    var method = requestOptions.method || 'GET';
    var isFormData = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;
    var headers = buildHeaders(requestOptions.headers, !!requestOptions.body && !isFormData);
    var response;

    try {
      response = await fetch(getApiBaseUrl() + path, {
        method: method,
        headers: headers,
        body: requestOptions.body,
        signal: requestOptions.signal
      });
    } catch (error) {
      throw new ApiError('Unable to reach the LearnBack API.', { path: path });
    }

    var payload = await parseResponseBody(response);

    if (!response.ok) {
      // Redirect to login on auth failures
      if (response.status === 401) {
        try {
          window.localStorage.removeItem(STORAGE_KEYS.token);
          window.localStorage.removeItem(STORAGE_KEYS.user);
        } catch (_) { /* ignore */ }
        // Only redirect if we're NOT already on the auth page
        if (window.location.pathname.indexOf('auth.html') === -1) {
          window.location.href = 'auth.html';
          return;
        }
      }
      var message = (payload && (payload.detail || payload.message || payload.error)) || ('Request failed with status ' + response.status + '.');
      throw new ApiError(message, {
        status: response.status,
        payload: payload,
        path: path
      });
    }

    return payload;
  }

  async function requestWithFallback(attempts) {
    var lastError = null;
    var index;

    for (index = 0; index < attempts.length; index += 1) {
      try {
        return await attempts[index]();
      } catch (error) {
        lastError = error;
        if (!(error instanceof ApiError) || (error.status && error.status !== 404 && error.status !== 405)) {
          throw error;
        }
      }
    }

    if (lastError) throw lastError;
    throw new ApiError('No API handler was available for the requested operation.');
  }

  function normalizeSessionStartResponse(payload, fallbackSessionId) {
    var progressRaw = payload && payload.progress_score;
    var progressPercentRaw = payload && (payload.progress_percent || payload.progressPercent);
    var progressValue = progressPercentRaw != null ? toNumber(progressPercentRaw, 0) : toNumber(progressRaw, 0) * 100;
    // Coerce session_id to string — backend returns an integer DB primary key
    var rawId = payload && (payload.id || payload.session_id);
    var sessionId = rawId != null ? String(rawId) : null;
    return {
      sessionId: normalizeText(sessionId, fallbackSessionId || null),
      status: normalizeText(payload && payload.status, 'IN_PROGRESS'),
      progressPercent: clamp(Math.round(progressValue), 0, 100),
      startedAt: normalizeText(payload && (payload.started_at || payload.startedAt), new Date().toISOString()),
      title: normalizeText(payload && (payload.title || payload.session_title), null)
    };
  }

  // [REMOVED] normalizeChatResponse — chat now flows over WebSocket, not REST.

  function normalizeFeedbackPayload(payload, sessionId, sessionTitle) {
    var topics = Array.isArray(payload && payload.topics) ? payload.topics : [];
    return {
      sessionId: sessionId || null,
      sessionTitle: normalizeText(payload && (payload.sessionTitle || payload.session_title), sessionTitle || 'Machine Learning'),
      overallMastery: clamp(Math.round(toNumber(payload && (payload.overallMastery || payload.overall_mastery), 0)), 0, 100),
      topics: topics
    };
  }

  function normalizeSessionBootstrap(payload) {
    if (!payload) return null;
    var topics = Array.isArray(payload.topics) ? payload.topics : [];
    // Coerce session_id to string — backend returns integer DB primary key
    var rawId = payload.id || payload.session_id;
    var sessionId = rawId != null ? String(rawId) : null;
    return {
      sessionId: normalizeText(sessionId, null),
      sessionTitle: normalizeText(payload.title || payload.session_title, 'Machine Learning'),
      status: normalizeText(payload.status, 'IN_PROGRESS'),
      progress: clamp(Math.round(toNumber(payload.progress_percent || payload.progressPercent || 0, 0)), 0, 100),
      topicIndex: Math.max(0, Math.round(toNumber(payload.current_topic_index || payload.currentTopicIndex || 0, 0))),
      topics: topics,
      documentId: normalizeText(payload.document_id, null),
      pdfUrl: normalizeText(payload.pdf_url, null),
      startedAt: normalizeText(payload.started_at || payload.startedAt, new Date().toISOString()),
      completedAt: normalizeText(payload.completed_at || payload.completedAt, null)
    };
  }

  var LearnBackAPI = {
    getApiBaseUrl: getApiBaseUrl,
    getAuthToken: getAuthToken,
    getStoredUser: getStoredUser,
    isLoggedIn: isLoggedIn,
    logout: logout,
    request: request,

    uploadLecture: function (formData) {
      return request('/ingestion/upload-slides', {
        method: 'POST',
        body: formData
      });
    },

    startSession: function (payload) {
      var body = JSON.stringify({
        document_id: payload && payload.documentId ? payload.documentId : null
      });

      // Fix 4: Log what we're sending so we can diagnose backend rejections
      console.log('[LearnBackAPI] startSession payload:', {
        document_id: payload && payload.documentId ? payload.documentId : null
      });

      return request('/session/create', {
        method: 'POST',
        body: body
      }).then(function (response) {
        console.log('[LearnBackAPI] startSession response:', response);
        return normalizeSessionStartResponse(response, payload && payload.sessionId);
      });
    },

    // [REMOVED] sendChatMessage — chat now flows over WebSocket.
    // [REMOVED] finalizeSession — WS close code 1000 handles session end.
    // [REMOVED] skipToTopic — not in current backend WS spec.

    fetchSessionFeedback: function (sessionId, sessionTitle) {
      return requestWithFallback([
        function () {
          return request('/api/session/' + encodeURIComponent(sessionId) + '/feedback').then(function (response) {
            return normalizeFeedbackPayload(response, sessionId, sessionTitle);
          });
        },
        function () {
          return request('/api/feedback/session/' + encodeURIComponent(sessionId)).then(function (response) {
            return normalizeFeedbackPayload(response, sessionId, sessionTitle);
          });
        }
      ]);
    },

    fetchDashboardState: function () {
      return requestWithFallback([
        function () {
          return request('/dashboard');
        },
        function () {
          return request('/users/me/dashboard');
        }
      ]);
    },

    fetchSession: function (sessionId) {
      return request('/session/' + encodeURIComponent(sessionId)).then(function (response) {
        return normalizeSessionBootstrap(response);
      });
    },

    fetchConceptNotes: function (conceptId) {
      return request('/api/concepts/' + encodeURIComponent(conceptId) + '/kido-notes');
    },

    fetchConceptMisconceptions: function (conceptId) {
      return request('/api/concepts/' + encodeURIComponent(conceptId) + '/misconceptions');
    }
  };

  window.LearnBackAPI = LearnBackAPI;
})();
