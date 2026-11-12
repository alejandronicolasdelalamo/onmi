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
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    false,
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
    # Frase corta que ven tus compañeros en tu mini perfil.
    bio: Mapped[str] = mapped_column(String(160), default="", server_default="")
    locale: Mapped[str] = mapped_column(String(5), default="en")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    # Opt-in: el coach semanal se redacta con Claude (datos agregados). Desactivado = redactor local.
    ai_coach_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Código personal para que otras personas te pidan ser compañeros de hábitos (se puede regenerar).
    invite_code: Mapped[str | None] = mapped_column(String(12), unique=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    # Modo enfoque del pomodoro: hasta esta hora (UTC) ONMi no envía notificaciones push.
    focus_until: Mapped[datetime | None] = mapped_column(DateTime)
    # Contraseña propia para las notas ocultas (distinta de la de la cuenta). Vacío = sin notas ocultas.
    notes_lock_hash: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    notes: Mapped[list[Note]] = relationship(back_populates="user", cascade="all, delete-orphan")
    note_images: Mapped[list[NoteImage]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list[UserSession]] = relationship(back_populates="user", cascade="all, delete-orphan")
    passkeys: Mapped[list[Passkey]] = relationship(back_populates="user", cascade="all, delete-orphan")
    calendars: Mapped[list[Calendar]] = relationship(back_populates="user", cascade="all, delete-orphan")
    projects: Mapped[list[Project]] = relationship(back_populates="user", cascade="all, delete-orphan")
    goals: Mapped[list[Goal]] = relationship(back_populates="user", cascade="all, delete-orphan")
    habits: Mapped[list[Habit]] = relationship(back_populates="user", cascade="all, delete-orphan")
    moods: Mapped[list[MoodEntry]] = relationship(back_populates="user", cascade="all, delete-orphan")
    pomodoros: Mapped[list[PomodoroSession]] = relationship(back_populates="user", cascade="all, delete-orphan")
    tokens: Mapped[list[AuthToken]] = relationship(back_populates="user", cascade="all, delete-orphan")
    push_subscriptions: Mapped[list[PushSubscription]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    # Al borrar la cuenta desaparecen sus relaciones y ánimos aunque la base no aplique ON DELETE CASCADE (SQLite).
    friendships_requested: Mapped[list[Friendship]] = relationship(
        foreign_keys="Friendship.requester_id", cascade="all, delete-orphan"
    )
    friendships_received: Mapped[list[Friendship]] = relationship(
        foreign_keys="Friendship.addressee_id", cascade="all, delete-orphan"
    )
    cheers_sent: Mapped[list[Cheer]] = relationship(foreign_keys="Cheer.from_user_id", cascade="all, delete-orphan")
    cheers_received: Mapped[list[Cheer]] = relationship(foreign_keys="Cheer.to_user_id", cascade="all, delete-orphan")
    calendar_events: Mapped[list[CalendarEvent]] = relationship(back_populates="user", cascade="all, delete-orphan")
    calendar_shares_given: Mapped[list[CalendarShare]] = relationship(
        foreign_keys="CalendarShare.owner_id", cascade="all, delete-orphan"
    )
    calendar_shares_received: Mapped[list[CalendarShare]] = relationship(
        foreign_keys="CalendarShare.viewer_id", cascade="all, delete-orphan"
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return bool(self.password_hash) and check_password_hash(self.password_hash, password)

    def set_notes_lock(self, password: str) -> None:
        self.notes_lock_hash = generate_password_hash(password)

    def check_notes_lock(self, password: str) -> bool:
        return bool(self.notes_lock_hash) and check_password_hash(self.notes_lock_hash, password)

    @property
    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > _now())

    @property
    def in_focus(self) -> bool:
        return bool(self.focus_until and self.focus_until > _now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role.value,
            "avatar": self.avatar,
            "bio": self.bio,
            "locale": self.locale,
            "email_verified": self.email_verified,
            "is_demo": self.is_demo,
            "ai_coach_enabled": self.ai_coach_enabled,
            "focus_until": self.focus_until.isoformat() + "Z" if self.in_focus else None,
            "has_password": bool(self.password_hash),
            "notes_lock_enabled": bool(self.notes_lock_hash),
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
    # Privado por defecto: solo lo ven tus compañeros en tu mini perfil si lo marcas.
    shared: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="goals")
    project: Mapped[Project | None] = relationship(back_populates="goals")
    habits: Mapped[list[Habit]] = relationship(back_populates="goal")
    notes: Mapped[list[Note]] = relationship(back_populates="goal")
    milestones: Mapped[list[GoalMilestone]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="GoalMilestone.position, GoalMilestone.id"
    )

    def to_dict(self) -> dict:
        done_ms = sum(1 for m in self.milestones if m.done)
        return {
            "id": self.id,
            "title": self.title,
            "milestones": [m.to_dict() for m in self.milestones],
            "milestones_done": done_ms,
            # Lo que alimenta la meta: hábitos y notas (las ocultas o en la papelera no se nombran).
            "linked": {
                "habits": [{"id": h.id, "name": h.name} for h in self.habits if not h.archived],
                "notes": [{"id": n.id, "title": n.title} for n in self.notes if not n.locked and n.deleted_at is None],
            },
            "description": self.description,
            "done": self.done,
            "shared": self.shared,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "project_id": self.project_id,
            "habit_ids": [h.id for h in self.habits],
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat(),
        }


class GoalMilestone(db.Model):
    """Hito de una meta: un paso concreto que se marca como hecho."""

    __tablename__ = "goal_milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    goal: Mapped[Goal] = relationship(back_populates="milestones")

    def to_dict(self) -> dict:
        return {"id": self.id, "title": self.title, "done": self.done, "position": self.position}


class UserSession(db.Model):
    """Un dispositivo con la sesión iniciada. Permite verlas y cerrarlas una a una."""

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_jti: Mapped[str | None] = mapped_column(String(64), index=True)
    device: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="sessions")


class Passkey(db.Model):
    """Credencial WebAuthn (Face ID, Touch ID, llave de seguridad…) con la que se inicia sesión sin contraseña."""

    __tablename__ = "passkeys"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    credential_id: Mapped[str] = mapped_column(String(512), unique=True, index=True)  # base64url
    public_key: Mapped[bytes] = mapped_column(LargeBinary)
    sign_count: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="passkeys")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
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
    # Nota oculta: el servidor no da título, contenido ni etiquetas hasta desbloquearla con la contraseña de notas.
    locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Papelera: una nota borrada se conserva 30 días (deleted_at) antes de eliminarse de verdad.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    user: Mapped[User] = relationship(back_populates="notes")
    project: Mapped[Project | None] = relationship(back_populates="notes")
    goal: Mapped[Goal | None] = relationship(back_populates="notes")

    def to_dict(self, reveal: bool = False) -> dict:
        """Una nota oculta solo muestra su contenido si `reveal` (el cliente presentó el desbloqueo vigente)."""
        hidden = self.locked and not reveal
        return {
            "id": self.id,
            "title": "" if hidden else self.title,
            "content": "" if hidden else self.content,
            "tags": [] if hidden else (self.tags or []),
            "pinned": self.pinned,
            "locked": self.locked,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "project_id": None if hidden else self.project_id,
            "goal_id": None if hidden else self.goal_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class NoteImage(db.Model):
    """Imagen pegada en una nota (ya reducida por el cliente). Se enlaza con la nota al guardarla."""

    __tablename__ = "note_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    note_id: Mapped[int | None] = mapped_column(ForeignKey("notes.id", ondelete="SET NULL"), index=True)
    mime: Mapped[str] = mapped_column(String(20))
    size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="note_images")


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
    # Frecuencia: 7 = todos los días; 1-6 = tantas veces por semana (la racha se cuenta en semanas).
    target_per_week: Mapped[int] = mapped_column(Integer, default=7, server_default="7")
    # Visible para tus compañeros aceptados (solo nombre, color, racha y progreso). Apagado por defecto.
    shared: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    reminder_time: Mapped[str | None] = mapped_column(String(5))  # "HH:MM" en la zona horaria del usuario
    last_reminded_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="habits")
    goal: Mapped[Goal | None] = relationship(back_populates="habits")
    logs: Mapped[list[HabitLog]] = relationship(
        back_populates="habit", cascade="all, delete-orphan", order_by="HabitLog.day"
    )

    def completed_days(self) -> list[date]:
        return [log.day for log in self.logs]

    def to_dict(self, today_: date | None = None) -> dict:
        from .services.stats import habit_streaks, week_count

        days = self.completed_days()
        today_ = today_ or datetime.now(timezone.utc).date()
        # Zona horaria: si el usuario ya está en «mañana» respecto a UTC, su check de hoy cuenta para la racha.
        if days and 0 < (max(days) - today_).days <= 1:
            today_ = max(days)
        current, longest, unit = habit_streaks(days, self.target_per_week, today_)
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "color": self.color,
            "archived": self.archived,
            "goal_id": self.goal_id,
            "target_per_week": self.target_per_week,
            "shared": self.shared,
            "reminder_time": self.reminder_time,
            "dates": [d.isoformat() for d in days],
            "count": len(days),
            "week_count": week_count(days, today_),
            "streak_unit": unit,
            "current_streak": current,
            "longest_streak": longest,
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
    # Qué ha influido en el día (sueño, trabajo, familia…): sirve para ver qué te sube o te baja el ánimo.
    tags: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    user: Mapped[User] = relationship(back_populates="moods")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "date": self.day.isoformat(),
            "mood": self.mood.value,
            "note": self.note,
            "tags": self.tags or [],
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }


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


