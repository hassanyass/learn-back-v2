# Authentication & Dashboard — Testing & Integration Report

> **Phase**: 1 — Auth Flow Stabilization
> **Status**: ✅ Phase 1 Completed — Authentication Ready
> **Date**: 2026-04-24

---

## 1. Phase 1 Overview

This phase addresses all authentication and dashboard issues identified in the
deep audit. The goal was to make the Register → Login → Token → /auth/me →
Dashboard flow fully functional, crash-free, and ready for frontend wiring.

**Scope**: `auth_service.py`, `auth_router.py`, `dashboard_router.py`,
`dashboard_service.py`, `api_schemas.py`, and a new shared `routes/deps.py`.

---

## 2. Fixed Issues Summary

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `auth_service.py` | JWT secret fell back to hardcoded `"change-me-in-production"` | **Fail-fast**: raises `RuntimeError` if `JWT_SECRET_KEY`/`JWT_SECRET` env vars are unset |
| 2 | `auth_service.py` | `int(user_id)` could crash with `ValueError` on malformed JWT `sub` | Wrapped in `try/except (ValueError, TypeError)` → HTTP 401 |
| 3 | `auth_service.py` | No `get_user_by_id` or `mark_onboarding_complete` methods | Added both methods to support new endpoints |
| 4 | `auth_router.py` | `GET /auth/me` endpoint missing (frontend depended on it) | Added endpoint returning `UserResponse` |
| 5 | `auth_router.py` | `PATCH /auth/onboarding_complete` endpoint missing | Added endpoint updating `has_seen_walkthrough` |
| 6 | `api_schemas.py` | No Pydantic schema for user profile response | Added `UserResponse` schema |
| 7 | `dashboard_router.py` | `get_current_user_id` duplicated locally | Replaced with import from shared `routes/deps.py` |
| 8 | `dashboard_service.py` | `ZoneInfo("invalid")` crashed server (unhandled exception) | Wrapped in `try/except` → HTTP 400 |
| 9 | `routes/deps.py` | Auth dependency duplicated in 4 routers | Created shared module (auth_router + dashboard_router migrated) |

### Files Modified
- `backend/services/auth_service.py`
- `backend/routes/auth_router.py`
- `backend/routes/dashboard_router.py`
- `backend/services/dashboard_service.py`
- `backend/schemas/api_schemas.py`

### Files Created
- `backend/routes/deps.py` — Shared `get_current_user_id` dependency

---

## 3. Authentication Flow (Step-by-Step)

### 3.1 Registration
```
Client                              Server
  │                                    │
  │  POST /auth/register               │
  │  { email, username, password }      │
  │ ──────────────────────────────────► │
  │                                    │
  │    1. Pydantic validates input     │
  │    2. Check email/username unique  │
  │    3. bcrypt.hashpw(password)      │
  │    4. INSERT INTO users            │
  │    5. generate JWT(user.id)        │
  │                                    │
  │  ◄────────────────────────────────  │
  │  200 { access_token, token_type }   │
```

### 3.2 Login
```
Client                              Server
  │                                    │
  │  POST /auth/login                  │
  │  { email, password }               │
  │ ──────────────────────────────────► │
  │                                    │
  │    1. SELECT user WHERE email=?    │
  │    2. bcrypt.checkpw(password)     │
  │    3. generate JWT(user.id)        │
  │                                    │
  │  ◄────────────────────────────────  │
  │  200 { access_token, token_type }   │
```

### 3.3 Token Validation (GET /auth/me)
```
Client                              Server
  │                                    │
  │  GET /auth/me                      │
  │  Authorization: Bearer <JWT>       │
  │ ──────────────────────────────────► │
  │                                    │
  │    1. HTTPBearer extracts token    │
  │    2. jwt.decode(token)            │
  │    3. Extract sub → user_id        │
  │    4. SELECT user WHERE id=?       │
  │                                    │
  │  ◄────────────────────────────────  │
  │  200 { user_id, email, username,   │
  │        has_seen_walkthrough }       │
```

### 3.4 Dashboard
```
Client                              Server
  │                                    │
  │  GET /dashboard                    │
  │  Authorization: Bearer <JWT>       │
  │ ──────────────────────────────────► │
  │                                    │
  │    1. decode JWT → user_id         │
  │    2. SELECT sessions WHERE user=? │
  │    3. Compute stats + streak       │
  │    4. Check/award milestones       │
  │                                    │
  │  ◄────────────────────────────────  │
  │  200 { total_time_hours, streak,   │
  │        mastery, milestones,        │
  │        categorized_sessions }      │
```

---

## 4. API Contracts

### POST /auth/register

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Path** | `/auth/register` |
| **Auth** | None |
| **Request Body** | `{ "email": "user@example.com", "username": "string (3-100 chars)", "password": "string (8-128 chars)" }` |
| **Success** | `200` → `{ "access_token": "eyJ...", "token_type": "bearer" }` |
| **Errors** | `400` → Duplicate email/username · `422` → Validation (bad email, short password) |

