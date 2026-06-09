import uuid
from datetime import datetime

from pydantic import BaseModel


class DisciplineCreate(BaseModel):
    name: str
    short_name: str | None = None
    description: str | None = None


class DisciplineUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    description: str | None = None


class DisciplineSchema(BaseModel):
    id: uuid.UUID
    name: str
    short_name: str | None = None
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DisciplineWithGroups(DisciplineSchema):
    group_ids: list[uuid.UUID] = []
