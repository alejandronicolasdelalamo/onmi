"""hidden notes

Revision ID: c4d5e6f7a8b9
Revises: b3f1c2d4e5a6
Create Date: 2026-11-12 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c4d5e6f7a8b9"
down_revision = "b3f1c2d4e5a6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("notes_lock_hash", sa.String(length=255), nullable=True))
    with op.batch_alter_table("notes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("locked", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade():
    with op.batch_alter_table("notes", schema=None) as batch_op:
        batch_op.drop_column("locked")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("notes_lock_hash")
