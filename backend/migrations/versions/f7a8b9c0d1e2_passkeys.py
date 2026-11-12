"""passkeys

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-11-12 22:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "passkeys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("credential_id", sa.String(length=512), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("passkeys", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_passkeys_credential_id"), ["credential_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_passkeys_user_id"), ["user_id"], unique=False)


def downgrade():
    with op.batch_alter_table("passkeys", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_passkeys_user_id"))
        batch_op.drop_index(batch_op.f("ix_passkeys_credential_id"))
    op.drop_table("passkeys")
