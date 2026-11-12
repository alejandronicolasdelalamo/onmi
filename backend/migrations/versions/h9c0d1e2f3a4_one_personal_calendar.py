"""one personal calendar per user (repairs duplicates created by simultaneous first requests)

Revision ID: h9c0d1e2f3a4
Revises: g8b9c0d1e2f3
Create Date: 2026-11-13 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "h9c0d1e2f3a4"
down_revision = "g8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    dup_users = [
        r[0]
        for r in conn.execute(
            sa.text("SELECT user_id FROM calendars WHERE is_default = :t GROUP BY user_id HAVING COUNT(*) > 1"),
            {"t": True},
        ).fetchall()
    ]
    for uid in dup_users:
        ids = [
            r[0]
            for r in conn.execute(
                sa.text("SELECT id FROM calendars WHERE user_id = :u AND is_default = :t ORDER BY id"),
                {"u": uid, "t": True},
            ).fetchall()
        ]
        keep, extras = ids[0], ids[1:]
        for extra in extras:  # los eventos de los calendarios sobrantes pasan al que se conserva
            conn.execute(
                sa.text("UPDATE calendar_events SET calendar_id = :k WHERE calendar_id = :e"), {"k": keep, "e": extra}
            )
            conn.execute(sa.text("DELETE FROM calendar_viewers WHERE calendar_id = :e"), {"e": extra})
            conn.execute(sa.text("DELETE FROM calendars WHERE id = :e"), {"e": extra})
    with op.batch_alter_table("calendars", schema=None) as batch_op:
        batch_op.create_index(
            "uq_calendar_one_default_per_user",
            ["user_id"],
            unique=True,
            sqlite_where=sa.text("is_default"),
            postgresql_where=sa.text("is_default"),
        )


def downgrade():
    with op.batch_alter_table("calendars", schema=None) as batch_op:
        batch_op.drop_index("uq_calendar_one_default_per_user")
