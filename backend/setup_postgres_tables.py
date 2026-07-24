import psycopg
from sqlalchemy import create_engine, text

DATABASE_ADMIN_URL = 'postgresql://postgres:kayaladmin1109@127.0.0.1:5432/postgres'
APP_DATABASE_URL = 'postgresql+psycopg://postgres:kayaladmin1109@127.0.0.1:5432/codesense_ai'


def ensure_database() -> None:
    with psycopg.connect(DATABASE_ADMIN_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = 'codesense_ai'")
            exists = cur.fetchone() is not None
            if not exists:
                cur.execute('CREATE DATABASE codesense_ai')
            print(f'database codesense_ai exists: {exists or True}')


def ensure_tables() -> None:
    from database.session import init_db  # imports settings and uses .env DATABASE_URL

    init_db()
    engine = create_engine(APP_DATABASE_URL)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
        ).fetchall()
        print('tables:', [row[0] for row in rows])


if __name__ == '__main__':
    ensure_database()
    ensure_tables()
