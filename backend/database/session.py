from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from config.settings import settings
from database.base import Base

engine_options: dict[str, object] = {'pool_pre_ping': True}
if settings.database_url.startswith('sqlite:///'):
    engine_options['connect_args'] = {'check_same_thread': False}
else:
    engine_options['pool_size'] = settings.db_pool_size
    engine_options['max_overflow'] = settings.db_max_overflow
    engine_options['pool_timeout'] = settings.db_pool_timeout
    engine_options['pool_recycle'] = settings.db_pool_recycle

engine = create_engine(settings.database_url, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@contextmanager
def session_scope() -> Session:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError:
        db.rollback()
        raise
    finally:
        db.close()


def verify_connection() -> None:
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
    except SQLAlchemyError as exc:
        raise RuntimeError('Database connection failed') from exc


def init_db() -> None:
    from app.models.user import User  # noqa: F401

    Base.metadata.create_all(bind=engine)
