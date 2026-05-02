from sqlalchemy import create_engine, Column, Integer, String, LargeBinary, DateTime, ForeignKey, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, '..', 'passwords.db')

engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class MasterAuth(Base):
    __tablename__ = "master_auth"

    id            = Column(Integer, primary_key=True, index=True)
    password_hash = Column(String, nullable=False)
    salt          = Column(LargeBinary, nullable=False)


class Credential(Base):
    __tablename__ = "credentials"

    id          = Column(Integer, primary_key=True, index=True)
    category    = Column(String, nullable=False)
    site_name   = Column(String, nullable=False)
    username    = Column(LargeBinary, nullable=True)
    email       = Column(LargeBinary, nullable=True)
    password    = Column(LargeBinary, nullable=False)
    notes       = Column(LargeBinary, nullable=True)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # lazy='joined' — always load extra_fields in the same query, never after session closes
    extra_fields = relationship("ExtraField", back_populates="credential",
                                cascade="all, delete-orphan", lazy="joined")


class ExtraField(Base):
    __tablename__ = "extra_fields"

    id            = Column(Integer, primary_key=True, index=True)
    credential_id = Column(Integer, ForeignKey("credentials.id"), nullable=False)
    label         = Column(LargeBinary, nullable=False)
    value         = Column(LargeBinary, nullable=False)

    credential = relationship("Credential", back_populates="extra_fields")


def init_db():
    """
    Create all tables that don't yet exist.
    Also handles the case where the DB was created before extra_fields was added —
    SQLAlchemy's create_all is safe to call repeatedly; it skips existing tables
    and only creates missing ones.
    """
    Base.metadata.create_all(bind=engine)

    # Verify extra_fields table actually exists (handles older DBs)
    with engine.connect() as conn:
        tables = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='extra_fields'")
        ).fetchall()
        if not tables:
            # Shouldn't happen after create_all, but force-create as a safety net
            ExtraField.__table__.create(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
