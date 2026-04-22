from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.schemas.api_schemas import DashboardResponse
from backend.services.auth_service import AuthService
from backend.services.dashboard_service import DashboardService


router = APIRouter(prefix="/dashboard", tags=["dashboard"])
bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> int:
    auth_service = AuthService(db)
    return auth_service.decode_token(credentials.credentials)


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    timezone: str = Query(default="UTC"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    dashboard_service = DashboardService(db)
    return await dashboard_service.get_dashboard(user_id=user_id, user_timezone=timezone)
