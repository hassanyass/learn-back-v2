"""phase6_learning_session_slide_deck_fk

Revision ID: 3a1f5c7d2b9e
Revises: 93898eec0e95
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3a1f5c7d2b9e"
down_revision: Union[str, Sequence[str], None] = "93898eec0e95"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("learning_sessions", sa.Column("slide_deck_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_learning_sessions_slide_deck_id"), "learning_sessions", ["slide_deck_id"], unique=False)
    op.create_foreign_key(
        "fk_learning_sessions_slide_deck_id",
        "learning_sessions",
        "slide_decks",
        ["slide_deck_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_learning_sessions_slide_deck_id", "learning_sessions", type_="foreignkey")
    op.drop_index(op.f("ix_learning_sessions_slide_deck_id"), table_name="learning_sessions")
    op.drop_column("learning_sessions", "slide_deck_id")

