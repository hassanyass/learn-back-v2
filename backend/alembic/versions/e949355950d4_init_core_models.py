"""init_core_models

Revision ID: e949355950d4
Revises: 
Create Date: 2026-04-21 18:47:08.181432

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e949355950d4'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('username', sa.String(length=100), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('has_seen_walkthrough', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    op.create_table('learning_sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('topic', sa.String(length=255), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('bkt_score', sa.Float(), nullable=True),
    sa.Column('start_time', sa.DateTime(), nullable=True),
    sa.Column('end_time', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_learning_sessions_id'), 'learning_sessions', ['id'], unique=False)
    op.create_index(op.f('ix_learning_sessions_user_id'), 'learning_sessions', ['user_id'], unique=False)
    op.create_table('slide_decks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('original_filename', sa.String(length=255), nullable=False),
    sa.Column('pdf_storage_url', sa.String(length=1024), nullable=False),
    sa.Column('raw_extracted_text', sa.Text(), nullable=False),
    sa.Column('segmented_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_slide_decks_id'), 'slide_decks', ['id'], unique=False)
    op.create_index(op.f('ix_slide_decks_user_id'), 'slide_decks', ['user_id'], unique=False)
    op.create_table('user_milestones',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('milestone_code', sa.String(length=64), nullable=False),
    sa.Column('achieved_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_milestones_id'), 'user_milestones', ['id'], unique=False)
    op.create_index(op.f('ix_user_milestones_milestone_code'), 'user_milestones', ['milestone_code'], unique=False)
    op.create_index(op.f('ix_user_milestones_user_id'), 'user_milestones', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_user_milestones_user_id'), table_name='user_milestones')
    op.drop_index(op.f('ix_user_milestones_milestone_code'), table_name='user_milestones')
    op.drop_index(op.f('ix_user_milestones_id'), table_name='user_milestones')
    op.drop_table('user_milestones')
    op.drop_index(op.f('ix_slide_decks_user_id'), table_name='slide_decks')
    op.drop_index(op.f('ix_slide_decks_id'), table_name='slide_decks')
    op.drop_table('slide_decks')
    op.drop_index(op.f('ix_learning_sessions_user_id'), table_name='learning_sessions')
    op.drop_index(op.f('ix_learning_sessions_id'), table_name='learning_sessions')
    op.drop_table('learning_sessions')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
