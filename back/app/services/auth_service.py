import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _hash_raw_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_refresh_token(user_id: uuid.UUID, db: AsyncSession) -> str:
    raw = secrets.token_hex(32)
    db_token = RefreshToken(
        user_id=user_id,
        token_hash=_hash_raw_token(raw),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(db_token)
    await db.commit()
    return raw


async def rotate_refresh_token(raw: str, db: AsyncSession) -> tuple[str, str]:
    """Revoke old token, issue new access + refresh pair. Returns (access_token, new_refresh_token)."""
    token_hash = _hash_raw_token(raw)

    result = await db.execute(
        select(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
        .with_for_update()
    )
    db_token = result.scalar_one_or_none()
    if not db_token:
        raise ValueError("Invalid or expired refresh token")

    db_token.revoked = True

    user_result = await db.execute(
        select(User).where(User.id == db_token.user_id, User.is_active.is_(True))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        await db.commit()
        raise ValueError("User not found or inactive")

    new_raw = secrets.token_hex(32)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_raw_token(new_raw),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    await db.commit()

    return create_access_token(str(user.id), user.role), new_raw


async def revoke_refresh_token(raw: str, db: AsyncSession) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == _hash_raw_token(raw))
        .values(revoked=True)
    )
    await db.commit()


async def revoke_all_tokens(user_id: uuid.UUID, db: AsyncSession) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    await db.commit()
