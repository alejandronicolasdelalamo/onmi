"""Datos de ejemplo para el usuario demo y para capturas del README."""

from __future__ import annotations

import random
from datetime import datetime, time, timedelta

from ..extensions import db
from ..models import (
    Goal,
    Habit,
    HabitLog,
    MoodEntry,
    MoodKind,
    Note,
    PomodoroSession,
    Priority,
    Project,
    ProjectStatus,
    User,
)
from ..utils import today

DEMO_EMAIL = "demo@onmi.app"

NOTES = [
    (
        "Welcome to ONMi",
        "# Welcome 👋\n\nONMi keeps your **notes, habits, projects and focus time** in one place.\n\n"
        "- Press `Ctrl+K` to open the command palette\n- Pin the notes you use most\n"
        "- Link notes to projects and goals\n",
        ["welcome", "tips"],
        True,
    ),
    (
        "Weekly review template",
        "## Weekly review\n\n1. What went well?\n2. What blocked me?\n3. Next week's top 3\n\n"
        "> Review every Sunday evening.\n",
        ["routine", "planning"],
        True,
    ),
    (
        "Reading list",
        "- [x] Atomic Habits\n- [ ] Deep Work\n- [ ] The Pragmatic Programmer\n",
        ["books"],
        False,
    ),
    (
        "API design ideas",
        "### Endpoints\n\n`GET /habits` -> list with streaks\n\n`POST /habits/:id/toggle` -> mark a day.\n\n"
        "```python\n@bp.post('/toggle')\ndef toggle(): ...\n```\n",
        ["dev", "ideas"],
        False,
    ),
    (
        "Trip to Lisbon",
        "Flights, hotel and a **list of places** to visit.\n\n- Alfama\n- Belém\n- LX Factory\n",
        ["personal", "travel"],
        False,
    ),
    (
        "Meeting notes - sprint planning",
        "Decisions:\n\n- Ship the dashboard first\n- Add E2E tests before release\n",
        ["work"],
        False,
    ),
]

PROJECTS = [
    (
        "Portfolio website",
        "Design and publish my personal site.",
        "Career",
        ProjectStatus.IN_PROGRESS,
        Priority.HIGH,
        14,
    ),
    (
        "Learn TypeScript",
        "Finish the handbook and build 2 small apps.",
        "Learning",
        ProjectStatus.IN_PROGRESS,
        Priority.MEDIUM,
        30,
    ),
    ("Run a 10K", "Follow the 8-week training plan.", "Health", ProjectStatus.TODO, Priority.MEDIUM, 60),
    ("Home budget", "Track expenses and set monthly limits.", "Personal", ProjectStatus.TODO, Priority.LOW, None),
    (
        "Open source contribution",
        "Land a first PR in a project I use.",
        "Career",
        ProjectStatus.TODO,
        Priority.HIGH,
        21,
    ),
    ("Read 12 books", "One book per month, with notes.", "Learning", ProjectStatus.DONE, Priority.LOW, -5),
]

HABITS = [
    ("Morning run", "Health", "#f97316", 0.8),
    ("Read 20 pages", "Learning", "#6366f1", 0.7),
    ("Meditate", "Mindfulness", "#14b8a6", 0.55),
    ("Write code", "Career", "#3b82f6", 0.85),
    ("Drink 2L of water", "Health", "#0ea5e9", 0.72),
]


def seed_demo_data(user: User, seed: int = 7) -> None:
    rng = random.Random(seed)
    t = today()

    projects = []
    for i, (name, desc, cat, status, prio, due) in enumerate(PROJECTS):
        p = Project(
            user_id=user.id,
            name=name,
            description=desc,
            category=cat,
            status=status,
            priority=prio,
            due_date=t + timedelta(days=due) if due is not None else None,
            position=i,
        )
        projects.append(p)
        db.session.add(p)
    db.session.flush()
    # posiciones por columna
    for status in ProjectStatus:
        for i, p in enumerate(x for x in projects if x.status == status):
            p.position = i

    goals = [
        Goal(user_id=user.id, project_id=projects[0].id, title="Design the landing page", done=True),
        Goal(user_id=user.id, project_id=projects[0].id, title="Write case studies", due_date=t + timedelta(days=7)),
        Goal(user_id=user.id, project_id=projects[0].id, title="Deploy to production", due_date=t + timedelta(days=14)),
        Goal(
            user_id=user.id, project_id=projects[1].id, title="Complete the handbook", due_date=t + timedelta(days=20)
        ),
        Goal(
            user_id=user.id, project_id=projects[2].id, title="Run 5K without stopping", due_date=t + timedelta(days=25)
        ),
    ]
    db.session.add_all(goals)
    db.session.flush()

    for i, (title, content, tags, pinned) in enumerate(NOTES):
        db.session.add(
            Note(
                user_id=user.id,
                title=title,
                content=content,
                tags=tags,
                pinned=pinned,
                project_id=projects[0].id if i == 3 else None,
                goal_id=goals[3].id if i == 2 else None,
            )
        )

    for name, cat, color, p in HABITS:
        habit = Habit(
            user_id=user.id,
            name=name,
            category=cat,
            color=color,
            goal_id=goals[4].id if name == "Morning run" else None,
        )
        db.session.add(habit)
        db.session.flush()
        for back in range(0, 110):
            day = t - timedelta(days=back)
            # racha viva reciente + ruido realista antes
            streak_alive = back < 13 and name in {"Write code", "Morning run"}
            weekday_dip = day.weekday() >= 5 and name in {"Write code", "Read 20 pages"}
            if streak_alive or (not weekday_dip and rng.random() < p):
                db.session.add(HabitLog(habit_id=habit.id, day=day))

    moods = [
        MoodKind.HAPPY,
        MoodKind.HAPPY,
        MoodKind.NEUTRAL,
        MoodKind.LOVE,
        MoodKind.SAD,
        MoodKind.MAD,
        MoodKind.HAPPY,
    ]
    for back in range(0, 35):
        if rng.random() < 0.85:
            db.session.add(MoodEntry(user_id=user.id, day=t - timedelta(days=back), mood=rng.choice(moods)))

    for back in range(0, 14):
        day = t - timedelta(days=back)
        for k in range(rng.randint(1, 5) if back else 2):
            start = datetime.combine(day, time(8 + k * 2, rng.randint(0, 40)))
            db.session.add(
                PomodoroSession(
                    user_id=user.id,
                    kind="work",
                    duration_seconds=25 * 60,
                    project_id=projects[rng.randint(0, 1)].id,
                    started_at=start,
                )
            )
    db.session.commit()


def ensure_demo_user() -> User:
    user = db.session.scalar(db.select(User).filter_by(email=DEMO_EMAIL))
    if user is None:
        user = User(name="Demo User", email=DEMO_EMAIL, is_demo=True, email_verified=True, avatar="male")
        db.session.add(user)
        db.session.commit()
    if not db.session.scalar(db.select(db.func.count(Habit.id)).filter_by(user_id=user.id)):
        seed_demo_data(user)
    return user
