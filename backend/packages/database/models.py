"""SQLAlchemy models — mirrors current SQLite schema."""
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from packages.database.db import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notion_page_id = Column(String, default="")
    name = Column(String, default="", nullable=False)
    telegram_nick = Column(String, default="")
    telegram_id = Column(String, default="")
    phone = Column(String, default="")
    status = Column(String, default="Контакт")
    source = Column(String, default="")
    last_account = Column(String, default="")
    last_contact = Column(String, default="")
    next_step = Column(String, default="")
    summary = Column(Text, default="")
    follow_up_date = Column(String, default="")
    created_at = Column(String, default="")
    updated_at = Column(String, default="")

    deals = relationship("Deal", back_populates="client")
    tasks = relationship("Task", back_populates="client")
    test_results = relationship("TestResult", back_populates="client")
    notes = relationship("Note", back_populates="client")
    telegram_messages = relationship("TelegramMessage", back_populates="client")


class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notion_page_id = Column(String, default="")
    client_id = Column(Integer, ForeignKey("clients.id"))
    title = Column(String, nullable=False)
    status = Column(String, default="Ожидает")
    amount = Column(Float, default=0)
    paid = Column(Float, default=0)
    purchase_date = Column(String, default="")
    created_at = Column(String, default="")
    updated_at = Column(String, default="")

    client = relationship("Client", back_populates="deals")


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    telegram_id = Column(String, default="")
    name = Column(String, default="")
    phone = Column(String, default="")
    age = Column(Integer, nullable=True)
    test_type = Column(String, default="female")
    freedom_score = Column(Integer, default=0)
    sexuality_score = Column(Integer, default=0)
    diagnosis = Column(String, default="")
    utm_source = Column(String, default="")
    answers = Column(Text, default="[]")
    created_at = Column(String, default="")

    client = relationship("Client", back_populates="test_results")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    title = Column(String, nullable=False)
    type = Column(String, default="follow_up")
    due_date = Column(String, default="")
    status = Column(String, default="pending")
    created_at = Column(String, default="")

    client = relationship("Client", back_populates="tasks")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    text = Column(Text, nullable=False)
    created_at = Column(String, default="")

    client = relationship("Client", back_populates="notes")


class TelegramMessage(Base):
    __tablename__ = "telegram_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    telegram_id = Column(String, default="")
    sender_type = Column(String, default="client")
    text = Column(Text, default="")
    created_at = Column(String, default="")

    client = relationship("Client", back_populates="telegram_messages")

    __table_args__ = (
        Index("idx_tg_client", "client_id"),
        Index("idx_tg_created", "created_at"),
    )


class MiraSession(Base):
    __tablename__ = "mira_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, default="Новый чат")
    created_at = Column(String, default="")
    updated_at = Column(String, default="")

    messages = relationship("MiraMessage", back_populates="session")


class MiraMessage(Base):
    __tablename__ = "mira_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("mira_sessions.id"))
    role = Column(String, default="user")
    content = Column(Text, default="")
    created_at = Column(String, default="")

    session = relationship("MiraSession", back_populates="messages")

    __table_args__ = (
        Index("idx_mira_session", "session_id"),
    )


class QuizMeta(Base):
    __tablename__ = "quiz_meta"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class QuizEvent(Base):
    __tablename__ = "quiz_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(String, default="")
    metadata = Column(Text, default="{}")
    created_at = Column(String, default="")
