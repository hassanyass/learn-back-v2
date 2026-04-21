# Auth and Dashboard Flow

## Auth Contract

- Auth endpoints return bearer JWT tokens.
- Frontend contract is localStorage token persistence (client concern).
- Backend validates bearer tokens and resolves `user_id`.

## Auth Service Responsibilities

- Register user (email/username uniqueness + password hashing).
- Authenticate user (credential validation).
- Generate and decode JWT.

## Dashboard Rules

- Total time: sum of `(end_time - start_time)` for completed sessions.
- Categories:
  - `in_progress`: status is `in_progress`
  - `mastered`: completed and `bkt_score >= 0.90`
  - `needs_review`: completed and `bkt_score < 0.90`

## Timezone-Aware Streak Rule

- Streak is calculated using user-provided timezone.
- A day counts only if at least one fully completed session exists for that calendar day.
- Multiple completed sessions on one day still count as one streak day.

## Milestone Policy

Current milestone set:

- `FIRST_SESSION`
- `WEEK_STREAK`
- `DEDICATED_TEACHER`
- `MASTERY_PATH` (>= 90% average mastery)
- `FINISH_25_SESSIONS`

Newly achieved milestones are persisted in `user_milestones`.