class PushSubscription(db.Model):
    """Suscripción Web Push de un navegador o dispositivo del usuario (para los recordatorios)."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String(600), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    user: Mapped[User] = relationship(back_populates="push_subscriptions")

    def to_webpush(self) -> dict:
        return {"endpoint": self.endpoint, "keys": {"p256dh": self.p256dh, "auth": self.auth}}


class CoachReview(db.Model):
    """Revisión semanal del coach (una por usuario y semana; se guarda para no regenerarla ni gastar de más)."""

    __tablename__ = "coach_reviews"
    __table_args__ = (UniqueConstraint("user_id", "week_start", name="uq_coach_user_week"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    week_start: Mapped[date] = mapped_column(Date)  # lunes de la semana revisada
    locale: Mapped[str] = mapped_column(String(5), default="en")
    source: Mapped[str] = mapped_column(String(10))  # "claude" | "local"
    model: Mapped[str | None] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "source": self.source,
            "model": self.model,
            "locale": self.locale,
            "week_start": self.week_start.isoformat(),
            "created_at": self.created_at.isoformat(),
        }


class Friendship(db.Model):
    """Relación entre dos personas. Una fila por pareja; pendiente hasta que acepta quien dio el código."""

    __tablename__ = "friendships"

    id: Mapped[int] = mapped_column(primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    addressee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    pair_key: Mapped[str] = mapped_column(String(32), unique=True)  # "menor-mayor": impide duplicados cruzados
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending | accepted
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime)

    @staticmethod
    def key_for(a: int, b: int) -> str:
        return f"{min(a, b)}-{max(a, b)}"

    def other_id(self, me: int) -> int:
        return self.addressee_id if self.requester_id == me else self.requester_id


class Cheer(db.Model):
    """Ánimo enviado a un compañero. Como mucho uno por día y pareja (evita el acoso por notificaciones)."""

    __tablename__ = "cheers"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", "day", name="uq_cheer_pair_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    habit_id: Mapped[int | None] = mapped_column(ForeignKey("habits.id", ondelete="SET NULL"))
    day: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class CalendarEvent(db.Model):
    """Evento del calendario, único o repetido. Privado salvo que lo marques `shared` (y compartas el calendario)."""

    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str] = mapped_column(String(1000), default="", server_default="")
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    start_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[str | None] = mapped_column(String(5))  # "HH:MM"; null = todo el día
    duration_min: Mapped[int | None] = mapped_column(Integer)
    # none | daily | weekdays (los días elegidos) | weekly_count (N días por semana, los que quieras)
    repeat: Mapped[str] = mapped_column(String(12), default="none", server_default="none")
    weekdays: Mapped[str] = mapped_column(String(13), default="", server_default="")  # "0,2,4" (lunes = 0)
    per_week: Mapped[int | None] = mapped_column(Integer)
    every_weeks: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    until: Mapped[date | None] = mapped_column(Date)
    # Obsoleto: ahora se comparte por calendario (ver `Calendar`). Se conserva la columna por las migraciones antiguas.
    shared: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    calendar_id: Mapped[int | None] = mapped_column(ForeignKey("calendars.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="calendar_events")
    calendar: Mapped[Calendar | None] = relationship(back_populates="events")
    logs: Mapped[list[EventLog]] = relationship(back_populates="event", cascade="all, delete-orphan")

    @property
    def is_shared(self) -> bool:
        """Un evento es visible para otros solo si su calendario tiene personas con quien se comparte."""
        return bool(self.calendar and self.calendar.viewers)

    def weekday_list(self) -> list[int]:
        return sorted({int(x) for x in self.weekdays.split(",") if x.strip().isdigit() and 0 <= int(x) <= 6})

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "notes": self.notes,
            "color": self.color,
            "start_date": self.start_date.isoformat(),
            "start_time": self.start_time,
            "duration_min": self.duration_min,
            "repeat": self.repeat,
            "weekdays": self.weekday_list(),
            "per_week": self.per_week,
            "every_weeks": self.every_weeks,
            "until": self.until.isoformat() if self.until else None,
            "calendar_id": self.calendar_id,
            "shared": self.is_shared,
        }


class Calendar(db.Model):
    """Un calendario con nombre. El «Personal» (`is_default`) es siempre privado; los demás se comparten con las
    personas que elijas (compañeros aceptados), cada uno con su propia lista."""

    __tablename__ = "calendars"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="calendars")
    events: Mapped[list[CalendarEvent]] = relationship(back_populates="calendar", cascade="all, delete-orphan")
    viewers: Mapped[list[CalendarViewer]] = relationship(back_populates="calendar", cascade="all, delete-orphan")


class CalendarViewer(db.Model):
    """`viewer` puede ver los eventos (sin notas) de un calendario concreto."""

    __tablename__ = "calendar_viewers"
    __table_args__ = (UniqueConstraint("calendar_id", "viewer_id", name="uq_calendar_viewer"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    calendar_id: Mapped[int] = mapped_column(ForeignKey("calendars.id", ondelete="CASCADE"), index=True)
    viewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    calendar: Mapped[Calendar] = relationship(back_populates="viewers")


class EventLog(db.Model):
    """Marca de un día concreto de un evento: hecho o saltado (ese día no cuenta)."""

    __tablename__ = "event_logs"
    __table_args__ = (UniqueConstraint("event_id", "day", name="uq_event_log_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("calendar_events.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(8))  # done | skipped

    event: Mapped[CalendarEvent] = relationship(back_populates="logs")


class CalendarShare(db.Model):
    """`owner` deja ver a `viewer` sus eventos marcados como compartidos."""

    __tablename__ = "calendar_shares"
    __table_args__ = (UniqueConstraint("owner_id", "viewer_id", name="uq_calendar_share"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    viewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
