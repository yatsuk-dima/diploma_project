import csv
import io
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.dependencies import require_instructor
from app.models.discipline import Discipline
from app.models.user import User
from app.schemas.user import BulkCreateResult, PaginatedUsers, SkippedEntry, UserCreate, UserSchema, UserUpdate
from app.services.auth_service import hash_password, revoke_all_tokens

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_schema(user: User) -> UserSchema:
    return UserSchema(
        id=user.id,
        full_name=user.full_name,
        login=user.login,
        role=user.role,
        group_id=user.group_id,
        group_name=user.group.name if user.group else None,
        discipline_ids=[d.id for d in user.disciplines],
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.get("", response_model=PaginatedUsers)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
    role: str | None = Query(None),
    group_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> PaginatedUsers:
    filters = [User.is_active.is_(True)]
    if role:
        filters.append(User.role == role)
    if group_id:
        filters.append(User.group_id == group_id)

    total = (await db.execute(select(func.count(User.id)).where(*filters))).scalar_one()
    items = (
        await db.execute(
            select(User).where(*filters)
            .options(selectinload(User.disciplines), selectinload(User.group))
            .offset((page - 1) * per_page).limit(per_page)
        )
    ).scalars().all()

    return PaginatedUsers(items=[_user_schema(u) for u in items], total=total, page=page, per_page=per_page)


@router.post("", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> UserSchema:
    if (await db.execute(select(User).where(User.login == body.login))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Login already exists")

    user = User(
        id=uuid.uuid4(),
        full_name=body.full_name,
        login=body.login,
        password_hash=hash_password(body.password),
        role=body.role,
        group_id=body.group_id,
    )
    db.add(user)
    await db.flush()

    if body.discipline_ids:
        discs = (await db.execute(
            select(Discipline).where(Discipline.id.in_(body.discipline_ids))
        )).scalars().all()
        user.disciplines = list(discs)

    await db.commit()
    await db.refresh(user)
    await db.execute(select(User).where(User.id == user.id).options(selectinload(User.disciplines)))
    user_with_discs = (await db.execute(
        select(User).where(User.id == user.id).options(selectinload(User.disciplines), selectinload(User.group))
    )).scalar_one()
    return _user_schema(user_with_discs)


@router.put("/{user_id}", response_model=UserSchema)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> UserSchema:
    user = (await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.disciplines))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.full_name is not None:
        user.full_name = body.full_name

    if body.login is not None:
        clash = (
            await db.execute(select(User).where(User.login == body.login, User.id != user_id))
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Login already exists")
        user.login = body.login

    if body.password is not None:
        user.password_hash = hash_password(body.password)
        await revoke_all_tokens(user.id, db)

    if "group_id" in body.model_fields_set:
        user.group_id = body.group_id

    if "discipline_ids" in body.model_fields_set and body.discipline_ids is not None:
        discs = (await db.execute(
            select(Discipline).where(Discipline.id.in_(body.discipline_ids))
        )).scalars().all()
        user.disciplines = list(discs)

    if body.is_active is not None:
        user.is_active = body.is_active
        if not body.is_active:
            await revoke_all_tokens(user.id, db)

    await db.commit()
    user_with_discs = (await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.disciplines), selectinload(User.group))
    )).scalar_one()
    return _user_schema(user_with_discs)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> None:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    await revoke_all_tokens(user.id, db)
    await db.commit()


@router.post("/bulk", response_model=BulkCreateResult)
async def bulk_create_users(
    file: UploadFile,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> BulkCreateResult:
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8")))

    created = 0
    skipped: list[SkippedEntry] = []

    for row in reader:
        login = row.get("login", "").strip()
        if not login:
            continue

        if (await db.execute(select(User).where(User.login == login))).scalar_one_or_none():
            skipped.append(SkippedEntry(login=login, reason="login already exists"))
            continue

        group_id: uuid.UUID | None = None
        raw_gid = row.get("group_id", "").strip()
        if raw_gid:
            try:
                group_id = uuid.UUID(raw_gid)
            except ValueError:
                skipped.append(SkippedEntry(login=login, reason=f"invalid group_id: {raw_gid}"))
                continue

        role = row.get("role", "student").strip()
        if role not in ("instructor", "student"):
            skipped.append(SkippedEntry(login=login, reason=f"invalid role: {role}"))
            continue

        db.add(
            User(
                id=uuid.uuid4(),
                full_name=row.get("full_name", "").strip(),
                login=login,
                password_hash=hash_password(row.get("password", "").strip()),
                role=role,
                group_id=group_id,
            )
        )
        created += 1

    await db.commit()
    return BulkCreateResult(created=created, skipped=skipped)
