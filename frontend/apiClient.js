(function () {
  'use strict';

  var STORAGE_KEYS = {
    apiBaseUrl: 'learnback_api_base_url',
    token: 'learnback_token',
    user: 'learnback_user'
  };

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

  function normalizeNullableText(value, fallback) {
    if (value == null) return fallback;
    return normalizeText(value, fallback);
  }

  function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
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
    var cfg = window.__LEARNBACK_CONFIG__;
    if (cfg && cfg.API_BASE_URL) return cfg.API_BASE_URL;
    // Fallback if config.js didn't load
    var hostname = window.location.hostname;
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
      return 'http://127.0.0.1:8002';
    }
    return window.location.origin;
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
      if (response.status === 401) {
        try {
          window.localStorage.removeItem(STORAGE_KEYS.token);
          window.localStorage.removeItem(STORAGE_KEYS.user);
        } catch (_) { /* ignore */ }
        if (window.location.pathname.indexOf('auth') === -1) {
          /* Mark that we bounced due to a 401 so auth.js can clear the stale
             token instead of immediately redirecting back to dashboard. */
          try { window.sessionStorage.setItem('lb_auth_bounce', '1'); } catch (_) {}
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

  function normalizeFeedbackPayload(payload, sessionId, sessionTitle) {
    var topics = Array.isArray(payload && payload.topics) ? payload.topics : [];
    return {
      sessionId: sessionId || (payload && payload.session_id) || null,
      sessionTitle: normalizeText(payload && (payload.session_title || payload.sessionTitle), sessionTitle || 'Session Summary'),
      completionType: normalizeText(payload && payload.completion_type, 'natural'),
      overallMastery: clamp(Math.round(toNumber(payload && (payload.overall_mastery || payload.overallMastery), 0)), 0, 100),
      durationMinutes: payload && payload.duration_minutes != null ? toNumber(payload.duration_minutes, null) : null,
      topics: topics,
      strengths: Array.isArray(payload && payload.strengths) ? payload.strengths : [],
      weakAreas: Array.isArray(payload && (payload.weak_areas || payload.weakAreas)) ? (payload.weak_areas || payload.weakAreas) : []
    };
  }

  function normalizeSessionBootstrap(payload) {
    if (!payload) return null;
    var topics = Array.isArray(payload.topics) ? payload.topics : [];
    var rawId = payload.id || payload.session_id;
    var sessionId = rawId != null ? String(rawId) : null;
    return {
      sessionId: normalizeText(sessionId, null),
      sessionTitle: normalizeText(payload.title || payload.session_title, 'Machine Learning'),
      status: normalizeText(payload.status, 'IN_PROGRESS'),
      progress: clamp(Math.round(toNumber(payload.progress_percent || payload.progressPercent || 0, 0)), 0, 100),
      topicIndex: Math.max(0, Math.round(toNumber(payload.current_topic_index || payload.currentTopicIndex || 0, 0))),
      topics: topics,
      sessionState: payload.session_state || null,
      documentId: normalizeText(payload.document_id, null),
      pdfUrl: normalizeNullableText(payload.pdf_url, null),
      fileType: normalizeText(payload.file_type || payload.fileType, null),
      hasPreview: normalizeBoolean(payload.has_preview, false),
      deckStatus: normalizeText(payload.deck_status || payload.deckStatus, null),
      sourceType: normalizeText(payload.source_type || payload.sourceType, 'upload'),
      startedAt: normalizeText(payload.started_at || payload.startedAt, new Date().toISOString()),
      completedAt: normalizeText(payload.completed_at || payload.completedAt, null)
    };
  }

  var ERROR_TYPES = {
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    UNSUPPORTED_CONTENT: 'UNSUPPORTED_CONTENT',
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTH_EXPIRED: 'AUTH_EXPIRED',
    SERVER_ERROR: 'SERVER_ERROR',
    AI_PROCESSING: 'AI_PROCESSING',
    UNKNOWN: 'UNKNOWN'
  };

  var FRIENDLY_MESSAGES = {};
  FRIENDLY_MESSAGES[ERROR_TYPES.FILE_TOO_LARGE] = {
    title: 'Your file is too large to process.',
    suggestion: 'Try reducing the file size below 50 MB, or remove unnecessary slides and images.'
  };
  FRIENDLY_MESSAGES[ERROR_TYPES.UNSUPPORTED_CONTENT] = {
    title: "This file doesn't seem suitable for structured learning.",
    suggestion: 'Try uploading lecture slides, notes, or study materials instead of novels or non-educational content.'
  };
  FRIENDLY_MESSAGES[ERROR_TYPES.NETWORK_ERROR] = {
    title: 'Connection problem detected.',
    suggestion: 'Check your internet connection and try again in a few moments.'
  };
  FRIENDLY_MESSAGES[ERROR_TYPES.AUTH_EXPIRED] = {
    title: 'Your session has expired.',
    suggestion: 'Please sign in again to continue.'
  };
  FRIENDLY_MESSAGES[ERROR_TYPES.SERVER_ERROR] = {
    title: 'Something went wrong on our side.',
    suggestion: 'Please try again shortly. If the problem persists, contact support.'
  };
  FRIENDLY_MESSAGES[ERROR_TYPES.AI_PROCESSING] = {
    title: 'We had trouble analyzing your document.',
    suggestion: 'Try uploading a smaller or simpler file with clear text content.'
  };
  FRIENDLY_MESSAGES[ERROR_TYPES.UNKNOWN] = {
    title: 'An unexpected error occurred.',
    suggestion: 'Please refresh the page and try again.'
  };

  function normalizeUserError(error) {
    if (!error.status && !(error instanceof ApiError)) {
      return Object.assign({ type: ERROR_TYPES.NETWORK_ERROR }, FRIENDLY_MESSAGES[ERROR_TYPES.NETWORK_ERROR]);
    }
    if (error instanceof ApiError && error.status === 0) {
      return Object.assign({ type: ERROR_TYPES.NETWORK_ERROR }, FRIENDLY_MESSAGES[ERROR_TYPES.NETWORK_ERROR]);
    }

    if (error.status === 401) {
      return Object.assign({ type: ERROR_TYPES.AUTH_EXPIRED }, FRIENDLY_MESSAGES[ERROR_TYPES.AUTH_EXPIRED]);
    }

    if (error.status === 413) {
      return Object.assign({ type: ERROR_TYPES.FILE_TOO_LARGE }, FRIENDLY_MESSAGES[ERROR_TYPES.FILE_TOO_LARGE]);
    }

    if (error.status === 422) {
      var rawDetail = '';
      if (error.payload && error.payload.detail) {
        rawDetail = typeof error.payload.detail === 'string'
          ? error.payload.detail
          : (error.payload.detail.error || JSON.stringify(error.payload.detail));
      }
      var rawLower = (rawDetail + ' ' + (error.message || '')).toLowerCase();

      if (rawLower.indexOf('llm') !== -1 || rawLower.indexOf('groq') !== -1 ||
        rawLower.indexOf('openai') !== -1 || rawLower.indexOf('provider') !== -1 ||
        rawLower.indexOf('exhausted') !== -1 || rawLower.indexOf('segmentation') !== -1 ||
        rawLower.indexOf('parse') !== -1) {
        return Object.assign({ type: ERROR_TYPES.AI_PROCESSING }, FRIENDLY_MESSAGES[ERROR_TYPES.AI_PROCESSING]);
      }

      if (rawLower.indexOf('no extractable') !== -1 || rawLower.indexOf('insufficient') !== -1 ||
        rawLower.indexOf('not suitable') !== -1 || rawLower.indexOf('no topics') !== -1 ||
        rawLower.indexOf('empty') !== -1) {
        return Object.assign({ type: ERROR_TYPES.UNSUPPORTED_CONTENT }, FRIENDLY_MESSAGES[ERROR_TYPES.UNSUPPORTED_CONTENT]);
      }

      if (rawLower.indexOf('corrupt') !== -1 || rawLower.indexOf('could not read') !== -1 ||
        rawLower.indexOf('password') !== -1) {
        return {
          type: ERROR_TYPES.UNSUPPORTED_CONTENT,
          title: 'We couldn’t read this file.',
          suggestion: 'The file may be corrupted or password-protected. Try a different copy.'
        };
      }

      return Object.assign({ type: ERROR_TYPES.AI_PROCESSING }, FRIENDLY_MESSAGES[ERROR_TYPES.AI_PROCESSING]);
    }

    if (error.status >= 500) {
      return Object.assign({ type: ERROR_TYPES.SERVER_ERROR }, FRIENDLY_MESSAGES[ERROR_TYPES.SERVER_ERROR]);
    }

    return Object.assign({ type: ERROR_TYPES.UNKNOWN }, FRIENDLY_MESSAGES[ERROR_TYPES.UNKNOWN]);
  }

  var LearnBackAPI = {
    getApiBaseUrl: getApiBaseUrl,
    getAuthToken: getAuthToken,
    getStoredUser: getStoredUser,
    isLoggedIn: isLoggedIn,
    logout: logout,
    request: request,
    normalizeUserError: normalizeUserError,

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

    fetchSessionFeedback: function (sessionId, sessionTitle) {
      return request('/session/' + encodeURIComponent(sessionId) + '/feedback').then(function (response) {
        return normalizeFeedbackPayload(response, sessionId, sessionTitle);
      });
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
    },

    fetchMindMap: function (sessionId) {
      return request('/session/' + encodeURIComponent(sessionId) + '/mind-map');
    },

    skipTopic: function (sessionId) {
      return request('/session/' + encodeURIComponent(sessionId) + '/skip-topic', {
        method: 'POST'
      });
    },

    endSession: function (sessionId) {
      console.log('[EndSession] POST /session/' + sessionId + '/end — calling...');
      return request('/session/' + encodeURIComponent(sessionId) + '/end', {
        method: 'POST'
      });
    },

    // Alias used by feedback.js to ensure session is finalized before loading report
    finalizeSession: function (sessionId) {
      return this.endSession(sessionId);
    },

    fetchWidgetState: function (sessionId) {
      return request('/session/' + encodeURIComponent(sessionId) + '/widget-state');
    },

    fetchHint: function (sessionId) {
      return request('/session/' + encodeURIComponent(sessionId) + '/hint', {
        method: 'POST'
      });
    },

    fetchDemoContent: function () {
      return request('/demo-content');
    },

    startDemoSession: function (demoId) {
      return request('/session/create-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_id: demoId })
      }).then(function (response) {
        return normalizeSessionStartResponse(response);
      });
    }
  };

  window.LearnBackAPI = LearnBackAPI;
})();
