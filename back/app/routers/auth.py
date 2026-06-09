from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_user
from app.limiter import limiter
from sqlalchemy.orm import selectinload
from app.models.group import Group
from app.models.user import User
from app.schemas.auth import LoginRequest, LogoutRequest, RefreshRequest, TokenResponse
from app.schemas.user import UserMeSchema
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> TokenResponse:
    result = await db.execute(
        select(User).where(User.login == body.login, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token(str(user.id), user.role)
    refresh_token = await create_refresh_token(user.id, db)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> TokenResponse:
    try:
        access_token, new_refresh = await rotate_refresh_token(body.refresh_token, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: LogoutRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    await revoke_refresh_token(body.refresh_token, db)


@router.get("/me", response_model=UserMeSchema)
async def me(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> UserMeSchema:
    group_name: str | None = None
    if current_user.group_id:
        group = (await db.execute(select(Group).where(Group.id == current_user.group_id))).scalar_one_or_none()
        if group:
            group_name = group.name

    user_with_discs = (await db.execute(
        select(User).where(User.id == current_user.id).options(selectinload(User.disciplines))
    )).scalar_one()

    discipline_ids = [d.id for d in user_with_discs.disciplines]
    discipline_name: str | None = None
    if user_with_discs.disciplines:
        discipline_name = ", ".join(d.name for d in user_with_discs.disciplines)

    return UserMeSchema(
        id=current_user.id,
        full_name=current_user.full_name,
        login=current_user.login,
        role=current_user.role,
        group_id=current_user.group_id,
        group_name=group_name,
        discipline_ids=discipline_ids,
        discipline_name=discipline_name,
    )
