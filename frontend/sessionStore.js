(function () {
  'use strict';

  var STORAGE_KEYS = {
    currentSession: 'learnback_current_session',
    sessionHistory: 'learnback_session_history',
    userName: 'learnback_user_name',
    legacySessionId: 'learnback_session_id',
    legacyTopicIndex: 'learnback_topic_index',
    legacyProgress: 'learnback_progress',
    legacyCategories: 'learnback_categories',
    legacySessionComplete: 'learnback_session_complete',
    legacyFinalProgress: 'learnback_final_progress',
    legacyMessageCount: 'learnback_message_count',
    legacyPdfUrl: 'learnback_pdf_url',
    legacyTextId: 'learnback_text_id',
    legacyDocumentId: 'learnback_document_id',
    legacySessionTitle: 'learnback_session_title'
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safeJsonParse(rawValue, fallback) {
    if (!rawValue) return fallback;
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return fallback;
    }
  }

  function readJson(key, fallback) {
    try {
      return safeJsonParse(window.localStorage.getItem(key), fallback);
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('Unable to persist session data:', key, error);
    }
  }

  function readText(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      if (typeof value !== 'string') return fallback;
      var trimmed = value.trim();
      return trimmed ? trimmed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeText(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Unable to persist session value:', key, error);
    }
  }

  function removeKeys(keys) {
    keys.forEach(function (key) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        console.warn('Unable to remove session key:', key, error);
      }
    });
  }

  function normalizeText(value, fallback) {
    if (typeof value !== 'string') return fallback;
    var trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeTopic(topic, index) {
    var raw = topic || {};
    var title = normalizeText(raw.title || raw.name, 'Topic ' + (index + 1));
    var coreConcepts = [];

    if (Array.isArray(raw.coreConcepts)) coreConcepts = raw.coreConcepts.slice();
    else if (Array.isArray(raw.core_concepts)) coreConcepts = raw.core_concepts.slice();

    return {
      id: normalizeText(raw.id, 'topic-' + (index + 1)),
      title: title,
      description: normalizeText(raw.description || raw.content, ''),
      coreConcepts: coreConcepts
    };
  }

  function normalizeTopics(topics) {
    if (!Array.isArray(topics)) return [];
    return topics.map(normalizeTopic);
  }

  function deriveFallbackTopicFeedback(topicTitle, progressPercent, status) {
    if (status === 'complete' && progressPercent >= 80) {
      return topicTitle + ' was taught with strong clarity and steady momentum.';
    }

    if (status === 'complete') {
      return topicTitle + ' was covered, but there is still room to tighten the explanation and examples.';
    }

    if (status === 'skipped') {
      return topicTitle + ' was skipped, so Kido did not build enough understanding here yet.';
    }

    return topicTitle + ' is still in progress and needs more explanation before Kido can fully retain it.';
  }

  function deriveFallbackRecommendation(status) {
    if (status === 'complete') return 'Keep the explanation concrete and reinforce it with a worked example.';
    if (status === 'skipped') return 'Revisit this topic early in the next session before moving ahead.';
    return 'Slow down the pacing and break the topic into smaller teachable steps.';
  }

  function normalizeFeedback(feedback, sessionRecord) {
    if (!feedback) return null;

    var record = sessionRecord || {};
    var topics = Array.isArray(feedback.topics) ? feedback.topics : [];
    var normalizedTopics = topics.map(function (topic, index) {
      return {
        id: normalizeText(topic.id, 'topic-' + (index + 1)),
        title: normalizeText(topic.title, record.topics && record.topics[index] ? record.topics[index].title : 'Topic ' + (index + 1)),
        status: normalizeText(topic.status, 'incomplete'),
        understanding: topic.understanding || null,
        feedback: normalizeText(topic.feedback, deriveFallbackTopicFeedback(
          normalizeText(topic.title, 'Topic ' + (index + 1)),
          record.progress || 0,
          normalizeText(topic.status, 'incomplete')
        )),
        misconceptions: Array.isArray(topic.misconceptions) ? topic.misconceptions.slice() : [],
        recommendation: normalizeText(topic.recommendation, deriveFallbackRecommendation(normalizeText(topic.status, 'incomplete')))
      };
    });

    return {
      sessionId: normalizeText(feedback.sessionId || feedback.session_id, record.sessionId || null),
      sessionTitle: normalizeText(feedback.sessionTitle, record.sessionTitle || 'Machine Learning'),
      overallMastery: clamp(Math.round(toNumber(feedback.overallMastery, record.progress || 0)), 0, 100),
      topics: normalizedTopics
    };
  }

  function normalizeSessionRecord(record) {
    var raw = record || {};
    var startedAt = normalizeText(raw.startedAt || raw.started_at, new Date().toISOString());
    var updatedAt = normalizeText(raw.updatedAt || raw.updated_at, startedAt);
    var completedAt = normalizeText(raw.completedAt || raw.completed_at, null);
    var progress = clamp(Math.round(toNumber(raw.progress, 0)), 0, 100);
    var topicIndex = Math.max(0, Math.round(toNumber(raw.topicIndex, 0)));

    var normalized = {
      sessionId: normalizeText(raw.sessionId || raw.id || raw.session_id, null),
      sessionTitle: normalizeText(raw.sessionTitle, 'Machine Learning'),
      status: normalizeText(raw.status, 'IN_PROGRESS'),
      progress: progress,
      topicIndex: topicIndex,
      topics: normalizeTopics(raw.topics),
      documentId: normalizeText(raw.documentId || raw.document_id, null),
      textId: normalizeText(raw.textId || raw.text_id, null),
      pdfUrl: normalizeText(raw.pdfUrl || raw.pdf_url, null),
      startedAt: startedAt,
      updatedAt: updatedAt,
      completedAt: completedAt,
      feedback: null
    };

    normalized.feedback = normalizeFeedback(raw.feedback, normalized);

    return normalized;
  }

  function syncLegacySession(sessionRecord) {
    if (!sessionRecord || !sessionRecord.sessionId) return;

    writeText(STORAGE_KEYS.legacySessionId, sessionRecord.sessionId);
    writeText(STORAGE_KEYS.legacyTopicIndex, String(sessionRecord.topicIndex || 0));
    writeText(STORAGE_KEYS.legacyProgress, String(sessionRecord.progress || 0));
    writeText(STORAGE_KEYS.legacySessionTitle, sessionRecord.sessionTitle || 'Machine Learning');
    writeText(STORAGE_KEYS.legacySessionComplete, sessionRecord.status === 'COMPLETED' ? 'true' : 'false');

    if (sessionRecord.topics.length) {
      writeJson(STORAGE_KEYS.legacyCategories, sessionRecord.topics);
    }
    if (sessionRecord.pdfUrl) writeText(STORAGE_KEYS.legacyPdfUrl, sessionRecord.pdfUrl);
    if (sessionRecord.textId) writeText(STORAGE_KEYS.legacyTextId, sessionRecord.textId);
    if (sessionRecord.documentId) writeText(STORAGE_KEYS.legacyDocumentId, sessionRecord.documentId);
    if (sessionRecord.status === 'COMPLETED') {
      writeText(STORAGE_KEYS.legacyFinalProgress, String(sessionRecord.progress || 0));
    }
  }

  function clearLegacySession() {
    removeKeys([
      STORAGE_KEYS.legacySessionId,
      STORAGE_KEYS.legacyTopicIndex,
      STORAGE_KEYS.legacyProgress,
      STORAGE_KEYS.legacyCategories,
      STORAGE_KEYS.legacySessionComplete,
      STORAGE_KEYS.legacyFinalProgress,
      STORAGE_KEYS.legacyMessageCount,
      STORAGE_KEYS.legacyPdfUrl,
      STORAGE_KEYS.legacyTextId,
      STORAGE_KEYS.legacyDocumentId,
      STORAGE_KEYS.legacySessionTitle
    ]);
  }

  function readCurrentSession() {
    var stored = readJson(STORAGE_KEYS.currentSession, null);
    if (stored && stored.sessionId) return normalizeSessionRecord(stored);

    var legacySessionId = readText(STORAGE_KEYS.legacySessionId, null);
    if (!legacySessionId) return null;

    return normalizeSessionRecord({
      sessionId: legacySessionId,
      sessionTitle: readText(STORAGE_KEYS.legacySessionTitle, 'Machine Learning'),
      topicIndex: readText(STORAGE_KEYS.legacyTopicIndex, '0'),
      progress: readText(STORAGE_KEYS.legacyProgress, '0'),
      topics: readJson(STORAGE_KEYS.legacyCategories, []),
      textId: readText(STORAGE_KEYS.legacyTextId, null),
      documentId: readText(STORAGE_KEYS.legacyDocumentId, null),
      pdfUrl: readText(STORAGE_KEYS.legacyPdfUrl, null),
      status: readText(STORAGE_KEYS.legacySessionComplete, 'false') === 'true' ? 'COMPLETED' : 'IN_PROGRESS'
    });
  }

  function readSessionHistory() {
    return readJson(STORAGE_KEYS.sessionHistory, []).map(normalizeSessionRecord).filter(function (record) {
      return !!record.sessionId;
    });
  }

  function writeCurrentSession(sessionRecord) {
    var normalized = normalizeSessionRecord(sessionRecord);
    writeJson(STORAGE_KEYS.currentSession, normalized);
    syncLegacySession(normalized);
    return normalized;
  }

  function writeSessionHistory(history) {
    writeJson(STORAGE_KEYS.sessionHistory, history.map(normalizeSessionRecord));
  }

  function sortSessionHistory(history) {
    return history.slice().sort(function (left, right) {
      var leftDate = Date.parse(left.updatedAt || left.completedAt || left.startedAt || 0);
      var rightDate = Date.parse(right.updatedAt || right.completedAt || right.startedAt || 0);
      return rightDate - leftDate;
    });
  }

  function upsertSessionHistory(sessionRecord) {
    var history = readSessionHistory().filter(function (record) {
      return record.sessionId !== sessionRecord.sessionId;
    });
    history.unshift(normalizeSessionRecord(sessionRecord));
    writeSessionHistory(sortSessionHistory(history));
  }

  function getSessionById(sessionId) {
    if (!sessionId) return null;

    var current = readCurrentSession();
    if (current && current.sessionId === sessionId) return current;

    var history = readSessionHistory();
    var match = history.find(function (record) {
      return record.sessionId === sessionId;
    });

    return match || null;
  }

  function buildFallbackFeedback(sessionRecord) {
    if (!sessionRecord) {
      return {
        sessionId: null,
        sessionTitle: 'Machine Learning',
        overallMastery: 0,
        topics: []
      };
    }

    if (sessionRecord.feedback) return sessionRecord.feedback;

    var topics = sessionRecord.topics.map(function (topic, index) {
      var isPastTopic = index < sessionRecord.topicIndex;
      var isCurrentTopic = index === sessionRecord.topicIndex;
      var status = 'incomplete';

      if (sessionRecord.status === 'COMPLETED' && (isPastTopic || (isCurrentTopic && sessionRecord.progress >= 80))) {
        status = 'complete';
      } else if (index > sessionRecord.topicIndex && sessionRecord.status === 'COMPLETED') {
        status = 'skipped';
      }

      var understanding = null;
      if (status === 'complete' && sessionRecord.progress >= 80) understanding = 'strong';
      else if (status === 'complete') understanding = 'good';
      else if (isCurrentTopic && sessionRecord.progress > 0) understanding = 'weak';

      return {
        id: topic.id,
        title: topic.title,
        status: status,
        understanding: understanding,
        feedback: deriveFallbackTopicFeedback(topic.title, sessionRecord.progress, status),
        misconceptions: [],
        recommendation: deriveFallbackRecommendation(status)
      };
    });

    return {
      sessionId: sessionRecord.sessionId,
      sessionTitle: sessionRecord.sessionTitle,
      overallMastery: sessionRecord.progress,
      topics: topics
    };
  }

  function extractFirstName() {
    var fullName = readText(STORAGE_KEYS.userName, 'Teacher');
    return fullName.split(/\s+/)[0] || 'Teacher';
  }

  function toDateKey(dateString) {
    if (!dateString) return null;
    var date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function calculateStreak(activeDates) {
    if (!activeDates.length) return 0;

    var set = {};
    activeDates.forEach(function (date) {
      set[date] = true;
    });

    var current = new Date();
    current.setHours(0, 0, 0, 0);

    var streak = 0;
    var cursor = new Date(current);

    while (true) {
      var key = cursor.toISOString().slice(0, 10);
      if (!set[key]) {
        if (streak === 0) {
          cursor.setDate(cursor.getDate() - 1);
          key = cursor.toISOString().slice(0, 10);
          if (!set[key]) return 0;
        } else {
          break;
        }
      }

      if (!set[key]) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  function calculateHours(history) {
    return history.reduce(function (total, sessionRecord) {
      if (!sessionRecord.completedAt) return total;
      var startedAt = Date.parse(sessionRecord.startedAt || 0);
      var completedAt = Date.parse(sessionRecord.completedAt || 0);
      if (Number.isNaN(startedAt) || Number.isNaN(completedAt) || completedAt <= startedAt) return total;
      return total + ((completedAt - startedAt) / (1000 * 60 * 60));
    }, 0);
  }

  function calculateMastery(history) {
    var completed = history.filter(function (sessionRecord) {
      return sessionRecord.status === 'COMPLETED';
    });

    if (!completed.length) return 0;

    var total = completed.reduce(function (sum, sessionRecord) {
      var feedback = buildFallbackFeedback(sessionRecord);
      return sum + toNumber(feedback.overallMastery, sessionRecord.progress || 0);
    }, 0);

    return Math.round(total / completed.length);
  }

  function buildBadges(history, streak, totalHours, masteryPct) {
    var completedCount = history.filter(function (record) {
      return record.status === 'COMPLETED';
    }).length;

    return [
      {
        id: 'first',
        name: 'First session',
        description: 'Complete your first teaching session with Kido.',
        unlocked: completedCount >= 1,
        icon: 'flame'
      },
      {
        id: 'week',
        name: 'Week streak',
        description: 'Teach on 7 days in a row.',
        unlocked: streak >= 7,
        icon: 'trophy'
      },
      {
        id: 'deep',
        name: 'Dedicated teacher',
        description: 'Spend over 10 hours teaching.',
        unlocked: totalHours >= 10,
        icon: 'medal'
      },
      {
        id: 'master',
        name: 'Mastery path',
        description: 'Reach 90% average mastery.',
        unlocked: masteryPct >= 90,
        icon: 'star'
      },
      {
        id: 'scholar',
        name: '25 sessions',
        description: 'Finish 25 teaching sessions.',
        unlocked: completedCount >= 25,
        icon: 'book'
      }
    ];
  }

  function mapDashboardSession(record) {
    var feedback = buildFallbackFeedback(record);
    var progress = clamp(Math.round(toNumber(feedback.overallMastery, record.progress || 0)), 0, 100);
    var status = 'in_progress';

    if (record.status === 'COMPLETED') {
      status = progress >= 80 ? 'mastered' : 'needs_review';
    }

    return {
      id: record.sessionId,
      title: record.sessionTitle || 'Machine Learning',
      status: status,
      progress: progress,
      date: toDateKey(record.completedAt || record.updatedAt || record.startedAt) || new Date().toISOString().slice(0, 10)
    };
  }

  var SessionStore = {
    createSession: function (sessionRecord) {
      var normalized = writeCurrentSession(sessionRecord);
      upsertSessionHistory(normalized);
      return normalized;
    },

    saveSession: function (sessionId, topicIndex, progress) {
      var current = readCurrentSession();
      var nextState;

      if (current && current.sessionId === sessionId) {
        nextState = {
          sessionId: current.sessionId,
          sessionTitle: current.sessionTitle,
          status: current.status,
          topicIndex: topicIndex,
          progress: progress,
          topics: current.topics,
          documentId: current.documentId,
          textId: current.textId,
          pdfUrl: current.pdfUrl,
          startedAt: current.startedAt,
          updatedAt: new Date().toISOString(),
          completedAt: current.completedAt,
          feedback: current.feedback
        };
      } else {
        nextState = {
          sessionId: sessionId,
          topicIndex: topicIndex,
          progress: progress,
          updatedAt: new Date().toISOString()
        };
      }

      return this.updateSession(nextState);
    },

    updateSession: function (patch) {
      var current = readCurrentSession();
      var merged = normalizeSessionRecord(Object.assign({}, current || {}, patch || {}, {
        updatedAt: new Date().toISOString()
      }));

      if (!merged.sessionId) return null;

      writeCurrentSession(merged);
      upsertSessionHistory(merged);
      return merged;
    },

    getSession: function () {
      return readCurrentSession();
    },

    getSessionById: function (sessionId) {
      return getSessionById(sessionId);
    },

    getSessionHistory: function () {
      return sortSessionHistory(readSessionHistory());
    },

    setFeedback: function (sessionId, feedback) {
      var sessionRecord = getSessionById(sessionId) || readCurrentSession();
      if (!sessionRecord) return null;

      var normalizedFeedback = normalizeFeedback(feedback, sessionRecord);
      var updated = normalizeSessionRecord(Object.assign({}, sessionRecord, {
        feedback: normalizedFeedback,
        progress: normalizedFeedback ? normalizedFeedback.overallMastery : sessionRecord.progress,
        updatedAt: new Date().toISOString()
      }));

      if (readCurrentSession() && readCurrentSession().sessionId === updated.sessionId) {
        writeCurrentSession(updated);
      }
      upsertSessionHistory(updated);
      return updated;
    },

    getFeedback: function (sessionId) {
      var sessionRecord = getSessionById(sessionId) || readCurrentSession();
      return buildFallbackFeedback(sessionRecord);
    },

    finalizeSession: function (sessionId, options) {
      var current = readCurrentSession();
      var sessionRecord = getSessionById(sessionId) || current;
      if (!sessionRecord) return null;

      var settings = options || {};
      var completedAt = normalizeText(settings.completedAt, new Date().toISOString());
      var updated = normalizeSessionRecord(Object.assign({}, sessionRecord, {
        status: 'COMPLETED',
        completedAt: completedAt,
        progress: settings.progress != null ? settings.progress : sessionRecord.progress,
        topicIndex: settings.topicIndex != null ? settings.topicIndex : sessionRecord.topicIndex,
        updatedAt: completedAt
      }));

      if (settings.feedback) {
        updated.feedback = normalizeFeedback(settings.feedback, updated);
        updated.progress = updated.feedback ? updated.feedback.overallMastery : updated.progress;
      }

      upsertSessionHistory(updated);

      if (current && current.sessionId === updated.sessionId) {
        if (settings.clearCurrent) {
          removeKeys([STORAGE_KEYS.currentSession]);
          clearLegacySession();
        } else {
          writeCurrentSession(updated);
        }
      }

      return updated;
    },

    clearSession: function () {
      removeKeys([STORAGE_KEYS.currentSession]);
      clearLegacySession();
    },

    async resumeSession() {
      var sessionRecord = readCurrentSession();
      if (!sessionRecord) return null;

      if (window.LearnBackAPI && typeof window.LearnBackAPI.fetchSession === 'function') {
        try {
          var remote = await window.LearnBackAPI.fetchSession(sessionRecord.sessionId);
          if (remote && remote.sessionId) {
            return this.updateSession(remote);
          }
        } catch (error) {
          return sessionRecord;
        }
      }

      return sessionRecord;
    },

    async endSession(options) {
      var current = readCurrentSession();
      if (!current) return null;

      var settings = options || {};
      var updated = this.finalizeSession(current.sessionId, {
        clearCurrent: settings.clearCurrent !== false,
        progress: settings.progress != null ? settings.progress : current.progress,
        topicIndex: settings.topicIndex != null ? settings.topicIndex : current.topicIndex,
        completedAt: settings.completedAt
      });

      if (!settings.finalizeOnly && settings.clearCurrent !== false) {
        this.clearSession();
      }

      return updated;
    },

    buildDashboardState: function () {
      var history = this.getSessionHistory();
      var activeDates = history.map(function (record) {
        return toDateKey(record.completedAt || record.updatedAt || record.startedAt);
      }).filter(Boolean);

      var uniqueActiveDates = Array.from(new Set(activeDates)).sort();
      var totalHours = calculateHours(history);
      var masteryPct = calculateMastery(history);
      var streak = calculateStreak(uniqueActiveDates);

      return {
        user: {
          firstName: extractFirstName(),
          streak: streak,
          totalHours: Number(totalHours.toFixed(1)),
          masteryPct: masteryPct,
          activeDates: uniqueActiveDates
        },
        badges: buildBadges(history, streak, totalHours, masteryPct),
        sessions: history.map(mapDashboardSession)
      };
    }
  };

  window.SessionStore = SessionStore;
})();
