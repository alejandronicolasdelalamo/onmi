from datetime import date
from datetime import date as Date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]

MoodLiteral = Literal["happy", "love", "neutral", "mad", "sad"]
StatusLiteral = Literal["todo", "in_progress", "done"]
PriorityLiteral = Literal["low", "medium", "high"]
LocaleLiteral = Literal["en", "es"]


class Base(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---- auth -----------------------------------------------------------------
class RegisterIn(Base):
    name: Name
    email: EmailStr
    password: Password

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if v.isalpha() or v.isdigit():
            raise ValueError("Password must mix letters and numbers")
        return v


class LoginIn(Base):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailIn(Base):
    email: EmailStr


class TokenIn(Base):
    token: str = Field(min_length=10, max_length=200)


class ResetPasswordIn(TokenIn):
    password: Password


class ChangePasswordIn(Base):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class GoogleIn(Base):
    credential: str = Field(min_length=10)


class ProfileIn(Base):
    name: Name | None = None
    ai_coach_enabled: bool | None = None
    avatar: str | None = Field(default=None, max_length=32)
    locale: LocaleLiteral | None = None


# ---- recursos --------------------------------------------------------------
class NoteIn(Base):
    title: str = Field(min_length=1, max_length=150)
    content: str = Field(default="", max_length=20000)
    tags: list[Tag] = Field(default_factory=list, max_length=10)
    pinned: bool = False
    project_id: int | None = None
    goal_id: int | None = None


class NoteUpdate(Base):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    content: str | None = Field(default=None, max_length=20000)
    tags: list[Tag] | None = Field(default=None, max_length=10)
    pinned: bool | None = None
    project_id: int | None = None
    goal_id: int | None = None


class ProjectIn(Base):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=5000)
    category: str | None = Field(default=None, max_length=60)
    status: StatusLiteral = "todo"
    priority: PriorityLiteral = "medium"
    due_date: date | None = None


class ProjectUpdate(Base):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None, max_length=60)
    status: StatusLiteral | None = None
    priority: PriorityLiteral | None = None
    due_date: date | None = None
    position: int | None = Field(default=None, ge=0)


class GoalIn(Base):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    due_date: date | None = None
    project_id: int | None = None


class GoalUpdate(Base):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    due_date: date | None = None
    project_id: int | None = None
    done: bool | None = None


ReminderTime = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class HabitIn(Base):
    name: str = Field(min_length=1, max_length=100)
    shared: bool = False
    target_per_week: int = Field(default=7, ge=1, le=7)
    reminder_time: ReminderTime | None = None
    description: str = Field(default="", max_length=500)
    category: str | None = Field(default=None, max_length=60)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")
    goal_id: int | None = None


class HabitUpdate(Base):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    shared: bool | None = None
    target_per_week: int | None = Field(default=None, ge=1, le=7)
    reminder_time: ReminderTime | None = None
    description: str | None = Field(default=None, max_length=500)
    category: str | None = Field(default=None, max_length=60)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    goal_id: int | None = None
    archived: bool | None = None


class ToggleIn(Base):
    date: Date | None = None


class MoodIn(Base):
    mood: MoodLiteral
    note: str = Field(default="", max_length=300)
    date: Date | None = None


class PomodoroIn(Base):
    kind: Literal["work", "break"] = "work"
    duration_seconds: int = Field(ge=1, le=4 * 3600)
    completed: bool = True
    project_id: int | None = None


class AdminUserUpdate(Base):
    role: Literal["user", "admin"] | None = None
    is_active: bool | None = None


class PushKeys(Base):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=6, max_length=100)


class PushSubscribeIn(Base):
    endpoint: str = Field(min_length=10, max_length=600, pattern=r"^https://")
    keys: PushKeys
    timezone: str = Field(default="UTC", min_length=1, max_length=64)


class PushUnsubscribeIn(Base):
    endpoint: str = Field(min_length=10, max_length=600)


class CoachGenerateIn(Base):
    refresh: bool = False


class BuddyRequestIn(Base):
    code: str = Field(min_length=4, max_length=20)


class CheerIn(Base):
    habit_id: int | None = None
