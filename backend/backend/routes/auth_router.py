from pydantic import BaseModel, EmailStr, Field
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.schemas.api_schemas import TokenResponse
from backend.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


@router.post("/register", response_model=TokenResponse)
async def register_user(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    auth_service = AuthService(db)
    user = await auth_service.register_user(
        email=payload.email,
        username=payload.username,
        password=payload.password,
    )
    access_token = auth_service.generate_access_token(user.id)
    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
async def login_user(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    auth_service = AuthService(db)
    access_token = await auth_service.authenticate_user(
        email=payload.email,
        password=payload.password,
    )
    return TokenResponse(access_token=access_token)
