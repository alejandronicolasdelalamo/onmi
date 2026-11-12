"""named calendars with their own viewers, and mood tags

Revision ID: g8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-11-12 23:00:00.000000

"""

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "g8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "calendars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("calendars", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_calendars_user_id"), ["user_id"], unique=False)

    op.create_table(
        "calendar_viewers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("calendar_id", sa.Integer(), nullable=False),
        sa.Column("viewer_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["calendar_id"], ["calendars.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["viewer_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("calendar_id", "viewer_id", name="uq_calendar_viewer"),
    )
    with op.batch_alter_table("calendar_viewers", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_calendar_viewers_calendar_id"), ["calendar_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_calendar_viewers_viewer_id"), ["viewer_id"], unique=False)

    with op.batch_alter_table("calendar_events", schema=None) as batch_op:
        batch_op.add_column(sa.Column("calendar_id", sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f("ix_calendar_events_calendar_id"), ["calendar_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_calendar_events_calendar", "calendars", ["calendar_id"], ["id"], ondelete="CASCADE"
        )

    with op.batch_alter_table("mood_entries", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tags", sa.JSON(), server_default="[]", nullable=False))
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))

    _backfill_calendars()


def _backfill_calendars():
    """Cada usuario con eventos recibe su calendario Personal (privado). Si tenía eventos compartidos, estos pasan a
    un calendario «Compartido» visible para las mismas personas que ya los veían: nadie ve ni pierde nada nuevo."""
    conn = op.get_bind()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    owners = [r[0] for r in conn.execute(sa.text("SELECT DISTINCT user_id FROM calendar_events")).fetchall()]
    for uid in owners:
        conn.execute(
            sa.text(
                "INSERT INTO calendars (user_id, name, color, is_default, created_at) "
                "VALUES (:u, 'Personal', '#6366f1', :t, :now)"
            ),
            {"u": uid, "t": True, "now": now},
        )
        personal = conn.execute(
            sa.text("SELECT id FROM calendars WHERE user_id = :u AND name = 'Personal' ORDER BY id DESC"), {"u": uid}
        ).scalar()
        conn.execute(
            sa.text("UPDATE calendar_events SET calendar_id = :c WHERE user_id = :u AND shared = :s"),
            {"c": personal, "u": uid, "s": False},
        )
        has_shared = conn.execute(
            sa.text("SELECT COUNT(*) FROM calendar_events WHERE user_id = :u AND shared = :s"), {"u": uid, "s": True}
        ).scalar()
        if not has_shared:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO calendars (user_id, name, color, is_default, created_at) "
                "VALUES (:u, 'Shared', '#14b8a6', :t, :now)"
            ),
            {"u": uid, "t": False, "now": now},
        )
        shared_id = conn.execute(
            sa.text("SELECT id FROM calendars WHERE user_id = :u AND name = 'Shared' ORDER BY id DESC"), {"u": uid}
        ).scalar()
        conn.execute(
            sa.text("UPDATE calendar_events SET calendar_id = :c WHERE user_id = :u AND shared = :s"),
            {"c": shared_id, "u": uid, "s": True},
        )
        conn.execute(
            sa.text(
                "INSERT INTO calendar_viewers (calendar_id, viewer_id, created_at) "
                "SELECT :c, viewer_id, :now FROM calendar_shares WHERE owner_id = :u"
            ),
            {"c": shared_id, "u": uid, "now": now},
        )


def downgrade():
    with op.batch_alter_table("mood_entries", schema=None) as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("tags")
    with op.batch_alter_table("calendar_events", schema=None) as batch_op:
        batch_op.drop_constraint("fk_calendar_events_calendar", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_calendar_events_calendar_id"))
        batch_op.drop_column("calendar_id")
    with op.batch_alter_table("calendar_viewers", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_calendar_viewers_viewer_id"))
        batch_op.drop_index(batch_op.f("ix_calendar_viewers_calendar_id"))
    op.drop_table("calendar_viewers")
    with op.batch_alter_table("calendars", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_calendars_user_id"))
    op.drop_table("calendars")
