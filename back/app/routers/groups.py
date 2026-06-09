import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import require_admin, require_instructor
from app.models.group import Group
from app.models.user import User
from app.schemas.group import GroupCreate, GroupSchema, GroupUpdate
from app.schemas.user import UserSchema

router = APIRouter(prefix="/api/groups", tags=["groups"])


async def _student_count(group_id: uuid.UUID, db: AsyncSession) -> int:
    return (
        await db.execute(
            select(func.count(User.id)).where(User.group_id == group_id, User.is_active.is_(True))
        )
    ).scalar_one()


@router.get("", response_model=list[GroupSchema])
async def list_groups(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> list[GroupSchema]:
    groups = (await db.execute(select(Group))).scalars().all()

    counts = dict(
        (await db.execute(
            select(User.group_id, func.count(User.id))
            .where(User.is_active.is_(True), User.group_id.isnot(None))
            .group_by(User.group_id)
        )).all()
    )

    return [
        GroupSchema(id=g.id, name=g.name, created_at=g.created_at, student_count=counts.get(g.id, 0))
        for g in groups
    ]


@router.post("", response_model=GroupSchema, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> GroupSchema:
    group = Group(id=uuid.uuid4(), name=body.name)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return GroupSchema(id=group.id, name=group.name, created_at=group.created_at, student_count=0)


@router.put("/{group_id}", response_model=GroupSchema)
async def update_group(
    group_id: uuid.UUID,
    body: GroupUpdate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> GroupSchema:
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    group.name = body.name
    await db.commit()
    await db.refresh(group)

    return GroupSchema(
        id=group.id,
        name=group.name,
        created_at=group.created_at,
        student_count=await _student_count(group_id, db),
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    # Unlink students from this group before deleting
    await db.execute(update(User).where(User.group_id == group_id).values(group_id=None))
    await db.delete(group)
    await db.commit()


@router.get("/{group_id}/students", response_model=list[UserSchema])
async def list_students(
    group_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> list[User]:
    if not (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    return (
        await db.execute(select(User).where(User.group_id == group_id, User.is_active.is_(True)))
    ).scalars().all()
