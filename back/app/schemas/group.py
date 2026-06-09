import uuid
from datetime import datetime

from pydantic import BaseModel


class GroupCreate(BaseModel):
    name: str


class GroupUpdate(BaseModel):
    name: str


class GroupSchema(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    student_count: int = 0

    model_config = {"from_attributes": True}
