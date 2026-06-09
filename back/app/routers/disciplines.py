import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.dependencies import get_current_user, require_admin
from app.models.discipline import Discipline, group_disciplines
from app.models.group import Group
from app.models.user import User
from app.schemas.user import UserSchema
from app.schemas.discipline import DisciplineCreate, DisciplineSchema, DisciplineUpdate, DisciplineWithGroups

router = APIRouter(prefix="/api/disciplines", tags=["disciplines"])


async def _get_or_404(disc_id: uuid.UUID, db: AsyncSession) -> Discipline:
    d = (await db.execute(
        select(Discipline).where(Discipline.id == disc_id).options(selectinload(Discipline.groups))
    )).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discipline not found")
    return d


# ---------------------------------------------------------------------------
# GET /api/disciplines  — all users can list; students see only their own
# ---------------------------------------------------------------------------

@router.get("", response_model=list[DisciplineWithGroups])
async def list_disciplines(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[DisciplineWithGroups]:
    if current_user.role == "student":
        if not current_user.group_id:
            return []
        rows = (await db.execute(
            select(Discipline)
            .join(group_disciplines, group_disciplines.c.discipline_id == Discipline.id)
            .where(group_disciplines.c.group_id == current_user.group_id)
            .options(selectinload(Discipline.groups))
        )).scalars().all()
    elif current_user.role == "instructor":
        rows = (await db.execute(
            select(Discipline)
            .join(Discipline.instructors)
            .where(User.id == current_user.id)
            .options(selectinload(Discipline.groups))
        )).scalars().all()
        if not rows:
            return []
    else:
        rows = (await db.execute(
            select(Discipline).options(selectinload(Discipline.groups))
        )).scalars().all()

    return [
        DisciplineWithGroups(
            id=d.id, name=d.name, short_name=d.short_name, description=d.description, created_at=d.created_at,
            group_ids=[g.id for g in d.groups],
        )
        for d in rows
    ]


# ---------------------------------------------------------------------------
# POST /api/disciplines  — admin only
# ---------------------------------------------------------------------------

@router.post("", response_model=DisciplineSchema, status_code=status.HTTP_201_CREATED)
async def create_discipline(
    body: DisciplineCreate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> DisciplineSchema:
    existing = (await db.execute(select(Discipline).where(Discipline.name == body.name))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Discipline with this name already exists")
    d = Discipline(id=uuid.uuid4(), name=body.name, short_name=body.short_name, description=body.description)
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


# ---------------------------------------------------------------------------
# PUT /api/disciplines/{id}  — admin only
# ---------------------------------------------------------------------------

@router.put("/{disc_id}", response_model=DisciplineSchema)
async def update_discipline(
    disc_id: uuid.UUID,
    body: DisciplineUpdate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> DisciplineSchema:
    d = await _get_or_404(disc_id, db)
    if body.name is not None:
        d.name = body.name
    if body.short_name is not None:
        d.short_name = body.short_name
    if body.description is not None:
        d.description = body.description
    await db.commit()
    await db.refresh(d)
    return d


# ---------------------------------------------------------------------------
# DELETE /api/disciplines/{id}  — admin only
# ---------------------------------------------------------------------------

@router.delete("/{disc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discipline(
    disc_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    d = await _get_or_404(disc_id, db)
    await db.delete(d)
    await db.commit()


# ---------------------------------------------------------------------------
# POST /api/disciplines/{id}/groups  — assign group to discipline (admin)
# ---------------------------------------------------------------------------

@router.post("/{disc_id}/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_group(
    disc_id: uuid.UUID,
    group_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    d = await _get_or_404(disc_id, db)
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if group not in d.groups:
        d.groups.append(group)
        await db.commit()


# ---------------------------------------------------------------------------
# DELETE /api/disciplines/{id}/groups/{group_id}  — remove group (admin)
# ---------------------------------------------------------------------------

@router.delete("/{disc_id}/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group(
    disc_id: uuid.UUID,
    group_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    d = await _get_or_404(disc_id, db)
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group and group in d.groups:
        d.groups.remove(group)
        await db.commit()


# ---------------------------------------------------------------------------
# POST /api/disciplines/{id}/instructors/{user_id}  — assign instructor (admin)
# ---------------------------------------------------------------------------

@router.post("/{disc_id}/instructors/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_instructor(
    disc_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    d = await _get_or_404(disc_id, db)
    instructor = (await db.execute(
        select(User).where(User.id == user_id, User.role == "instructor")
        .options(selectinload(User.disciplines))
    )).scalar_one_or_none()
    if not instructor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instructor not found")
    if d not in instructor.disciplines:
        instructor.disciplines.append(d)
        await db.commit()


# ---------------------------------------------------------------------------
# DELETE /api/disciplines/{id}/instructors/{user_id}  — remove instructor (admin)
# ---------------------------------------------------------------------------

@router.delete("/{disc_id}/instructors/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_instructor(
    disc_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    d = await _get_or_404(disc_id, db)
    instructor = (await db.execute(
        select(User).where(User.id == user_id)
        .options(selectinload(User.disciplines))
    )).scalar_one_or_none()
    if instructor and d in instructor.disciplines:
        instructor.disciplines.remove(d)
        await db.commit()
