from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.routes.deps import get_current_user_id
from backend.schemas.api_schemas import DashboardResponse
from backend.services.dashboard_service import DashboardService


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    timezone: str = Query(default="UTC"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    dashboard_service = DashboardService(db)
    return await dashboard_service.get_dashboard(user_id=user_id, user_timezone=timezone)
