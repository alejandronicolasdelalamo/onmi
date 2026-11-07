from __future__ import annotations

import enum
import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Role(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class MoodKind(str, enum.Enum):
    HAPPY = "happy"
    LOVE = "love"
    NEUTRAL = "neutral"
    MAD = "mad"
    SAD = "sad"


class ProjectStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class Priority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TokenKind(str, enum.Enum):
    VERIFY_EMAIL = "verify_email"
    RESET_PASSWORD = "reset_password"


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(default=Role.USER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    google_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    avatar: Mapped[str | None] = mapped_column(String(32))
    locale: Mapped[str] = mapped_column(String(5), default="en")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    notes: Mapped[list[Note]] = relationship(back_populates="user", cascade="all, delete-orphan")
    projects: Mapped[list[Project]] = relationship(back_populates="user", cascade="all, delete-orphan")
    goals: Mapped[list[Goal]] = relationship(back_populates="user", cascade="all, delete-orphan")
    habits: Mapped[list[Habit]] = relationship(back_populates="user", cascade="all, delete-orphan")
    moods: Mapped[list[MoodEntry]] = relationship(back_populates="user", cascade="all, delete-orphan")
    pomodoros: Mapped[list[PomodoroSession]] = relationship(back_populates="user", cascade="all, delete-orphan")
    tokens: Mapped[list[AuthToken]] = relationship(back_populates="user", cascade="all, delete-orphan")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return bool(self.password_hash) and check_password_hash(self.password_hash, password)

    @property
    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > _now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role.value,
            "avatar": self.avatar,
            "locale": self.locale,
            "email_verified": self.email_verified,
            "is_demo": self.is_demo,
            "has_password": bool(self.password_hash),
            "created_at": self.created_at.isoformat(),
        }

    def to_admin_dict(self) -> dict:
        return {
            **self.to_dict(),
            "is_active": self.is_active,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }


class AuthToken(db.Model):
    """Tokens de un solo uso (verificar email / resetear contraseña). Solo se guarda el hash."""

    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[TokenKind]
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates="tokens")

    @staticmethod
    def hash(raw: str) -> str:
        return hashlib.sha256(raw.encode()).hexdigest()

    @classmethod
    def issue(cls, user: User, kind: TokenKind, ttl: timedelta) -> str:
        """Invalida los anteriores del mismo tipo y devuelve el token en claro."""
        for old in db.session.scalars(db.select(cls).filter_by(user_id=user.id, kind=kind, used=False)):
            old.used = True
        raw = secrets.token_urlsafe(32)
        db.session.add(cls(user_id=user.id, kind=kind, token_hash=cls.hash(raw), expires_at=_now() + ttl))
        return raw

    @classmethod
    def consume(cls, raw: str, kind: TokenKind) -> User | None:
        tok = db.session.scalar(db.select(cls).filter_by(token_hash=cls.hash(raw), kind=kind))
        if tok is None or tok.used or tok.expires_at < _now():
            return None
        tok.used = True
        return tok.user


class Project(db.Model):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[ProjectStatus] = mapped_column(default=ProjectStatus.TODO)
    priority: Mapped[Priority] = mapped_column(default=Priority.MEDIUM)
    due_date: Mapped[date | None] = mapped_column(Date)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="projects")
    notes: Mapped[list[Note]] = relationship(back_populates="project")
    goals: Mapped[list[Goal]] = relationship(back_populates="project", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        total = len(self.goals)
        done = sum(1 for g in self.goals if g.done)
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "status": self.status.value,
            "priority": self.priority.value,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "position": self.position,
            "goals_total": total,
            "goals_done": done,
            "progress": round(done / total * 100) if total else (100 if self.status == ProjectStatus.DONE else 0),
            "created_at": self.created_at.isoformat(),
        }


class Goal(db.Model):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="goals")
    project: Mapped[Project | None] = relationship(back_populates="goals")
    habits: Mapped[list[Habit]] = relationship(back_populates="goal")
    notes: Mapped[list[Note]] = relationship(back_populates="goal")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "done": self.done,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "project_id": self.project_id,
            "habit_ids": [h.id for h in self.habits],
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat(),
        }


class Note(db.Model):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(150))
    content: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    user: Mapped[User] = relationship(back_populates="notes")
    project: Mapped[Project | None] = relationship(back_populates="notes")
    goal: Mapped[Goal | None] = relationship(back_populates="notes")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "tags": self.tags or [],
            "pinned": self.pinned,
            "project_id": self.project_id,
            "goal_id": self.goal_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Habit(db.Model):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(500), default="")
    category: Mapped[str | None] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="habits")
    goal: Mapped[Goal | None] = relationship(back_populates="habits")
    logs: Mapped[list[HabitLog]] = relationship(
        back_populates="habit", cascade="all, delete-orphan", order_by="HabitLog.day"
    )

    def completed_days(self) -> list[date]:
        return [log.day for log in self.logs]

    def to_dict(self, today_: date | None = None) -> dict:
        from .services.stats import current_streak, longest_streak

        days = self.completed_days()
        today_ = today_ or datetime.now(timezone.utc).date()
        # Zona horaria: si el usuario ya está en «mañana» respecto a UTC, su check de hoy cuenta para la racha.
        if days and 0 < (max(days) - today_).days <= 1:
            today_ = max(days)
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "color": self.color,
            "archived": self.archived,
            "goal_id": self.goal_id,
            "dates": [d.isoformat() for d in days],
            "count": len(days),
            "current_streak": current_streak(days, today_),
            "longest_streak": longest_streak(days),
            "done_today": today_ in days,
            "created_at": self.created_at.isoformat(),
        }


class HabitLog(db.Model):
    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "day", name="uq_habit_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)
    habit: Mapped[Habit] = relationship(back_populates="logs")


class MoodEntry(db.Model):
    __tablename__ = "mood_entries"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_mood_user_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)
    mood: Mapped[MoodKind]
    note: Mapped[str] = mapped_column(String(300), default="")
    user: Mapped[User] = relationship(back_populates="moods")

    def to_dict(self) -> dict:
        return {"id": self.id, "date": self.day.isoformat(), "mood": self.mood.value, "note": self.note}


class PomodoroSession(db.Model):
    __tablename__ = "pomodoro_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(10), default="work")  # work | break
    duration_seconds: Mapped[int] = mapped_column(Integer)
    completed: Mapped[bool] = mapped_column(Boolean, default=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    user: Mapped[User] = relationship(back_populates="pomodoros")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "kind": self.kind,
            "duration_seconds": self.duration_seconds,
            "completed": self.completed,
            "started_at": self.started_at.isoformat(),
        }
