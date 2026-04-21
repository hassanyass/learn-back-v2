from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CategorizedSessions(BaseModel):
    mastered: int = 0
    needs_review: int = 0
    in_progress: int = 0


class DashboardResponse(BaseModel):
    total_time_hours: float = Field(default=0.0, ge=0.0)
    current_streak_days: int = Field(default=0, ge=0)
    average_mastery_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    unlocked_milestones: list[str] = Field(default_factory=list)
    categorized_sessions: CategorizedSessions = Field(default_factory=CategorizedSessions)
