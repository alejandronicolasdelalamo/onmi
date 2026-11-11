"""focus mode

Revision ID: b3f1c2d4e5a6
Revises: 626ff1e188ab
Create Date: 2026-11-11 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b3f1c2d4e5a6"
down_revision = "626ff1e188ab"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("focus_until", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("focus_until")
