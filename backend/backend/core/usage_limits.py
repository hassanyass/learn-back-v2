"""Usage limits for LearnBack platform.

Note: Daily session limits and upload limits have been removed — users
may create unlimited sessions and upload unlimited slide decks.
Only concurrent-session and per-session message caps remain to prevent
conflicts and control API costs.
"""

MAX_ACTIVE_SESSIONS_PER_USER = 1
MAX_MESSAGES_PER_SESSION = 25
STALE_ACTIVE_SESSION_TIMEOUT_MINUTES = 10
MESSAGE_LIMIT_WARNING_REMAINING = 5
