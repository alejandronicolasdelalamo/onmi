"""trash and note images

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-11-12 18:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("notes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f("ix_notes_deleted_at"), ["deleted_at"], unique=False)

    op.create_table(
        "note_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("note_id", sa.Integer(), nullable=True),
        sa.Column("mime", sa.String(length=20), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("note_images", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_note_images_note_id"), ["note_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_note_images_user_id"), ["user_id"], unique=False)


def downgrade():
    with op.batch_alter_table("note_images", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_note_images_user_id"))
        batch_op.drop_index(batch_op.f("ix_note_images_note_id"))
    op.drop_table("note_images")
    with op.batch_alter_table("notes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notes_deleted_at"))
        batch_op.drop_column("deleted_at")
