from sqlalchemy import create_engine, Column, Integer, String, LargeBinary, DateTime, ForeignKey, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
import os
import sys

# ── DB path resolution ─────────────────────────────────────────
# When running as a PyInstaller .exe:  sys.frozen = True
#   → DB sits next to the .exe (sys.executable), so the user's
#     data persists and is never lost between runs.
# When running in dev (python app.py):
#   → DB sits at the project root, same as before.
if getattr(sys, 'frozen', False):
    # Packaged .exe — place passwords.db next to the executable
    _BASE = os.path.dirname(sys.executable)
else:
    # Dev — place passwords.db at the project root
    _BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

DB_PATH = os.path.join(_BASE, 'passwords.db')
DB_PATH = os.path.normpath(DB_PATH)  # clean up any .. in the path

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
    Safe to call on every startup — skips tables that already exist.
    Also handles older DBs created before extra_fields was added.
    """
    Base.metadata.create_all(bind=engine)

    # Safety net: explicitly verify extra_fields exists (handles pre-existing DBs)
    with engine.connect() as conn:
        tables = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='extra_fields'")
        ).fetchall()
        if not tables:
            ExtraField.__table__.create(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
