"""safe_test_mode_slide_deck_metadata

Revision ID: 7b4c2f1aa321
Revises: 3a1f5c7d2b9e
Create Date: 2026-04-24 17:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b4c2f1aa321'
down_revision: Union[str, Sequence[str], None] = '3a1f5c7d2b9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('slide_decks', 'pdf_storage_url', existing_type=sa.String(length=1024), nullable=True)
    op.add_column('slide_decks', sa.Column('file_type', sa.String(length=20), nullable=False, server_default='pdf'))
    op.add_column('slide_decks', sa.Column('has_preview', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('slide_decks', sa.Column('status', sa.String(length=32), nullable=False, server_default='READY'))
    op.add_column('slide_decks', sa.Column('error_message', sa.Text(), nullable=True))

    op.execute("UPDATE slide_decks SET file_type = 'pdf' WHERE file_type IS NULL")
    op.execute("UPDATE slide_decks SET has_preview = CASE WHEN pdf_storage_url IS NOT NULL THEN TRUE ELSE FALSE END")
    op.execute("UPDATE slide_decks SET status = 'READY' WHERE status IS NULL")

    op.alter_column('slide_decks', 'file_type', server_default=None)
    op.alter_column('slide_decks', 'has_preview', server_default=None)
    op.alter_column('slide_decks', 'status', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('slide_decks', 'error_message')
    op.drop_column('slide_decks', 'status')
    op.drop_column('slide_decks', 'has_preview')
    op.drop_column('slide_decks', 'file_type')
    op.alter_column('slide_decks', 'pdf_storage_url', existing_type=sa.String(length=1024), nullable=False)