### POST /auth/login

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Path** | `/auth/login` |
| **Auth** | None |
| **Request Body** | `{ "email": "user@example.com", "password": "string (8-128 chars)" }` |
| **Success** | `200` → `{ "access_token": "eyJ...", "token_type": "bearer" }` |
| **Errors** | `401` → Invalid credentials · `422` → Validation |

### GET /auth/me

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **Path** | `/auth/me` |
| **Auth** | `Authorization: Bearer <JWT>` |
| **Request Body** | None |
| **Success** | `200` → `{ "user_id": 1, "email": "...", "username": "...", "has_seen_walkthrough": false }` |
| **Errors** | `401` → Invalid/expired token · `403` → Missing auth header · `404` → User deleted |

### PATCH /auth/onboarding_complete

| Field | Value |
|-------|-------|
| **Method** | `PATCH` |
| **Path** | `/auth/onboarding_complete` |
| **Auth** | `Authorization: Bearer <JWT>` |
| **Request Body** | None |
| **Success** | `200` → `{ "user_id": 1, "email": "...", "username": "...", "has_seen_walkthrough": true }` |
| **Errors** | `401` → Invalid/expired token · `403` → Missing auth header · `404` → User deleted |

### GET /dashboard

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **Path** | `/dashboard` |
| **Auth** | `Authorization: Bearer <JWT>` |
| **Query Params** | `?timezone=UTC` (optional, default `UTC`) |
| **Success** | `200` → `{ "total_time_hours": 0.0, "current_streak_days": 0, "average_mastery_percentage": 0.0, "unlocked_milestones": [], "categorized_sessions": { "mastered": 0, "needs_review": 0, "in_progress": 0 } }` |
| **Errors** | `400` → Invalid timezone · `401` → Invalid/expired token · `403` → Missing auth header |

---

## 5. Test Scenarios

### Success Cases (All Verified ✅)

| # | Scenario | Endpoint | Status | Result |
|---|----------|----------|--------|--------|
| 1 | Register new user | `POST /auth/register` | 200 | JWT returned |
| 2 | Login with correct creds | `POST /auth/login` | 200 | JWT returned |
| 3 | Fetch user profile | `GET /auth/me` | 200 | User data returned |
| 4 | Dashboard (new user, no data) | `GET /dashboard` | 200 | All zeros/empty |
| 5 | Mark onboarding complete | `PATCH /auth/onboarding_complete` | 200 | `has_seen_walkthrough: true` |
| 6 | Verify onboarding persisted | `GET /auth/me` | 200 | `has_seen_walkthrough: true` |

### Error Cases (All Verified ✅)

| # | Scenario | Endpoint | Status | Detail |
|---|----------|----------|--------|--------|
| 1 | Duplicate email/username | `POST /auth/register` | 400 | "Email or username already exists." |
| 2 | Wrong password | `POST /auth/login` | 401 | "Invalid credentials." |
| 3 | Invalid JWT | `GET /auth/me` | 401 | "Invalid or expired token." |
| 4 | Missing auth header | `GET /dashboard` | 403 | "Not authenticated" |
| 5 | Invalid timezone | `GET /dashboard?timezone=INVALID` | 400 | "Invalid timezone: INVALID" |
| 6 | Short password | `POST /auth/register` | 422 | "String should have at least 8 characters" |
| 7 | Invalid email format | `POST /auth/register` | 422 | "value is not a valid email address" |

---

## 6. Frontend Trigger Mapping

| Frontend Action | File | Endpoint | Method | Body | On Success |
|----------------|------|----------|--------|------|------------|
| "Create Account" button | `auth.js` | `/auth/register` | POST | `{ email, username, password }` | Store token → redirect to `dashboard.html` |
| "Sign In" button | `auth.js` | `/auth/login` | POST | `{ email, password }` | Store token → redirect to `dashboard.html` |
| Dashboard page load | `dashboard.js` | `/auth/me` | GET | — | Validate token, get `username`, check `has_seen_walkthrough` |
| Dashboard page load | `dashboard.js` | `/dashboard` | GET | — | Render stats, milestones, session counts |
| Walkthrough "Got it!" | `dashboard.js` | `/auth/onboarding_complete` | PATCH | — | Set `has_seen_walkthrough = true`, hide modal |
| Any protected page load | `apiClient.js` | (via Bearer header) | — | — | Auto-attach `Authorization: Bearer <token>` |

### Token Lifecycle (Frontend)

```
Register/Login → response.access_token
  → localStorage.setItem('learnback_token', token)
  → window.location.href = 'dashboard.html'

Dashboard load → localStorage.getItem('learnback_token')
  → GET /auth/me (validates token)
  → GET /dashboard (loads stats)

On 401 → localStorage.removeItem('learnback_token')
  → redirect to auth.html
```

---

## 7. Final Status

### Checklist

- [x] `POST /auth/register` — works end-to-end
- [x] `POST /auth/login` — works end-to-end
- [x] `GET /auth/me` — works end-to-end (NEW)
- [x] `PATCH /auth/onboarding_complete` — works end-to-end (NEW)
- [x] `GET /dashboard` — works end-to-end
- [x] JWT secret enforced (no hardcoded fallback)
- [x] Token decode handles malformed `sub` safely
- [x] Invalid timezone returns 400 (not 500)
- [x] Shared auth dependency (`deps.py`) eliminates duplication
- [x] All edge cases return correct HTTP status codes
- [x] No server crashes on any tested input

