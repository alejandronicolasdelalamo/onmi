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
    bio: str | None = Field(default=None, max_length=160)
    locale: LocaleLiteral | None = None


# ---- recursos --------------------------------------------------------------
class NoteIn(Base):
    title: str = Field(min_length=1, max_length=150)
    content: str = Field(default="", max_length=20000)
    tags: list[Tag] = Field(default_factory=list, max_length=10)
    pinned: bool = False
    locked: bool = False
    # Lo marca el cliente al reenviar una nota guardada sin conexión: evita duplicados si el primer intento sí llegó.
    queued: bool = False
    project_id: int | None = None
    goal_id: int | None = None


class NoteUpdate(Base):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    content: str | None = Field(default=None, max_length=20000)
    tags: list[Tag] | None = Field(default=None, max_length=10)
    pinned: bool | None = None
    locked: bool | None = None
    project_id: int | None = None
    goal_id: int | None = None


class NotesPasswordIn(Base):
    """Contraseña de las notas ocultas (independiente de la de la cuenta)."""

    password: Annotated[str, StringConstraints(min_length=4, max_length=128)]


class NotesPasswordChangeIn(Base):
    new_password: Annotated[str, StringConstraints(min_length=4, max_length=128)]
    # La contraseña de notas actual o, si se olvidó, la de la cuenta.
    current_password: str = Field(min_length=1, max_length=128)


class NotesPasswordRemoveIn(Base):
    current_password: str = Field(min_length=1, max_length=128)


class MilestoneIn(Base):
    title: str = Field(min_length=1, max_length=160)


class MilestoneUpdate(Base):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    done: bool | None = None


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
    shared: bool = False


class GoalUpdate(Base):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    due_date: date | None = None
    project_id: int | None = None
    done: bool | None = None
    shared: bool | None = None


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


MOOD_TAGS = (
    "sleep",
    "work",
    "study",
    "family",
    "friends",
    "partner",
    "exercise",
    "health",
    "food",
    "weather",
    "money",
    "hobby",
)
MoodTagLiteral = Literal[
    "sleep", "work", "study", "family", "friends", "partner", "exercise", "health", "food", "weather", "money", "hobby"
]


class MoodIn(Base):
    mood: MoodLiteral
    note: str = Field(default="", max_length=300)
    date: Date | None = None
    tags: list[MoodTagLiteral] = Field(default_factory=list, max_length=6)


class PomodoroIn(Base):
    kind: Literal["work", "break"] = "work"
    duration_seconds: int = Field(ge=1, le=4 * 3600)
    completed: bool = True
    project_id: int | None = None


class FocusIn(Base):
    # Lo que queda de la sesión de enfoque; con margen sobre el máximo de 120 min.
    seconds: int = Field(ge=1, le=125 * 60)


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


RepeatLiteral = Literal["none", "daily", "weekdays", "weekly_count"]
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class FieldError(ValueError):
    """Regla que cruza campos rota; `field` dice a qué campo mostrarle el error al usuario."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field


class CalendarEventIn(Base):
    title: str = Field(min_length=1, max_length=120)
    notes: str = Field(default="", max_length=1000)
    color: HexColor = "#6366f1"
    start_date: date
    start_time: ReminderTime | None = None  # None = todo el día
    duration_min: int | None = Field(default=None, ge=1, le=1440)
    repeat: RepeatLiteral = "none"
    weekdays: list[int] = Field(default_factory=list, max_length=7)  # 0 = lunes … 6 = domingo
    per_week: int | None = Field(default=None, ge=1, le=7)
    every_weeks: int = Field(default=1, ge=1, le=4)
    until: date | None = None
    calendar_id: int | None = None  # None = el calendario Personal (privado)

    @field_validator("weekdays")
    @classmethod
    def _valid_weekdays(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("weekdays must be between 0 (Monday) and 6 (Sunday)")
        return sorted(set(v))

    def check(self) -> "CalendarEventIn":
        """Reglas que cruzan campos (se llama tras validar; también en PATCH con el evento ya fusionado)."""
        if self.repeat == "weekdays" and not self.weekdays:
            raise FieldError("weekdays", "Pick at least one weekday")
        if self.repeat == "weekly_count" and self.per_week is None:
            raise FieldError("per_week", "per_week is required for weekly_count")
        # Sin repetición la fecha final no se usa (se descarta al guardar), así que no puede bloquear el evento.
        if self.repeat != "none" and self.until and self.until < self.start_date:
            raise FieldError("until", "The end date cannot be before the start date")
        if self.duration_min and not self.start_time:
            raise FieldError("duration_min", "duration_min needs start_time")
        return self


class CalendarEventUpdate(Base):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    color: HexColor | None = None
    start_date: date | None = None
    start_time: ReminderTime | None = None
    duration_min: int | None = Field(default=None, ge=1, le=1440)
    repeat: RepeatLiteral | None = None
    weekdays: list[int] | None = Field(default=None, max_length=7)
    per_week: int | None = Field(default=None, ge=1, le=7)
    every_weeks: int | None = Field(default=None, ge=1, le=4)
    until: date | None = None
    shared: bool | None = None


class EventDayIn(Base):
    status: Literal["done", "skipped"] | None = None


class CalendarSharingIn(Base):
    user_ids: list[int] = Field(max_length=100)


class CalendarIn(Base):
    name: str = Field(min_length=1, max_length=60)
    color: HexColor = "#6366f1"
    user_ids: list[int] = Field(default_factory=list, max_length=100)


class CalendarPatch(Base):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: HexColor | None = None
    user_ids: list[int] | None = Field(default=None, max_length=100)
