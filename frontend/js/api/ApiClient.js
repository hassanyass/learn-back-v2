class ApiClient {
    constructor(baseUrl = null) {
        this.baseUrl = this.resolveBaseUrl(baseUrl);
    }

    resolveBaseUrl(explicitBase) {
        if (explicitBase) return explicitBase;
        try {
            const runtimeOverride = window.__LEARNBACK_API_BASE__;
            if (runtimeOverride && typeof runtimeOverride === 'string') return runtimeOverride;
            const stored = window.localStorage.getItem('learnback_api_base');
            if (stored && typeof stored === 'string') return stored;
            const origin = window.location.origin || '';
            if (origin.includes('127.0.0.1:8001') || origin.includes('localhost:8001')) {
                return `${origin}/api`;
            }
        } catch (_) { }
        return 'http://127.0.0.1:8001/api';
    }

    getAuthToken() {
        try {
            return window.localStorage.getItem('learnback_token');
        } catch (_) {
            return null;
        }
    }

    /**
     * Generic request wrapper with try/catch to prevent UI crashes 
     * on network errors.
     */
    async request(endpoint, options = {}) {
        try {
            const config = {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            };

            const token = this.getAuthToken();
            if (token && !config.headers.Authorization) {
                config.headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetch(`${this.baseUrl}${endpoint}`, config);

            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                const detail = (payload && (payload.detail || payload.message)) || `API Request failed with status ${response.status}`;
                const error = new Error(detail);
                error.httpStatus = response.status;
                throw error;
            }

            return payload;
        } catch (error) {
            console.error(`[ApiClient] Network Error on ${endpoint}:`, error);
            const status = typeof error.httpStatus === 'number' ? error.httpStatus : null;
            return {
                _error: true,
                message: error.message || 'Unknown network error',
                status,
                kind: this._classifyErrorKind(status, error.message || ''),
            };
        }
    }

    _classifyErrorKind(status, message) {
        if (status === 401 || status === 403) return 'auth';
        if (status === 404) return 'not_found';
        if (status === 422) return 'validation';
        if (status !== null && status >= 500) return 'server';
        if ((message || '').toLowerCase().includes('failed to fetch')) return 'network';
        return 'unknown';
    }

    // --- Specific Endpoints Stubbed for Phase 2/3 ---

    async fetchWidgetDemo(type) {
        return this.request(`/widgets/demo/${type}`, {
            method: 'GET'
        });
    }

    async fetchWidgetPayload(topicId) {
        return this.request(`/widgets/payload?topic_id=${topicId}`, {
            method: 'GET'
        });
    }

    async submitWidgetResult(widgetId, data) {
        // BUG-07 fix: send a flat body matching the Pydantic WidgetSubmission schema
        return this.request(`/widgets/submit`, {
            method: 'POST',
            body: JSON.stringify({
                session_id: data.session_id,
                widget_id: data.widget_id || widgetId,
                topic_id: data.topic_id,
                is_correct: !!data.is_correct,
                attempts: data.attempts || 1
            })
        });
    }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;