### Ready for Frontend Integration: **Yes**

All 4 auth endpoints and the dashboard endpoint are stable, tested, and
documented. The frontend (`auth.js`, `dashboard.js`, `apiClient.js`) can
wire directly to these contracts without backend modifications.

---

## 8. Phase 1B — Frontend Integration Fixes (Live Browser Testing)

> **Date**: 2026-04-24
> **Testing Method**: Live browser test via Live Server (127.0.0.1:5500)
> **Backend**: Uvicorn on 127.0.0.1:8002

### 8.1 Issues Found During Live Testing

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | Registration success checkmark SVG was oversized — no width/height constraint | 🟡 UI | `styles/pages/auth.css` |
| 2 | Walkthrough "Got it!" button did not dismiss the modal | 🔴 Functional | `dashboard.js` |

### 8.2 Fixes Applied

#### Fix 1: Success Banner SVG — `styles/pages/auth.css`

**Problem**: The `.auth-success-banner` had no SVG size rule, unlike the `.auth-error-banner` which constrains its SVG to 18×18px. The checkmark SVG rendered at full viewBox size, appearing disproportionately large.

**Fix**: Added matching CSS rule:
```css
.auth-success-banner svg {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
```

#### Fix 2: Walkthrough Modal — `dashboard.js`

**Problem**: The "Got it!" button was calling `/api/auth/onboarding_complete` (with extra `/api` prefix), but the backend route is `/auth/onboarding_complete`. The PATCH request returned 404, the error was silently caught, and the `overlay.remove()` never executed because the old code had a `return` on error.

**Decision**: Per user directive, the entire walkthrough/user manual feature was **removed** from `dashboard.js`. It will be re-implemented carefully in a later phase with proper design and testing.

**Code removed**:
- `showUserManual()` function (66 lines of inline DOM creation)
- `if (me.has_seen_walkthrough === false) showUserManual()` trigger in `validateSession()`

**Backend endpoints preserved**: `GET /auth/me` and `PATCH /auth/onboarding_complete` remain in the backend, ready for future walkthrough implementation.

#### Fix 3 (Prior): Dashboard Response Mapping — `dashboard.js`

**Problem**: `loadDashboardState()` expected `{ user: {...}, sessions: [...] }` but the backend returns `{ total_time_hours, current_streak_days, ... }`. The guard check always failed, causing the backend data to be ignored.

**Fix**: Added a mapping layer in `loadDashboardState()` that converts the flat `DashboardResponse` into the internal `{ user, badges, sessions, categorized }` shape.

#### Fix 4 (Prior): User Profile on Login — `auth.js`

**Problem**: `storeAuth()` stored `{ user_id: undefined, username: undefined }` because `TokenResponse` doesn't include these fields.

**Fix**: After login, `auth.js` now calls `GET /auth/me` with the fresh token to fetch real user data before storing to localStorage.

### 8.3 Files Modified (Phase 1B)

| File | Change |
|------|--------|
| `frontend/styles/pages/auth.css` | Added `.auth-success-banner svg` size constraint (18×18px) |
| `frontend/dashboard.js` | Removed `showUserManual()` + trigger · Fixed `loadDashboardState()` response mapping |
| `frontend/auth.js` | Added `apiGet()` helper · Login/register now fetch `/auth/me` for real user data |

### 8.4 Live Test Results

| Step | Action | Result |
|------|--------|--------|
| 1 | Open `auth.html` | Auth page loads, login view active |
| 2 | Click "Create one" | Register view shown |
| 3 | Fill username + email + password | Fields accept input |
| 4 | Click "Create account" | Success banner appears with **properly sized** checkmark |
| 5 | Auto-login + redirect | Redirected to `dashboard.html` within ~1s |
| 6 | Dashboard loads | Stats render (zeros for new user), **no walkthrough modal** |
| 7 | Refresh dashboard | Token persists, dashboard reloads, username displayed |
| 8 | Click "Sign In" (after logout) | Login succeeds, redirect to dashboard |

### 8.5 Current Auth Flow Status

```
Register → Token → GET /auth/me → Store user data → Redirect to Dashboard ✅
Login    → Token → GET /auth/me → Store user data → Redirect to Dashboard ✅
Dashboard Load → Auth guard → GET /dashboard → Render stats              ✅
Dashboard Load → GET /auth/me → Update username display                  ✅
Page Refresh   → Token persists → Dashboard reloads                      ✅
Logout         → Clear token → Redirect to auth.html                     ✅
```

---

## 9. Deferred Features

| Feature | Status | Notes |
|---------|--------|-------|
| Walkthrough/Onboarding modal | 🔜 Deferred | Removed from dashboard.js. Backend `PATCH /auth/onboarding_complete` endpoint is ready. Will be re-implemented with proper design in a future phase. |
| `has_seen_walkthrough` column | ✅ Active | Column exists in DB, backend reads/writes it correctly. Currently unused by frontend. |
