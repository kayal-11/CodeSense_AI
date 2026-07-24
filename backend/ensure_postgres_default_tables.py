import psycopg

DSN = 'postgresql://postgres:kayaladmin1109@127.0.0.1:5432/postgres'

SQL = [
    """
    CREATE TABLE IF NOT EXISTS public.users (
      id SERIAL PRIMARY KEY,
      email VARCHAR NOT NULL UNIQUE,
      full_name VARCHAR NOT NULL,
      hashed_password VARCHAR NOT NULL,
      is_active BOOLEAN DEFAULT TRUE
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_users_id ON public.users (id)",
    "CREATE INDEX IF NOT EXISTS ix_users_email ON public.users (email)",
]

with psycopg.connect(DSN, autocommit=True) as conn:
    with conn.cursor() as cur:
        for stmt in SQL:
            cur.execute(stmt)
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
        print('tables_in_postgres:', [r[0] for r in cur.fetchall()])
