from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.core import LearningSession, UserMilestone
from backend.schemas.api_schemas import CategorizedSessions, DashboardResponse


class DashboardService:
    MILESTONES = (
        "FIRST_SESSION",
        "WEEK_STREAK",
        "DEDICATED_TEACHER",
        "MASTERY_PATH",
        "FINISH_25_SESSIONS",
    )

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_dashboard(self, user_id: int, user_timezone: str) -> DashboardResponse:
        timezone_info = ZoneInfo(user_timezone)
        stmt = select(LearningSession).where(LearningSession.user_id == user_id)
        sessions = list((await self.db.execute(stmt)).scalars().all())

        completed_sessions = [s for s in sessions if s.status == "completed"]
        in_progress_count = sum(1 for s in sessions if s.status == "in_progress")
        mastered_count = sum(
            1 for s in completed_sessions if (s.bkt_score or 0.0) >= 0.90
        )
        needs_review_count = sum(
            1 for s in completed_sessions if (s.bkt_score or 0.0) < 0.90
        )

        total_seconds = 0.0
        for session in completed_sessions:
            if session.start_time and session.end_time and session.end_time > session.start_time:
                total_seconds += (session.end_time - session.start_time).total_seconds()

        average_mastery = (
            (
                sum((s.bkt_score or 0.0) for s in completed_sessions)
                / len(completed_sessions)
            )
            * 100.0
            if completed_sessions
            else 0.0
        )

        current_streak = self._calculate_streak(completed_sessions, timezone_info)
        unlocked_milestones = await self._unlock_new_milestones(
            user_id=user_id,
            completed_sessions=completed_sessions,
            current_streak=current_streak,
            average_mastery=average_mastery,
        )

        return DashboardResponse(
            total_time_hours=round(total_seconds / 3600.0, 2),
            current_streak_days=current_streak,
            average_mastery_percentage=round(average_mastery, 2),
            unlocked_milestones=unlocked_milestones,
            categorized_sessions=CategorizedSessions(
                mastered=mastered_count,
                needs_review=needs_review_count,
                in_progress=in_progress_count,
            ),
        )

    def _calculate_streak(
        self, completed_sessions: list[LearningSession], tz: ZoneInfo
    ) -> int:
        completion_dates = set()
        for session in completed_sessions:
            if session.end_time is None:
                continue
            dt = session.end_time
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            completion_dates.add(dt.astimezone(tz).date())

        if not completion_dates:
            return 0

        today = datetime.now(tz).date()
        streak = 0
        check_day = today
        while check_day in completion_dates:
            streak += 1
            check_day = check_day.fromordinal(check_day.toordinal() - 1)
        return streak

    async def _unlock_new_milestones(
        self,
        user_id: int,
        completed_sessions: list[LearningSession],
        current_streak: int,
        average_mastery: float,
    ) -> list[str]:
        existing_stmt = select(UserMilestone).where(UserMilestone.user_id == user_id)
        existing = list((await self.db.execute(existing_stmt)).scalars().all())
        existing_codes = {m.milestone_code for m in existing}

        completed_count = len(completed_sessions)
        unlocked_now: list[str] = []

        candidates = {
            "FIRST_SESSION": completed_count >= 1,
            "WEEK_STREAK": current_streak >= 7,
            "DEDICATED_TEACHER": completed_count >= 10,
            "MASTERY_PATH": average_mastery >= 90.0,
            "FINISH_25_SESSIONS": completed_count >= 25,
        }

        for code in self.MILESTONES:
            if candidates.get(code, False) and code not in existing_codes:
                self.db.add(UserMilestone(user_id=user_id, milestone_code=code))
                unlocked_now.append(code)

        if unlocked_now:
            await self.db.commit()

        all_codes = sorted(existing_codes.union(unlocked_now))
        return all_codes
