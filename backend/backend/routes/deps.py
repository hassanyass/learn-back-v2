"""Shared FastAPI dependencies for route-level auth resolution.

Centralizes the bearer-token → user_id extraction that was previously
duplicated across every router module.
"""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.services.auth_service import AuthService

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> int:
    """Extract and validate user_id from the Authorization bearer token."""
    auth_service = AuthService(db)
    return auth_service.decode_token(credentials.credentials)
