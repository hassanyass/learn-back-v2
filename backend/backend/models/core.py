from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    has_seen_walkthrough: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_progress")
    bkt_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Phase 3: Dynamic session state stored as JSONB.
    # Schema: { current_topic_index, current_point_index, attempt_counter,
    #           user_metaphors: [], what_kido_learned: [], bkt_scores: {},
    #           misconceptions: [] }
    session_state: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        default=None,
        doc="Mutable session progression state managed exclusively by SessionService.",
    )

    # Phase 4: Final feedback report stored as JSONB.
    # Schema: { overall_bkt_score, misconceptions: [], topic_cards: [] }
    feedback_data: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        default=None,
        doc="Generated feedback report saved after session completion.",
    )

    messages: Mapped[list["SessionMessage"]] = relationship(
        "SessionMessage", back_populates="session", lazy="selectin",
    )


class SessionMessage(Base):
    """Individual message within a teaching session.

    sender_role values:
        - 'user'   : student teaching Kido
        - 'kido'   : the Dummy AI companion response
        - 'system' : hints and system-generated scaffolding
    """

    __tablename__ = "session_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("learning_sessions.id"), nullable=False, index=True,
    )
    sender_role: Mapped[str] = mapped_column(String(10), nullable=False)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    widget_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default="TEXT",
        doc="Frontend rendering hint: TEXT | PROCESS | COMPARISON | MATH",
    )
    widget_data: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None,
        doc="Structured widget data (e.g. PROCESS steps, COMPARISON attributes). null for TEXT.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False,
    )

    session: Mapped["LearningSession"] = relationship(
        "LearningSession", back_populates="messages",
    )


class UserMilestone(Base):
    __tablename__ = "user_milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    milestone_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    achieved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SlideDeck(Base):
    __tablename__ = "slide_decks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    pdf_storage_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    raw_extracted_text: Mapped[str] = mapped_column(Text, nullable=False)
    segmented_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
